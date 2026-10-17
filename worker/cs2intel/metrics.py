"""Deterministic match statistics.

Every rate is returned as {value, numerator, denominator, definition} so a
report can quote the denominator, and so no figure can be restated without the
sample size it came from. Functions here compute only what the demo records or
what follows from it arithmetically; nothing is estimated.
"""
from __future__ import annotations

import pandas as pd

from .extract import Match

# --- conventions -------------------------------------------------------------
# Buy classification is a convention, not a demo field. Thresholds are team
# equipment value at the end of freeze time, in dollars, and are reported
# alongside the label so a reader can disagree with the cut-offs.
BUY_THRESHOLDS = [
    ("full_buy", 20000),
    ("semi_buy", 10000),
    ("force_buy", 5000),
    ("eco", 0),
]

# A kill counts as a trade if it lands within this window of the teammate's
# death. Five seconds is the common analyst convention.
TRADE_WINDOW_SECONDS = 5.0


def rate(numerator: int, denominator: int, definition: str) -> dict:
    return {
        "value": round(numerator / denominator, 4) if denominator else None,
        "numerator": int(numerator),
        "denominator": int(denominator),
        "definition": definition,
    }


def _sided_rounds(match: Match) -> pd.DataFrame:
    """One row per (round, team) with the side played and the outcome."""
    rows = []
    for r in match.rounds:
        for clan, side in r.sides.items():
            rows.append({
                "round": r.number,
                "team": clan,
                "side": side,
                "won": r.winner == side,
                "overtime": r.overtime,
                "end_reason": r.end_reason,
                "bomb_planted": r.bomb_planted,
                "defused": r.defused,
            })
    return pd.DataFrame(rows)


def side_win_rates(match: Match) -> dict:
    df = _sided_rounds(match)
    out: dict[str, dict] = {}
    for team, grp in df.groupby("team"):
        per_side = {}
        for side in ("T", "CT"):
            s = grp[grp.side == side]
            per_side[side] = rate(
                int(s.won.sum()), len(s),
                f"rounds won while playing {side} / rounds played as {side}")
        per_side["overall"] = rate(
            int(grp.won.sum()), len(grp),
            "rounds won / rounds played (both sides, incl. overtime)")
        out[str(team)] = per_side
    return out


def round_end_reasons(match: Match) -> dict:
    df = _sided_rounds(match)
    out: dict[str, dict] = {}
    for team, grp in df.groupby("team"):
        won = grp[grp.won]
        as_t = grp[grp.side == "T"]
        as_ct = grp[grp.side == "CT"]
        planted_by_team = as_t[as_t.bomb_planted]
        planted_against = as_ct[as_ct.bomb_planted]
        out[str(team)] = {
            "wins_by_reason": {str(k): int(v) for k, v
                               in won.end_reason.value_counts().items()},
            "plant_rate_as_t": rate(
                int(as_t.bomb_planted.sum()), len(as_t),
                "rounds with a bomb plant / rounds played as T"),
            "post_plant_win_rate_as_t": rate(
                int(planted_by_team.won.sum()), len(planted_by_team),
                "rounds won after planting / rounds where this team planted"),
            "defuse_rate_as_ct": rate(
                int(planted_against.defused.sum()), len(planted_against),
                "rounds with a defuse / rounds where the bomb was planted "
                "against this team"),
        }
    return out


def _kills_in_rounds(match: Match) -> pd.DataFrame:
    """Kills restricted to live rounds, with side and seconds-into-round."""
    k = match.kills.copy()
    k = k[k["round"].notna()].copy()
    k["round"] = k["round"].astype(int)

    starts = {r.number: (r.freeze_end_tick or r.start_tick) for r in match.rounds}
    k["tick_into_round"] = k["tick"] - k["round"].map(starts)
    k["seconds_into_round"] = k["tick_into_round"] / match.tickrate

    sides = {(r.number, clan): side for r in match.rounds
             for clan, side in r.sides.items()}
    k["attacker_side"] = [sides.get((rd, clan)) for rd, clan
                          in zip(k["round"], k["attacker_team_clan_name"])]
    k["victim_side"] = [sides.get((rd, clan)) for rd, clan
                        in zip(k["round"], k["user_team_clan_name"])]
    k["teamkill"] = k["attacker_team_name"] == k["user_team_name"]
    return k.sort_values("tick").reset_index(drop=True)


def opening_duels(match: Match) -> dict:
    """First kill of each round: who took it, and what followed.

    Team-kills and rounds with no kill are excluded from the denominator, and
    the exclusion count is reported.
    """
    k = _kills_in_rounds(match)
    valid = k[~k.teamkill]
    first = valid.groupby("round", as_index=False).first()

    winners = {r.number: r.winner for r in match.rounds}
    first["round_won_by_opener"] = [
        winners.get(rd) == side for rd, side
        in zip(first["round"], first["attacker_side"])]

    by_team: dict[str, dict] = {}
    for team in sorted(match.teams):
        taken = first[first["attacker_team_clan_name"] == team]
        lost = first[first["user_team_clan_name"] == team]
        by_team[str(team)] = {
            "opening_kills": len(taken),
            "opening_deaths": len(lost),
            "opening_duel_win_rate": rate(
                len(taken), len(taken) + len(lost),
                "opening kills / opening duels this team was involved in"),
            "round_win_rate_after_opening_kill": rate(
                int(taken["round_won_by_opener"].sum()), len(taken),
                "rounds won / rounds where this team took the opening kill"),
        }

    by_player: dict[str, dict] = {}
    for sid, grp in first.groupby("attacker_steamid"):
        by_player[str(sid)] = {
            "steamid": str(sid),
            "name": str(grp["attacker_name"].iloc[0]),
            "opening_kills": len(grp),
            "opening_deaths": 0,
            "mean_seconds_into_round": round(float(grp["seconds_into_round"].mean()), 1),
        }
    for sid, grp in first.groupby("user_steamid"):
        entry = by_player.setdefault(str(sid), {
            "steamid": str(sid),
            "name": str(grp["user_name"].iloc[0]),
            "opening_kills": 0,
            "opening_deaths": 0,
            "mean_seconds_into_round": None,
        })
        entry["opening_deaths"] = len(grp)
    for p in by_player.values():
        p["opening_duel_win_rate"] = rate(
            p["opening_kills"], p["opening_kills"] + p["opening_deaths"],
            "opening kills / opening duels this player was involved in")

    return {
        "rounds_with_an_opening_duel": int(first["round"].nunique()),
        "rounds_total": len(match.rounds),
        "team_kills_excluded": int(k["teamkill"].sum()),
        "by_team": by_team,
        "by_player": sorted(by_player.values(), key=lambda p: -p["opening_kills"]),
    }


def trades(match: Match) -> dict:
    """Trade kills and traded deaths within TRADE_WINDOW_SECONDS.

    A trade kill avenges a teammate: the victim of this kill is the player who
    killed that teammate. Chained refrags count individually.
    """
    k = _kills_in_rounds(match)
    k = k[~k.teamkill].reset_index(drop=True)
    window = TRADE_WINDOW_SECONDS * match.tickrate

    trade_kill, traded_death = [], []
    for row in k.itertuples(index=False):
        same_round = k[k["round"] == row.round]
        prior = same_round[(same_round["tick"] < row.tick) &
                           (same_round["tick"] >= row.tick - window)]
        trade_kill.append(bool(len(prior[
            (prior["user_team_clan_name"] == row.attacker_team_clan_name) &
            (prior["attacker_steamid"] == row.user_steamid)])))

        later = same_round[(same_round["tick"] > row.tick) &
                           (same_round["tick"] <= row.tick + window)]
        traded_death.append(bool(len(later[
            (later["attacker_team_clan_name"] == row.user_team_clan_name) &
            (later["user_steamid"] == row.attacker_steamid)])))

    k["is_trade_kill"] = trade_kill
    k["death_was_traded"] = traded_death

    by_team = {}
    for team in sorted(match.teams):
        kills = k[k["attacker_team_clan_name"] == team]
        deaths = k[k["user_team_clan_name"] == team]
        by_team[str(team)] = {
            "trade_kill_rate": rate(
                int(kills["is_trade_kill"].sum()), len(kills),
                f"kills that avenged a teammate within {TRADE_WINDOW_SECONDS:g}s "
                "/ all kills by this team"),
            "traded_death_rate": rate(
                int(deaths["death_was_traded"].sum()), len(deaths),
                f"deaths avenged by a teammate within {TRADE_WINDOW_SECONDS:g}s "
                "/ all deaths of this team"),
        }

    by_player = []
    for sid, grp in k.groupby("user_steamid"):
        kills_grp = k[k["attacker_steamid"] == sid]
        by_player.append({
            "steamid": str(sid),
            "name": str(grp["user_name"].iloc[0]),
            "trade_kills": int(kills_grp["is_trade_kill"].sum()),
            "deaths": len(grp),
            "traded_death_rate": rate(
                int(grp["death_was_traded"].sum()), len(grp),
                "deaths avenged by a teammate / this player's deaths"),
        })

    return {
        "window_seconds": TRADE_WINDOW_SECONDS,
        "by_team": by_team,
        "by_player": sorted(by_player, key=lambda p: -p["trade_kills"]),
    }
