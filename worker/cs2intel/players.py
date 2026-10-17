"""Per-player statistics and clutch situations.

Alive counts are reconstructed by walking each round's kills in order from the
roster that was alive at freeze-time end. This is exact for standard rounds;
the reconstruction is validated against the round's recorded end reason and any
disagreement is reported rather than smoothed over.
"""
from __future__ import annotations

import pandas as pd

from .extract import Match
from .metrics import rate, _kills_in_rounds


def _rounds_played(match: Match) -> dict[str, int]:
    eco = match.economy.copy()
    eco = eco[eco["round"].notna() & eco["team_name"].notna()]
    return (eco.groupby("steamid")["round"].nunique()
            .apply(int).to_dict())


def _roster_at_freeze(match: Match) -> dict[int, dict[str, list[str]]]:
    """Alive roster per round per side, read at freeze-time end."""
    eco = match.economy.copy()
    eco = eco[eco["round"].notna() & eco["team_name"].notna()].copy()
    eco["round"] = eco["round"].astype(int)
    out: dict[int, dict[str, list[str]]] = {}
    for rd, grp in eco.groupby("round"):
        sides: dict[str, list[str]] = {"T": [], "CT": []}
        for row in grp.itertuples(index=False):
            side = "T" if row.team_name == "TERRORIST" else "CT"
            sides[side].append(str(row.steamid))
        out[int(rd)] = sides
    return out


def player_stats(match: Match) -> dict:
    k = _kills_in_rounds(match)
    kills = k[~k.teamkill]
    dmg = match.damages.copy()
    dmg = dmg[dmg["round"].notna()].copy()

    clan_by_sid = {str(r.steamid): str(r.clan)
                   for r in match.players.itertuples(index=False)}
    # Team damage is excluded from ADR; attacker and victim clans must differ.
    dmg["attacker_clan"] = dmg["attacker_steamid"].astype(str).map(clan_by_sid)
    dmg["victim_clan"] = dmg["user_steamid"].astype(str).map(clan_by_sid)
    enemy_dmg = dmg[(dmg.attacker_clan.notna()) &
                    (dmg.attacker_clan != dmg.victim_clan)]

    rounds_played = _rounds_played(match)
    total_rounds = len(match.rounds)

    # Which rounds each player survived: played minus appeared as a victim.
    died_in = kills.groupby(kills["user_steamid"].astype(str))["round"].apply(set).to_dict()
    played_in = (match.economy[match.economy["round"].notna() &
                               match.economy["team_name"].notna()]
                 .groupby(match.economy["steamid"].astype(str))["round"]
                 .apply(lambda s: {int(x) for x in s}).to_dict())

    out = []
    for sid, clan in clan_by_sid.items():
        pk = kills[kills["attacker_steamid"].astype(str) == sid]
        pd_ = kills[kills["user_steamid"].astype(str) == sid]
        pa = kills[kills["assister_steamid"].astype(str) == sid]
        rp = rounds_played.get(int(sid), rounds_played.get(sid, 0))
        if rp == 0:
            continue
        name = (pk["attacker_name"].iloc[0] if len(pk)
                else pd_["user_name"].iloc[0] if len(pd_) else sid)
        pdmg = enemy_dmg[enemy_dmg["attacker_steamid"].astype(str) == sid]

        multi = pk.groupby("round").size()
        survived = played_in.get(sid, set()) - died_in.get(sid, set())

        out.append({
            "steamid": sid,
            "name": str(name),
            "team": clan,
            "rounds_played": rp,
            "kills": len(pk),
            "deaths": len(pd_),
            "assists": len(pa),
            "kd_ratio": round(len(pk) / len(pd_), 2) if len(pd_) else None,
            "adr": round(float(pdmg["dmg_health"].sum()) / rp, 1),
            "adr_definition": "damage dealt to opponents / rounds this player played",
            "headshot_rate": rate(int(pk["headshot"].sum()), len(pk),
                                  "headshot kills / this player's kills"),
            "survival_rate": rate(len(survived), rp,
                                  "rounds survived / rounds played"),
            "multi_kill_rounds": {f"{n}k": int((multi == n).sum())
                                  for n in sorted(multi.unique())} if len(multi) else {},
            "awp_kills": int((pk["weapon"] == "awp").sum()),
            "weapons_used": {str(w): int(c) for w, c
                             in pk["weapon"].value_counts().head(6).items()},
        })

    return {
        "rounds_in_match": total_rounds,
        "players": sorted(out, key=lambda p: -p["kills"]),
    }


def clutches(match: Match) -> dict:
    """1vN situations, reconstructed from the kill order within each round.

    A clutch opens the moment a side drops to one living player while at least
    one opponent is alive. N is the opponent count at that moment. The outcome
    is the round result, which includes rounds won on the timer or the bomb.
    """
    k = _kills_in_rounds(match)
    k = k[~k.teamkill]
    rosters = _roster_at_freeze(match)
    winners = {r.number: r.winner for r in match.rounds}
    name_by_sid = {str(r.steamid): str(r.name)
                   for r in match.players.itertuples(index=False)}
    clan_by_sid = {str(r.steamid): str(r.clan)
                   for r in match.players.itertuples(index=False)}

    situations = []
    inconsistent = []
    for r in match.rounds:
        roster = rosters.get(r.number)
        if not roster or not roster["T"] or not roster["CT"]:
            inconsistent.append({"round": r.number, "issue": "no roster at freeze end"})
            continue
        alive = {"T": set(roster["T"]), "CT": set(roster["CT"])}
        opened: set[str] = set()

        for row in k[k["round"] == r.number].sort_values("tick").itertuples(index=False):
            victim = str(row.user_steamid)
            victim_side = "T" if row.user_team_name == "TERRORIST" else "CT"
            if victim not in alive[victim_side]:
                inconsistent.append({
                    "round": r.number, "tick": int(row.tick),
                    "issue": f"death of {victim} not in reconstructed alive set"})
                continue
            alive[victim_side].discard(victim)

            for side in ("T", "CT"):
                other = "CT" if side == "T" else "T"
                if len(alive[side]) == 1 and len(alive[other]) >= 1:
                    sid = next(iter(alive[side]))
                    if sid in opened:
                        continue
                    opened.add(sid)
                    situations.append({
                        "round": r.number,
                        "tick": int(row.tick),
                        "seconds_into_round": round(float(row.seconds_into_round), 1),
                        "steamid": sid,
                        "name": name_by_sid.get(sid, sid),
                        "team": clan_by_sid.get(sid),
                        "side": side,
                        "opponents_alive": len(alive[other]),
                        "won_round": winners.get(r.number) == side,
                    })

    by_player: dict[str, dict] = {}
    for s in situations:
        entry = by_player.setdefault(s["steamid"], {
            "steamid": s["steamid"], "name": s["name"], "team": s["team"],
            "clutch_situations": 0, "clutch_wins": 0, "by_opponent_count": {},
        })
        entry["clutch_situations"] += 1
        entry["clutch_wins"] += int(s["won_round"])
        key = f"1v{s['opponents_alive']}"
        slot = entry["by_opponent_count"].setdefault(key, {"situations": 0, "wins": 0})
        slot["situations"] += 1
        slot["wins"] += int(s["won_round"])
    for entry in by_player.values():
        entry["clutch_win_rate"] = rate(
            entry["clutch_wins"], entry["clutch_situations"],
            "rounds won from a 1vN / times this player was last alive vs at "
            "least one opponent")

    return {
        "definition": ("a clutch opens when a side drops to one living player "
                       "with at least one opponent alive; the outcome is the "
                       "round result, so timer and bomb wins count"),
        "situations": situations,
        "by_player": sorted(by_player.values(),
                            key=lambda p: -p["clutch_situations"]),
        "reconstruction_warnings": inconsistent,
    }
