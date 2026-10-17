"""Raw extraction: demo file -> normalised events and round segmentation.

Every value here is read from the demo. Nothing is inferred or estimated; the
inference layer lives in metrics.py and labels its output as derived.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field

import pandas as pd
from demoparser2 import DemoParser

from . import props as P

log = logging.getLogger(__name__)


@dataclass
class Round:
    number: int                 # 1-indexed, as shown on the scoreboard
    half: int                   # side-swap segment within the current phase
    overtime: int               # 0 = regulation, 1+ = overtime period
    start_tick: int
    freeze_end_tick: int | None  # when players are released; None if not observed
    end_tick: int
    winner: str | None          # "T" | "CT" | None if not observed
    end_reason: str
    bomb_planted: bool
    plant_tick: int | None
    plant_site: str | None
    defused: bool
    # clan name -> side played this round
    sides: dict[str, str] = field(default_factory=dict)


@dataclass
class Match:
    demo_path: str
    map_name: str
    server_name: str
    tickrate: int
    teams: dict[str, list[str]]        # clan name -> [steamid, ...]
    players: pd.DataFrame              # steamid, name, clan
    rounds: list[Round]
    kills: pd.DataFrame
    grenades: pd.DataFrame             # thrown + detonations
    damages: pd.DataFrame
    economy: pd.DataFrame              # per player per round
    positions: pd.DataFrame            # sampled player positions
    plants: pd.DataFrame               # bomb_planted events incl. site + position
    warnings: list[str] = field(default_factory=list)


def _collapse_gamerules(df: pd.DataFrame) -> pd.DataFrame:
    """Game-rules props replicate to every entity; keep one row per tick."""
    drop = [c for c in ("steamid", "name") if c in df.columns]
    out = df.drop(columns=drop).groupby("tick", as_index=False).first()
    return out.sort_values("tick").reset_index(drop=True)


def _transitions(series: pd.Series) -> pd.Series:
    """Index positions where an integer counter increases."""
    s = series.astype("int64")
    return s.diff().fillna(0) > 0


def _segment_rounds(gr: pd.DataFrame, freeze_ends: list[int],
                    warnings: list[str]) -> list[dict]:
    """Pair round-start counter bumps with the following round-end bump.

    eBot/matchmaking demos contain pre-match restarts, so a start without a
    matching end, or a duplicate scoreboard round number, is discarded in
    favour of the last attempt.
    """
    rsc = P.GR + "m_nRoundStartCount"
    rec = P.GR + "m_nRoundEndCount"

    starts = gr.loc[_transitions(gr[rsc]), "tick"].tolist()
    ends = gr.loc[_transitions(gr[rec]), "tick"].tolist()
    if not starts:
        warnings.append("no round-start transitions found; demo may be a fragment")
        return []

    by_number: dict[int, dict] = {}
    for start in starts:
        after = [e for e in ends if e > start]
        if not after:
            continue  # round never completed (demo cut off mid-round)
        end = after[0]
        window = gr[(gr.tick >= start) & (gr.tick <= end)]
        if window.empty or window["is_warmup_period"].astype(bool).all():
            continue

        # total_rounds_played is the completed-round count, so it reads N-1
        # during round N. Take it at the start to avoid the end-of-round bump.
        number = int(window.iloc[0]["total_rounds_played"]) + 1
        fe = [t for t in freeze_ends if start <= t <= end]

        by_number[number] = {           # later attempts overwrite restarts
            "number": number,
            "start_tick": int(start),
            "end_tick": int(end),
            "freeze_end_tick": int(fe[-1]) if fe else None,
            "window": window,
        }

    return [by_number[n] for n in sorted(by_number)]


def _overtime_per_round(rounds: list[dict]) -> dict[int, int]:
    """Overtime period per round, read from m_nOvertimePlaying (0 = regulation)."""
    field_name = P.GR + "m_nOvertimePlaying"
    out: dict[int, int] = {}
    for r in rounds:
        w = r["window"]
        out[r["number"]] = int(w.iloc[0][field_name]) if field_name in w.columns else 0
    return out


def _derive_halves(rounds: list[dict], gr: pd.DataFrame,
                   sides_by_round: dict[int, dict[str, str]],
                   overtimes: dict[int, int],
                   warnings: list[str]) -> dict[int, int]:
    """Assign a half to each round from the tick where the roster swaps side.

    m_iFirstSecondHalfRound is read as a cross-check: when the two disagree the
    observed swap wins and a warning is recorded, because the game-rules field
    is unreliable in third-party server demos.
    """
    numbers = [r["number"] for r in rounds]
    swaps: list[int] = []
    prev: dict[str, str] | None = None
    for n in numbers:
        cur = sides_by_round.get(n)
        if not cur:
            continue
        if prev and any(cur.get(team) != side for team, side in prev.items()
                        if team in cur):
            swaps.append(n)
        prev = cur

    field_name = P.GR + "m_iFirstSecondHalfRound"
    declared = None
    if field_name in gr.columns:
        vals = sorted({int(v) for v in gr[field_name].dropna().unique() if int(v) > 0})
        declared = vals[0] if vals else None
    if declared is not None and swaps and declared != swaps[0]:
        warnings.append(
            f"half boundary: observed side swap at round {swaps[0]} but "
            f"m_iFirstSecondHalfRound reports {declared}; using observed swap"
        )

    halves: dict[int, int] = {}
    half = 1
    swap_set = set(swaps)
    prev_ot = overtimes.get(numbers[0], 0) if numbers else 0
    for n in numbers:
        ot = overtimes.get(n, 0)
        if ot != prev_ot:          # a new overtime period restarts the count
            half = 1
            prev_ot = ot
        elif n in swap_set:
            half += 1
        halves[n] = half
    return halves


def _clan_sides_per_round(ticks: pd.DataFrame, rounds: list[dict]) -> dict[int, dict[str, str]]:
    """Which side each clan played, read at each round's freeze-time end."""
    out: dict[int, dict[str, str]] = {}
    for r in rounds:
        at = r["freeze_end_tick"] or r["start_tick"]
        snap = ticks[ticks.tick == at]
        if snap.empty:                      # sampled grid may miss the exact tick
            later = ticks[ticks.tick >= at]
            if later.empty:
                continue
            snap = ticks[ticks.tick == later.iloc[0]["tick"]]
        mapping: dict[str, str] = {}
        for clan, grp in snap.groupby("team_clan_name"):
            if not clan:
                continue
            sides = grp["team_name"].dropna().unique()
            if len(sides) == 1:
                mapping[str(clan)] = "T" if sides[0] == "TERRORIST" else "CT"
        if mapping:
            out[r["number"]] = mapping
    return out


def _round_of(tick_series: pd.Series, rounds: list[Round]) -> pd.Series:
    """Map ticks to scoreboard round numbers using observed round windows.

    Ticks that fall between a round's end and the next round's start (round-end
    freeze, timeouts, halftime) belong to no round and come back as NA rather
    than being folded into a neighbour.
    """
    import numpy as np

    starts = np.array([r.start_tick for r in rounds])
    ends = np.array([r.end_tick for r in rounds])
    numbers = np.array([r.number for r in rounds])

    ticks = pd.to_numeric(tick_series, errors="coerce").to_numpy(dtype="float64")
    slot = np.searchsorted(starts, ticks, side="right") - 1
    valid = (slot >= 0) & ~np.isnan(ticks)
    slot_safe = np.where(valid, slot, 0)
    inside = valid & (ticks <= ends[slot_safe])

    out = np.where(inside, numbers[slot_safe], np.nan)
    return pd.Series(out, index=tick_series.index).astype("Int64")


def extract(demo_path: str, position_hz: float = 2.0) -> Match:
    """Parse a demo into normalised facts.

    position_hz controls the player-position sample rate. Tactical movement is
    legible at 2 Hz and the full 64 Hz grid is ~30x the data for no analytical
    gain, so positions are decimated rather than parsed in full.
    """
    warnings: list[str] = []
    parser = DemoParser(demo_path)
    header = parser.parse_header()
    tickrate = 64  # CS2 demos are recorded at 64 tick; no header field exposes it

    gr = _collapse_gamerules(parser.parse_ticks(P.GAMERULES))

    fe_event = parser.parse_event("round_freeze_end")
    freeze_ends = sorted(int(t) for t in fe_event["tick"].tolist()) if len(fe_event) else []

    raw_rounds = _segment_rounds(gr, freeze_ends, warnings)
    if not raw_rounds:
        raise ValueError(f"no complete rounds found in {demo_path}")

    # Side assignment needs team state at round boundaries only.
    boundary_ticks = sorted({r["freeze_end_tick"] or r["start_tick"] for r in raw_rounds})
    boundary = parser.parse_ticks(["team_name", "team_clan_name", "balance",
                                   "current_equip_value"], ticks=boundary_ticks)
    sides_by_round = _clan_sides_per_round(boundary, raw_rounds)
    overtimes = _overtime_per_round(raw_rounds)
    halves = _derive_halves(raw_rounds, gr, sides_by_round, overtimes, warnings)

    # --- bomb events -------------------------------------------------------
    plants = parser.parse_event("bomb_planted", player=["X", "Y", "Z"],
                                other=["total_rounds_played"])
    defuses = parser.parse_event("bomb_defused", other=["total_rounds_played"])

    rounds: list[Round] = []
    for r in raw_rounds:
        w = r["window"]
        last = w.iloc[-1]
        winner_num = int(last[P.GR + "m_iRoundEndWinnerTeam"])
        reason_num = int(last[P.GR + "m_eRoundEndReason"])
        plant = plants[(plants.tick >= r["start_tick"]) & (plants.tick <= r["end_tick"])] \
            if len(plants) else plants
        defuse = defuses[(defuses.tick >= r["start_tick"]) & (defuses.tick <= r["end_tick"])] \
            if len(defuses) else defuses
        rounds.append(Round(
            number=r["number"],
            half=halves.get(r["number"], 1),
            overtime=overtimes.get(r["number"], 0),
            start_tick=r["start_tick"],
            freeze_end_tick=r["freeze_end_tick"],
            end_tick=r["end_tick"],
            winner=P.TEAM_NUM.get(winner_num),
            end_reason=P.ROUND_END_REASON.get(reason_num, f"unknown_{reason_num}"),
            bomb_planted=len(plant) > 0,
            plant_tick=int(plant.iloc[0]["tick"]) if len(plant) else None,
            plant_site=None,  # resolved by the area layer from planter coordinates
            defused=len(defuse) > 0,
            sides=sides_by_round.get(r["number"], {}),
        ))

    if any(r.winner is None for r in rounds):
        warnings.append("one or more rounds have no recorded winner team")

    # The demo separates the bombsites by entity index; the area layer turns
    # those indices into labels, which are then stamped onto each round.
    from .areas import resolve_bombsites

    class _MapOnly:                      # resolve_bombsites only reads map_name
        map_name = header.get("map_name", "unknown")

    # Warm-up and knife-round plants locate the sites just as well, but they
    # would inflate the reported plant counts, so only live rounds are used.
    live_plants = plants
    if len(plants):
        in_round = _round_of(plants["tick"], rounds).notna()
        live_plants = plants[in_round]

    sites = resolve_bombsites(_MapOnly(), live_plants)
    label_by_site_id = {s.site_id: s.label for s in sites}
    if len(plants) and "site" in plants.columns:
        site_by_tick = dict(zip(plants["tick"], plants["site"]))
        for r in rounds:
            if r.plant_tick is not None:
                site_id = site_by_tick.get(r.plant_tick)
                if site_id is not None:
                    r.plant_site = label_by_site_id.get(int(site_id))

    # --- players ------------------------------------------------------------
    info = parser.parse_player_info()
    clan_by_steamid = (boundary.dropna(subset=["team_clan_name"])
                       .groupby("steamid")["team_clan_name"]
                       .agg(lambda s: s.value_counts().idxmax()))
    info["steamid"] = info["steamid"].astype(str)
    info["clan"] = info["steamid"].map(
        {str(k): v for k, v in clan_by_steamid.items()})
    players = info[info["clan"].notna()].copy()

    teams: dict[str, list[str]] = {
        str(clan): grp["steamid"].tolist() for clan, grp in players.groupby("clan")
    }

    # --- combat events ------------------------------------------------------
    kills = parser.parse_event(
        "player_death",
        player=["X", "Y", "Z", "team_name", "team_clan_name"],
        other=["total_rounds_played", "is_bomb_planted"])
    damages = parser.parse_event(
        "player_hurt", player=["team_name"], other=["total_rounds_played"])

    # --- utility ------------------------------------------------------------
    nades = []
    thrown = parser.parse_event("grenade_thrown", player=["X", "Y", "Z", "team_name",
                                                         "team_clan_name"])
    if len(thrown):
        thrown = thrown.assign(phase="thrown", util=thrown.get("weapon"))
        nades.append(thrown)
    for event, label in P.UTILITY_EVENTS.items():
        try:
            df = parser.parse_event(event, player=["team_name", "team_clan_name"])
        except Exception as exc:                      # event absent in this demo
            warnings.append(f"utility event {event} unavailable: {exc}")
            continue
        if len(df):
            nades.append(df.assign(phase="detonate", util=label))
    grenades = pd.concat(nades, ignore_index=True) if nades else pd.DataFrame()

    # --- economy ------------------------------------------------------------
    economy = boundary.copy()

    # --- positions ----------------------------------------------------------
    step = max(1, int(round(tickrate / position_hz)))
    wanted: list[int] = []
    for r in rounds:
        begin = r.freeze_end_tick or r.start_tick
        wanted.extend(range(begin, r.end_tick, step))
    positions = parser.parse_ticks(P.PLAYER_TICK, ticks=wanted)

    # Attach round numbers to every event frame.
    for name, df in (("kills", kills), ("damages", damages),
                     ("grenades", grenades), ("positions", positions),
                     ("economy", economy)):
        if len(df):
            df["round"] = _round_of(df["tick"], rounds)

    return Match(
        demo_path=demo_path,
        map_name=header.get("map_name", "unknown"),
        server_name=header.get("server_name", ""),
        tickrate=tickrate,
        teams=teams,
        players=players,
        rounds=rounds,
        kills=kills,
        grenades=grenades,
        damages=damages,
        economy=economy,
        positions=positions,
        plants=live_plants,
        warnings=warnings,
    )
