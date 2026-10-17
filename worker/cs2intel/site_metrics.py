"""Bombsite-level statistics: attack preference, defence, setups, retakes.

Everything here rests on the resolved bombsites, so it is available only for
maps where at least one plant per site was observed. Positions come from the
2 Hz sample, which bounds how precisely any timing can be stated: an arrival
time is accurate to within half a second, and that limit is reported with the
figures rather than hidden behind a decimal place.
"""
from __future__ import annotations

import pandas as pd

from .areas import Bombsite, nearest_site, site_zone
from .extract import Match
from .metrics import rate


def _sides_lookup(match: Match) -> dict[tuple[int, str], str]:
    return {(r.number, clan): side for r in match.rounds
            for clan, side in r.sides.items()}


def site_attack(match: Match, sites: list[Bombsite]) -> dict:
    """Which site each team attacks, and how often that converts.

    Rounds with no plant are counted in the denominator of the preference
    figures, because declining to plant is itself an outcome of the attack.
    """
    labels = [s.label for s in sites]
    out: dict = {"sites": labels, "by_team": {}}

    for team in sorted(match.teams):
        t_rounds = [r for r in match.rounds if r.sides.get(team) == "T"]
        entry: dict = {"rounds_as_t": len(t_rounds), "per_site": {}}
        for label in labels:
            at_site = [r for r in t_rounds if r.plant_site == label]
            won = sum(1 for r in at_site if r.winner == "T")
            entry["per_site"][label] = {
                "plants": len(at_site),
                "plant_share": rate(
                    len(at_site), len(t_rounds),
                    f"rounds planted at {label} / rounds played as T"),
                "win_rate_after_planting_here": rate(
                    won, len(at_site),
                    f"rounds won / rounds this team planted at {label}"),
            }
        no_plant = [r for r in t_rounds if not r.bomb_planted]
        entry["rounds_without_a_plant"] = {
            "rounds": len(no_plant),
            "win_rate": rate(
                sum(1 for r in no_plant if r.winner == "T"), len(no_plant),
                "rounds won / rounds played as T without planting"),
        }
        out["by_team"][str(team)] = entry
    return out


def site_defence(match: Match, sites: list[Bombsite]) -> dict:
    """How each team defends each site once the bomb is down."""
    labels = [s.label for s in sites]
    out: dict = {"sites": labels, "by_team": {}}

    for team in sorted(match.teams):
        ct_rounds = [r for r in match.rounds if r.sides.get(team) == "CT"]
        entry: dict = {"rounds_as_ct": len(ct_rounds), "per_site": {}}
        for label in labels:
            # Rounds where the bomb went down at this site against this team.
            planted = [r for r in ct_rounds if r.plant_site == label]
            entry["per_site"][label] = {
                "plants_conceded": len(planted),
                "retake_rate": rate(
                    sum(1 for r in planted if r.winner == "CT"), len(planted),
                    f"rounds won after conceding a plant at {label} / plants "
                    f"conceded at {label}"),
                "defuses": sum(1 for r in planted if r.defused),
            }
        held = [r for r in ct_rounds if not r.bomb_planted]
        entry["rounds_with_no_plant_conceded"] = {
            "rounds": len(held),
            "win_rate": rate(
                sum(1 for r in held if r.winner == "CT"), len(held),
                "rounds won / rounds as CT where no plant happened"),
        }
        out["by_team"][str(team)] = entry
    return out


# How long after freeze-time end to read a CT setup. At freeze-time end every
# player is still standing in spawn, so that moment says nothing about the
# setup; this is roughly the time needed to walk to a default position.
SETUP_DELAY_SECONDS = 20.0


def ct_setups(match: Match, sites: list[Bombsite]) -> dict:
    """Where each CT has taken up position, before first contact.

    Read SETUP_DELAY_SECONDS after freeze-time end, or just before the round's
    first kill when that comes sooner: once someone dies, positions reflect
    reaction rather than the intended setup. The delay actually used is
    reported per round, because a round whose first kill lands at four seconds
    gives a much weaker reading than one measured at the full twenty.
    """
    if len(match.positions) == 0 or not sites:
        return {"note": "needs sampled positions and resolved bombsites"}

    pos = match.positions
    pos = pos[pos["round"].notna()].copy()
    pos["round"] = pos["round"].astype(int)

    kills = match.kills
    kills = kills[kills["round"].notna()] if len(kills) else kills
    first_kill_tick = (kills.groupby(kills["round"].astype(int))["tick"].min().to_dict()
                       if len(kills) else {})

    rows = []
    delays = []
    for r in match.rounds:
        begin = r.freeze_end_tick or r.start_tick
        target = begin + int(SETUP_DELAY_SECONDS * match.tickrate)
        contact = first_kill_tick.get(r.number)
        if contact is not None:
            # Step back one sample so the reading predates the kill itself.
            target = min(target, int(contact) - int(match.tickrate / 2))
        target = max(target, begin)

        in_round = pos[(pos["round"] == r.number) & (pos["tick"] <= target) &
                       (pos["team_name"] == "CT")]
        if in_round.empty:
            continue
        tick = int(in_round["tick"].max())
        delays.append(round((tick - begin) / match.tickrate, 1))
        snapshot = in_round[in_round["tick"] == tick]

        for row in snapshot.itertuples(index=False):
            if not bool(row.is_alive):
                continue
            label, distance = nearest_site(sites, float(row.X), float(row.Y))
            rows.append({
                "round": r.number,
                "seconds_after_freeze_end": round((tick - begin) / match.tickrate, 1),
                "steamid": str(row.steamid),
                "name": str(row.name),
                "team": str(row.team_clan_name),
                "nearest_site": label,
                "distance_to_site": round(distance, 0),
                "inside_site": site_zone(sites, float(row.X), float(row.Y)) != "elsewhere",
            })

    df = pd.DataFrame(rows)
    if df.empty:
        return {"note": "no CT positions available before first contact"}

    by_player = []
    for sid, grp in df.groupby("steamid"):
        counts = grp["nearest_site"].value_counts()
        by_player.append({
            "steamid": sid,
            "name": grp["name"].iloc[0],
            "team": grp["team"].iloc[0],
            "ct_rounds_observed": int(grp["round"].nunique()),
            "setup_position_by_site": {str(k): int(v) for k, v in counts.items()},
            "most_common": str(counts.index[0]),
            "share_at_most_common": rate(
                int(counts.iloc[0]), len(grp),
                "rounds set up nearest this site / CT rounds observed"),
            "set_up_inside_a_site": rate(
                int(grp["inside_site"].sum()), len(grp),
                "rounds set up inside a bombsite / CT rounds observed"),
            "median_distance_to_nearest_site": int(grp["distance_to_site"].median()),
        })

    by_team_split = {}
    for team, grp in df.groupby("team"):
        per_round = grp.groupby("round")["nearest_site"].value_counts().unstack(fill_value=0)
        by_team_split[str(team)] = {
            "mean_players_per_site": {
                str(c): round(float(per_round[c].mean()), 2) for c in per_round.columns
            },
            "rounds_observed": int(per_round.shape[0]),
        }

    return {
        "definition": (f"nearest bombsite to each living CT, read "
                       f"{SETUP_DELAY_SECONDS:g}s after freeze-time end or just "
                       "before the round's first kill, whichever came first"),
        "median_seconds_after_freeze_end": sorted(delays)[len(delays) // 2] if delays else None,
        "rounds_measured_before_10s": sum(1 for d in delays if d < 10),
        "by_team": by_team_split,
        "by_player": sorted(by_player, key=lambda p: (p["team"], p["name"])),
    }


def retake_arrivals(match: Match, sites: list[Bombsite]) -> dict:
    """Time from the plant until a CT is inside the planted site.

    Measured on the 2 Hz position sample, so each figure is accurate to within
    about half a second. A round where no CT ever reaches the site is reported
    as a null arrival rather than dropped, because never arriving is the
    finding.
    """
    if len(match.positions) == 0 or not sites:
        return {"note": "needs sampled positions and resolved bombsites"}

    by_label = {s.label: s for s in sites}
    pos = match.positions
    pos = pos[pos["round"].notna()].copy()
    pos["round"] = pos["round"].astype(int)

    rows = []
    for r in match.rounds:
        if not r.bomb_planted or r.plant_tick is None or r.plant_site not in by_label:
            continue
        site = by_label[r.plant_site]
        after = pos[(pos["round"] == r.number) & (pos["tick"] >= r.plant_tick) &
                    (pos["team_name"] == "CT") & (pos["is_alive"].astype(bool))]
        at_plant = pos[(pos["round"] == r.number) & (pos["tick"] <= r.plant_tick) &
                       (pos["team_name"] == "CT") & (pos["is_alive"].astype(bool))]

        present = False
        if len(at_plant):
            last_tick = at_plant["tick"].max()
            snapshot = at_plant[at_plant["tick"] == last_tick]
            present = any(site.contains(float(p.X), float(p.Y))
                          for p in snapshot.itertuples(index=False))

        arrival = None
        for row in after.sort_values("tick").itertuples(index=False):
            if site.contains(float(row.X), float(row.Y)):
                arrival = round((int(row.tick) - r.plant_tick) / match.tickrate, 1)
                break

        defending_team = next((clan for clan, side in r.sides.items() if side == "CT"), None)
        rows.append({
            "round": r.number,
            "site": r.plant_site,
            "defending_team": defending_team,
            "ct_on_site_at_plant": present,
            "seconds_to_first_ct_on_site": arrival,
            "round_won_by_ct": r.winner == "CT",
            "defused": r.defused,
        })

    reached = [r for r in rows if r["seconds_to_first_ct_on_site"] is not None]
    by_team: dict = {}
    for team in sorted(match.teams):
        mine = [r for r in rows if r["defending_team"] == team]
        mine_reached = [r for r in mine if r["seconds_to_first_ct_on_site"] is not None]
        times = sorted(r["seconds_to_first_ct_on_site"] for r in mine_reached)
        by_team[str(team)] = {
            "plants_conceded": len(mine),
            "site_reached": rate(
                len(mine_reached), len(mine),
                "plants where a CT reached the site / plants conceded"),
            "median_seconds_to_site": times[len(times) // 2] if times else None,
            "already_on_site_at_plant": rate(
                sum(1 for r in mine if r["ct_on_site_at_plant"]), len(mine),
                "plants with a CT already inside the site / plants conceded"),
        }

    return {
        "sample_rate_hz": 2.0,
        "precision_note": "arrival times are accurate to about 0.5s",
        "by_team": by_team,
        "rounds": rows,
        "rounds_where_site_was_reached": len(reached),
    }


def position_presence(match: Match, sites: list[Bombsite]) -> dict:
    """Share of each player's living time spent inside each bombsite.

    The complement, "elsewhere", is the rest of the map; without callouts it
    cannot be broken down further, so it is reported as one bucket instead of
    being split into invented areas.
    """
    if len(match.positions) == 0 or not sites:
        return {"note": "needs sampled positions and resolved bombsites"}

    pos = match.positions
    pos = pos[pos["round"].notna() & pos["is_alive"].astype(bool)].copy()
    if pos.empty:
        return {"note": "no living sampled positions"}

    pos["zone"] = [site_zone(sites, float(x), float(y))
                   for x, y in zip(pos["X"], pos["Y"])]

    rows = []
    for sid, grp in pos.groupby("steamid"):
        counts = grp["zone"].value_counts()
        total = len(grp)
        rows.append({
            "steamid": str(sid),
            "name": str(grp["name"].iloc[0]),
            "team": str(grp["team_clan_name"].mode().iloc[0])
                    if grp["team_clan_name"].notna().any() else None,
            "samples": total,
            "zone_share": {str(z): round(int(c) / total, 3) for z, c in counts.items()},
        })

    return {
        "definition": ("share of 2 Hz position samples, while alive, falling "
                       "inside each bombsite radius; everything else is "
                       "'elsewhere'"),
        "by_player": sorted(rows, key=lambda r: (r["team"] or "", r["name"])),
    }
