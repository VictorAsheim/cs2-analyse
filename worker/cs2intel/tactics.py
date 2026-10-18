"""Attack-pattern classification: executes, rushes, defaults, splits, fakes.

Everything in this module is inferred, not observed. The demo records where
players were and when; it does not record what they intended. A label here is
a reading of a movement pattern against a stated threshold, so every label
carries the threshold that produced it, the second it was decided, and the
evidence behind it. A round that matches no pattern cleanly is returned as
unclear rather than forced into the nearest bucket.

Where the demo already answers a question, it is read rather than inferred.
The site an attack went to is the clearest case: a bomb plant records it
exactly, so a planted round takes its target from the plant and only unplanted
rounds have their target inferred. That split matters for trust, and it is
reported per round as `target_source`.

The vocabulary is limited by what areas exist. With bombsites resolved but no
callouts, arrival at a site is measurable and a named route is not, so
approach direction is reported as a compass bearing from the site rather than
as an invented route name.
"""
from __future__ import annotations

import math

import pandas as pd

from .areas import Bombsite
from .extract import Match
from .metrics import rate

# --- thresholds ---------------------------------------------------------------
# Arrival needs a real group, but attackers get traded down on the way in, so
# the requirement is relative to how many are still alive as well as absolute.
# Demanding a fixed three would score a successful 2-man hit as "never arrived".
ARRIVE_MIN_PLAYERS = 2
ARRIVE_SHARE_OF_LIVING = 0.5

# The approach zone extends past the site, because an attack is decided at the
# entry point rather than on the plant spot.
APPROACH_MARGIN = 400.0

# Pace, in seconds from freeze-time end to arrival.
RUSH_SECONDS = 25.0
SLOW_SECONDS = 60.0

# Utility counts as supporting an arrival if it lands near the site inside this
# window around the arrival moment.
UTILITY_WINDOW_BEFORE = 12.0
UTILITY_WINDOW_AFTER = 5.0
UTILITY_NEAR_SITE = 900.0
# Smokes and fire block defenders' angles; an execute needs at least this many.
EXECUTE_MIN_BLOCKING_UTILITY = 2

# Two approach bearings this far apart are treated as separate directions.
SPLIT_BEARING_DEGREES = 60.0

# A fake needs sustained presence at the other site, not a player crossing it
# in transit: this many attackers, held for this long, plus utility spent there.
FAKE_MIN_PLAYERS = 2
FAKE_MIN_SECONDS = 4.0
FAKE_MIN_UTILITY = 1

# A lurker is this far from the arriving group when the attack goes in.
LURK_DISTANCE = 1800.0

THRESHOLDS = {
    "arrive_min_players": ARRIVE_MIN_PLAYERS,
    "arrive_share_of_living": ARRIVE_SHARE_OF_LIVING,
    "approach_margin_units": APPROACH_MARGIN,
    "rush_seconds": RUSH_SECONDS,
    "slow_seconds": SLOW_SECONDS,
    "utility_window_before_seconds": UTILITY_WINDOW_BEFORE,
    "utility_window_after_seconds": UTILITY_WINDOW_AFTER,
    "utility_near_site_units": UTILITY_NEAR_SITE,
    "execute_min_blocking_utility": EXECUTE_MIN_BLOCKING_UTILITY,
    "split_bearing_degrees": SPLIT_BEARING_DEGREES,
    "fake_min_players": FAKE_MIN_PLAYERS,
    "fake_min_seconds": FAKE_MIN_SECONDS,
    "fake_min_utility": FAKE_MIN_UTILITY,
    "lurk_distance_units": LURK_DISTANCE,
}


def _bearing(site: Bombsite, x: float, y: float) -> float:
    """Compass bearing in degrees from a site centroid to a position."""
    return math.degrees(math.atan2(y - site.centroid_y, x - site.centroid_x)) % 360.0


def _bearing_clusters(bearings: list[float], gap: float) -> list[list[float]]:
    """Group bearings that sit within `gap` degrees of each other.

    Bearings wrap at 360, so the list is rotated to start after the widest gap
    before splitting; otherwise a group straddling north reads as two
    directions.
    """
    if not bearings:
        return []
    ordered = sorted(bearings)
    if len(ordered) == 1:
        return [ordered]

    gaps = [((ordered[(i + 1) % len(ordered)] - ordered[i]) % 360.0, i)
            for i in range(len(ordered))]
    _, widest = max(gaps)
    rotated = ordered[widest + 1:] + ordered[:widest + 1]

    clusters: list[list[float]] = [[rotated[0]]]
    for b in rotated[1:]:
        if (b - clusters[-1][-1]) % 360.0 <= gap:
            clusters[-1].append(b)
        else:
            clusters.append([b])
    return clusters


def _approach_radius(site: Bombsite) -> float:
    return site.radius + APPROACH_MARGIN


def _occupancy(snapshots: list[tuple[int, pd.DataFrame]],
               site: Bombsite) -> list[tuple[int, int, int]]:
    """(tick, attackers inside the approach zone, attackers alive) per sample."""
    radius = _approach_radius(site)
    out = []
    for tick, snap in snapshots:
        inside = sum(1 for row in snap.itertuples(index=False)
                     if site.distance(float(row.X), float(row.Y)) <= radius)
        out.append((tick, inside, len(snap)))
    return out


def _arrival_tick(occupancy: list[tuple[int, int, int]]) -> int | None:
    """First sample where enough living attackers are inside the zone."""
    for tick, inside, alive in occupancy:
        if alive == 0:
            continue
        if inside >= ARRIVE_MIN_PLAYERS and inside >= alive * ARRIVE_SHARE_OF_LIVING:
            return tick
    return None


def classify_attacks(match: Match, sites: list[Bombsite]) -> dict:
    """Label each T-side round with the attack pattern it matches."""
    if len(match.positions) == 0 or not sites:
        return {"note": "needs sampled positions and resolved bombsites"}

    pos = match.positions
    pos = pos[pos["round"].notna()].copy()
    pos["round"] = pos["round"].astype(int)
    pos = pos[(pos["team_name"] == "TERRORIST") & pos["is_alive"].astype(bool)]

    nades = match.grenades
    if len(nades):
        nades = nades[(nades["phase"] == "detonate") & nades["round"].notna() &
                      nades["x"].notna()].copy()
        nades["round"] = nades["round"].astype(int)

    by_label = {s.label: s for s in sites}
    rounds_out: list[dict] = []
    mismatches: list[dict] = []

    for r in match.rounds:
        attacking = next((clan for clan, side in r.sides.items() if side == "T"), None)
        begin = r.freeze_end_tick or r.start_tick
        in_round = pos[pos["round"] == r.number]
        if in_round.empty:
            continue
        snapshots = sorted(in_round.groupby("tick"), key=lambda kv: kv[0])

        occupancy = {s.label: _occupancy(snapshots, s) for s in sites}
        arrivals = {label: _arrival_tick(occ) for label, occ in occupancy.items()}

        # --- which site the attack went to ----------------------------------
        if r.plant_site in by_label:
            target_label, target_source = r.plant_site, "bomb_plant"
        else:
            reached = {lab: t for lab, t in arrivals.items() if t is not None}
            if reached:
                target_label = min(reached, key=lambda lab: reached[lab])
                target_source = "inferred_from_arrival"
            else:
                # Nobody arrived anywhere: the attack was stopped, or never
                # went in. The positions alone cannot say which.
                rounds_out.append({
                    "round": r.number,
                    "attacking_team": attacking,
                    "target_site": None,
                    "target_source": "none",
                    "pattern": "stopped_before_any_site",
                    "confidence": "high",
                    "arrival_seconds": None,
                    "plant_site": r.plant_site,
                    "won": r.winner == "T",
                    "evidence": {
                        "reason": (f"never had {ARRIVE_MIN_PLAYERS}+ living attackers, "
                                   "and at least half of those alive, inside a site "
                                   "approach zone"),
                        "max_inside_by_site": {
                            lab: max((i for _, i, _ in occ), default=0)
                            for lab, occ in occupancy.items()
                        },
                    },
                })
                continue

        site = by_label[target_label]
        arrival = arrivals.get(target_label)

        # A plant proves the attack reached the site no later than the plant
        # itself, so it bounds arrival in both directions: it supplies one when
        # the movement rule found none, and caps one that lands later than the
        # plant (a lone planter trips the group rule only once help arrives).
        if target_source == "bomb_plant" and r.plant_tick is not None:
            if arrival is None:
                arrival = r.plant_tick
                mismatches.append({
                    "round": r.number, "site": target_label,
                    "note": "plant recorded but no arrival detected; plant tick used",
                    "max_inside": max((i for _, i, _ in occupancy[target_label]),
                                      default=0),
                })
            elif arrival > r.plant_tick:
                mismatches.append({
                    "round": r.number, "site": target_label,
                    "note": "group arrival detected after the plant; capped at the "
                            "plant, which proves an attacker was already there",
                    "detected_seconds_late": round(
                        (arrival - r.plant_tick) / match.tickrate, 1),
                })
                arrival = r.plant_tick

        seconds = round((arrival - begin) / match.tickrate, 1) if arrival else None
        snap_at = next((s for t, s in snapshots if t >= arrival), None) if arrival else None

        record: dict = {
            "round": r.number,
            "attacking_team": attacking,
            "target_site": target_label,
            "target_source": target_source,
            "arrival_seconds": seconds,
            "plant_site": r.plant_site,
            "won": r.winner == "T",
        }

        # --- pace -------------------------------------------------------------
        pace = ("rush" if seconds is not None and seconds <= RUSH_SECONDS
                else "slow" if seconds is not None and seconds >= SLOW_SECONDS
                else "standard")

        # --- utility supporting the arrival -----------------------------------
        support: dict[str, int] = {}
        if len(nades) and arrival:
            window = nades[
                (nades["round"] == r.number) &
                (nades["tick"] >= arrival - UTILITY_WINDOW_BEFORE * match.tickrate) &
                (nades["tick"] <= arrival + UTILITY_WINDOW_AFTER * match.tickrate) &
                (nades["user_team_clan_name"] == attacking)
            ]
            for row in window.itertuples(index=False):
                if site.distance(float(row.x), float(row.y)) <= UTILITY_NEAR_SITE:
                    support[str(row.util)] = support.get(str(row.util), 0) + 1
        blocking = support.get("smoke", 0) + support.get("molotov", 0)
        flashes = support.get("flashbang", 0)
        supported = blocking >= EXECUTE_MIN_BLOCKING_UTILITY
        # "dry" is only honest when nothing at all landed; a smoke and a flash
        # is a light hit, not a dry one.
        support_level = ("executed" if supported
                         else "light" if blocking or flashes
                         else "dry")

        # --- approach directions and lurkers ----------------------------------
        bearings: list[float] = []
        lurkers: list[dict] = []
        if snap_at is not None:
            radius = _approach_radius(site)
            arriving = [row for row in snap_at.itertuples(index=False)
                        if site.distance(float(row.X), float(row.Y)) <= radius]
            bearings = [_bearing(site, float(p.X), float(p.Y)) for p in arriving]
            if arriving:
                cx = sum(float(p.X) for p in arriving) / len(arriving)
                cy = sum(float(p.Y) for p in arriving) / len(arriving)
                ids = {str(p.steamid) for p in arriving}
                lurkers = [
                    {"name": str(row.name), "steamid": str(row.steamid),
                     "distance_from_group": round(
                         math.dist((float(row.X), float(row.Y)), (cx, cy)), 0)}
                    for row in snap_at.itertuples(index=False)
                    if str(row.steamid) not in ids
                    and math.dist((float(row.X), float(row.Y)), (cx, cy)) >= LURK_DISTANCE
                ]
        clusters = _bearing_clusters(bearings, SPLIT_BEARING_DEGREES)
        is_split = len(clusters) >= 2

        # --- a fake at another site before the real arrival --------------------
        fake_at = None
        if arrival:
            min_samples = max(1, int(FAKE_MIN_SECONDS * match.tickrate /
                                     (snapshots[1][0] - snapshots[0][0])
                                     if len(snapshots) > 1 else 1))
            for other in sites:
                if other.label == target_label:
                    continue
                run = held = 0
                for tick, inside, _ in occupancy[other.label]:
                    if tick >= arrival:
                        break
                    run = run + 1 if inside >= FAKE_MIN_PLAYERS else 0
                    held = max(held, run)
                if held < min_samples:
                    continue
                util_there = 0
                if len(nades):
                    earlier = nades[(nades["round"] == r.number) &
                                    (nades["tick"] < arrival) &
                                    (nades["user_team_clan_name"] == attacking)]
                    util_there = sum(
                        1 for row in earlier.itertuples(index=False)
                        if other.distance(float(row.x), float(row.y)) <= UTILITY_NEAR_SITE)
                if util_there >= FAKE_MIN_UTILITY:
                    fake_at = {"site": other.label,
                               "seconds_held": round(held * (snapshots[1][0] - snapshots[0][0])
                                                     / match.tickrate, 1),
                               "utility_landed": util_there}
                    break

        # --- label --------------------------------------------------------------
        if fake_at:
            pattern = f"fake_{fake_at['site']}_then_{target_label}"
        elif is_split:
            pattern = f"split_{target_label}"
        elif pace == "rush":
            pattern = f"rush_{target_label}"
        elif supported:
            pattern = f"execute_{target_label}"
        elif pace == "slow":
            pattern = f"slow_default_{target_label}"
        elif support_level == "light":
            pattern = f"light_hit_{target_label}"
        else:
            pattern = f"dry_hit_{target_label}"

        # Confidence reflects how cleanly the thresholds were met and whether
        # the target was read from the demo or inferred, not how likely the
        # reading is to be right in any absolute sense.
        margin = (min(abs(seconds - RUSH_SECONDS), abs(seconds - SLOW_SECONDS))
                  if seconds is not None else 0.0)
        if target_source == "inferred_from_arrival" and not (supported or fake_at):
            confidence = "low"
        elif (supported or is_split or fake_at) and margin > 5:
            confidence = "high"
        elif margin < 3:
            confidence = "low"
        else:
            confidence = "medium"

        record.update({
            "pattern": pattern,
            "pace": pace,
            "confidence": confidence,
            "evidence": {
                "arriving_players": len(bearings),
                "approach_bearings": [round(b) for b in sorted(bearings)],
                "approach_directions": len(clusters),
                "utility_supporting": support,
                "blocking_utility": blocking,
                "support_level": support_level,
                "fake_before": fake_at,
                "lurkers": lurkers,
                "arrival_tick": arrival,
            },
        })
        rounds_out.append(record)

    return {
        "method": ("the site an attack targeted is read from the bomb plant where "
                   "one exists and inferred from arrival otherwise; pace, utility "
                   "support, splits and fakes are inferred from movement against "
                   "fixed thresholds. The demo does not record intent, so these "
                   "are readings, not observations"),
        "thresholds": THRESHOLDS,
        "arrival_rule_misses": mismatches,
        "rounds": rounds_out,
        "by_team": _aggregate(rounds_out, match),
    }


# The rule names are built from thresholds, not from how anyone talks about
# the game. These are the readable forms, shipped with the data so the pages
# and the findings use one vocabulary rather than each keeping a copy.
PATTERN_LABELS = {
    "split": "split mot {site}",
    "rush": "rush mot {site}",
    "execute": "execute mot {site} (røyk og molotov)",
    "light_hit": "lett støttet treff mot {site}",
    "dry_hit": "treff mot {site} uten utility",
    "slow_default": "sen default mot {site}",
}


def pattern_label(pattern: str) -> str:
    """A rule name as a phrase: 'split_A' becomes 'split mot A'."""
    if pattern == "stopped_before_any_site":
        return "stoppet før de nådde en site"
    if pattern.startswith("fake_") and "_then_" in pattern:
        decoy, target = pattern.removeprefix("fake_").split("_then_", 1)
        return f"fake mot {decoy}, så {target}"
    for prefix, template in PATTERN_LABELS.items():
        if pattern.startswith(prefix + "_"):
            return template.format(site=pattern.removeprefix(prefix + "_"))
    return pattern


def _aggregate(records: list[dict], match: Match) -> dict:
    """Pattern frequency and conversion per attacking team."""
    out: dict = {}
    for team in sorted(match.teams):
        mine = [r for r in records if r["attacking_team"] == team]
        if not mine:
            continue
        patterns: dict[str, dict] = {}
        for r in mine:
            slot = patterns.setdefault(r["pattern"],
                                       {"rounds": [], "wins": 0, "arrivals": []})
            slot["rounds"].append(r["round"])
            slot["wins"] += int(r["won"])
            if r.get("arrival_seconds") is not None:
                slot["arrivals"].append(r["arrival_seconds"])

        timed = [r["arrival_seconds"] for r in mine if r.get("arrival_seconds") is not None]
        times = sorted(timed)

        out[str(team)] = {
            "t_rounds_classified": len(mine),
            "target_read_from_plant": sum(
                1 for r in mine if r.get("target_source") == "bomb_plant"),
            "target_inferred": sum(
                1 for r in mine if r.get("target_source") == "inferred_from_arrival"),
            "low_confidence_rounds": sum(
                1 for r in mine if r.get("confidence") == "low"),
            "median_arrival_seconds": times[len(times) // 2] if times else None,
            "patterns": {
                name: {
                    "label": pattern_label(name),
                    "rounds": slot["rounds"],
                    "win_rate": rate(slot["wins"], len(slot["rounds"]),
                                     f"rounds won / rounds labelled {name}"),
                    # The median of this pattern's own arrivals, so a counter
                    # can say when to expect it rather than only that it comes.
                    "median_arrival_seconds": (
                        sorted(slot["arrivals"])[len(slot["arrivals"]) // 2]
                        if slot["arrivals"] else None
                    ),
                }
                for name, slot in sorted(patterns.items(),
                                         key=lambda kv: -len(kv[1]["rounds"]))
            },
        }
    return out
