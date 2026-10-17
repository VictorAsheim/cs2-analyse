"""Utility usage statistics.

Grenade throws carry the thrower's position; detonations carry the landing
position. Both are kept, because a smoke's landing spot is the signature of an
execute while the throwing spot tells you where the thrower was exposed.

Effectiveness is measured only where the demo records an effect: kills through
smoke, kills while the attacker was blinded, and flash assists. Enemies-flashed
counts come from the per-round player stat, which the server tracks directly.
"""
from __future__ import annotations

import pandas as pd

from .extract import Match
from .metrics import rate

# Throw-event weapon names mapped onto the detonation labels they produce, so
# a thrown incgrenade and a thrown molotov aggregate as one fire grenade.
THROW_ALIAS = {
    "smokegrenade": "smoke",
    "flashbang": "flashbang",
    "hegrenade": "he",
    "molotov": "molotov",
    "incgrenade": "molotov",
    "decoy": "decoy",
}


def _round_phase(seconds: float) -> str:
    """Round phase by time since freeze-time end.

    Boundaries are a convention for grouping, chosen to separate the opening
    map-control window from executes and from post-plant play.
    """
    if seconds < 20:
        return "early"
    if seconds < 60:
        return "mid"
    return "late"


def utility_usage(match: Match) -> dict:
    if len(match.grenades) == 0:
        return {"note": "no grenade events in this demo"}

    g = match.grenades.copy()
    g = g[g["round"].notna()].copy()
    g["round"] = g["round"].astype(int)
    g["util"] = g["util"].map(lambda u: THROW_ALIAS.get(u, u))

    starts = {r.number: (r.freeze_end_tick or r.start_tick) for r in match.rounds}
    g["seconds_into_round"] = (g["tick"] - g["round"].map(starts)) / match.tickrate
    g["phase"] = g["phase"]  # "thrown" | "detonate"
    g["round_phase"] = g["seconds_into_round"].map(_round_phase)

    sides = {(r.number, clan): side for r in match.rounds
             for clan, side in r.sides.items()}
    g["side"] = [sides.get((rd, clan)) for rd, clan
                 in zip(g["round"], g["user_team_clan_name"])]

    thrown = g[g.phase == "thrown"]
    detonated = g[g.phase == "detonate"]

    rounds_by_team_side = {}
    for r in match.rounds:
        for clan, side in r.sides.items():
            rounds_by_team_side.setdefault((clan, side), 0)
            rounds_by_team_side[(clan, side)] += 1

    by_team: dict = {}
    for team in sorted(match.teams):
        t = thrown[thrown.user_team_clan_name == team]
        entry: dict = {"per_side": {}}
        for side in ("T", "CT"):
            ts = t[t.side == side]
            rounds_played = rounds_by_team_side.get((team, side), 0)
            counts = ts.util.value_counts().to_dict()
            entry["per_side"][side] = {
                "rounds_played": rounds_played,
                "thrown_total": len(ts),
                "thrown_per_round": round(len(ts) / rounds_played, 2) if rounds_played else None,
                "by_type": {str(k): int(v) for k, v in counts.items()},
                "by_type_per_round": {
                    str(k): round(v / rounds_played, 2) for k, v in counts.items()
                } if rounds_played else {},
                "by_round_phase": {str(k): int(v) for k, v
                                   in ts.round_phase.value_counts().items()},
            }
        entry["unused_at_round_end"] = None  # requires inventory sampling; not computed
        by_team[str(team)] = entry

    # Landing positions are the input to the execute-signature layer; they are
    # emitted raw so that layer can cluster them without re-parsing the demo.
    landings = detonated[["round", "tick", "seconds_into_round", "util", "side",
                          "user_team_clan_name", "user_name", "user_steamid",
                          "x", "y", "z"]].dropna(subset=["x", "y"])

    return {
        "definitions": {
            "thrown_per_round": "grenade throw events / rounds played on that side",
            "round_phase": "early <20s, mid 20-60s, late >60s after freeze-time end",
        },
        "by_team": by_team,
        "detonation_positions": landings.to_dict("records"),
    }


def utility_effectiveness(match: Match) -> dict:
    """Effects the demo records directly, per team."""
    k = match.kills.copy()
    k = k[k["round"].notna()].copy()
    k["round"] = k["round"].astype(int)

    out: dict = {"definitions": {
        "through_smoke": "kills with the thrusmoke flag / all kills by this team",
        "while_blinded": "kills where the attacker was flashed / all kills by this team",
        "flash_assisted": "kills where a teammate's flash assisted / all kills by this team",
    }, "by_team": {}}

    for team in sorted(match.teams):
        kills = k[k["attacker_team_clan_name"] == team]
        deaths = k[k["user_team_clan_name"] == team]
        out["by_team"][str(team)] = {
            "kills": len(kills),
            "through_smoke": rate(int(kills.get("thrusmoke", pd.Series(dtype=bool)).sum()),
                                  len(kills),
                                  out["definitions"]["through_smoke"]),
            "while_blinded": rate(int(kills.get("attackerblind", pd.Series(dtype=bool)).sum()),
                                  len(kills),
                                  out["definitions"]["while_blinded"]),
            "flash_assisted": rate(int(kills.get("assistedflash", pd.Series(dtype=bool)).sum()),
                                   len(kills),
                                   out["definitions"]["flash_assisted"]),
            "deaths_while_blinded": rate(
                int(deaths.get("attackerblind", pd.Series(dtype=bool)).sum()), len(deaths),
                "deaths where the killer was blinded / all deaths of this team"),
        }
    return out
