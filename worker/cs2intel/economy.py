"""Economy and buy-type statistics.

Buy types are a labelling convention applied to an observed number (team
equipment value at the end of freeze time), so every output carries the
thresholds that produced the label.
"""
from __future__ import annotations

import pandas as pd

from .extract import Match
from .metrics import BUY_THRESHOLDS, rate


def classify_buy(equip_value: float) -> str:
    for label, floor in BUY_THRESHOLDS:
        if equip_value >= floor:
            return label
    return "eco"


def team_economy(match: Match) -> dict:
    """Per-team buy distribution and win rate by buy type.

    Players with no equipment value at freeze time (not connected or not yet
    spawned) are excluded, and the affected rounds are reported so a thin
    roster cannot silently depress a team's buy figures.
    """
    eco = match.economy.copy()
    eco = eco[eco["round"].notna() & eco["current_equip_value"].notna()].copy()
    eco["round"] = eco["round"].astype(int)

    winners = {r.number: r.winner for r in match.rounds}
    sides = {(r.number, clan): side for r in match.rounds
             for clan, side in r.sides.items()}

    per_round = (eco.groupby(["round", "team_clan_name"])
                 .agg(equip_value=("current_equip_value", "sum"),
                      money_left=("balance", "sum"),
                      players=("steamid", "nunique"))
                 .reset_index())
    per_round["buy_type"] = per_round["equip_value"].map(classify_buy)
    per_round["side"] = [sides.get((rd, clan)) for rd, clan
                         in zip(per_round["round"], per_round["team_clan_name"])]
    per_round["won"] = [winners.get(rd) == side for rd, side
                        in zip(per_round["round"], per_round["side"])]

    incomplete = sorted(per_round.loc[per_round["players"] < 5, "round"].unique().tolist())

    out: dict = {
        "thresholds_usd": {label: floor for label, floor in BUY_THRESHOLDS},
        "note": ("buy_type is derived from summed team equipment value at the "
                 "end of freeze time; it is a convention, not a demo field"),
        "rounds_with_incomplete_roster": incomplete,
        "by_team": {},
        "per_round": per_round.to_dict("records"),
    }

    for team, grp in per_round.groupby("team_clan_name"):
        by_type = {}
        for buy_type in dict(BUY_THRESHOLDS):
            sub = grp[grp.buy_type == buy_type]
            if len(sub) == 0:
                continue
            by_type[buy_type] = {
                "rounds": len(sub),
                "win_rate": rate(int(sub.won.sum()), len(sub),
                                 f"rounds won / rounds this team played a {buy_type}"),
                "mean_equip_value": int(sub.equip_value.mean()),
            }
        out["by_team"][str(team)] = {
            "buy_types": by_type,
            "mean_equip_value": int(grp.equip_value.mean()),
            "mean_money_left_after_buy": int(grp.money_left.mean()),
        }
    return out


def anti_eco(match: Match) -> dict:
    """Rounds where one team's equipment value was far below the other's.

    The gap threshold is a convention and is reported with the result. This
    identifies the rounds an analyst should watch for anti-eco protocol, not a
    judgement about how they were played.
    """
    gap_threshold = 10000
    eco = match.economy.copy()
    eco = eco[eco["round"].notna() & eco["current_equip_value"].notna()].copy()
    eco["round"] = eco["round"].astype(int)
    per_round = (eco.groupby(["round", "team_clan_name"])["current_equip_value"]
                 .sum().unstack())
    if per_round.shape[1] != 2:
        return {"gap_threshold_usd": gap_threshold, "rounds": [],
                "note": "needs exactly two named teams"}

    a, b = per_round.columns
    winners = {r.number: r.winner for r in match.rounds}
    sides = {(r.number, clan): side for r in match.rounds
             for clan, side in r.sides.items()}

    rows = []
    for rd, row in per_round.iterrows():
        diff = row[a] - row[b]
        if abs(diff) < gap_threshold:
            continue
        rich, poor = (a, b) if diff > 0 else (b, a)
        rows.append({
            "round": int(rd),
            "advantaged_team": str(rich),
            "disadvantaged_team": str(poor),
            "equip_value_gap": int(abs(diff)),
            "advantaged_side": sides.get((int(rd), rich)),
            "advantaged_team_won": winners.get(int(rd)) == sides.get((int(rd), rich)),
        })

    won = sum(1 for r in rows if r["advantaged_team_won"])
    return {
        "gap_threshold_usd": gap_threshold,
        "conversion_rate": rate(
            won, len(rows),
            "rounds won by the better-equipped team / rounds with an equipment "
            f"gap of at least ${gap_threshold}"),
        "rounds": rows,
    }
