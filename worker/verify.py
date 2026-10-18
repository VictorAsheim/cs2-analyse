"""Cross-check a parsed demo against itself.

    python verify.py <demo.dem>

The checks are arithmetic identities that must hold if the extraction is sound:
round wins must sum to the rounds played, kills must equal deaths, and the
reconstructed alive-counts must account for every death. A demo that fails any
of these produced numbers that should not be reported, so this exits non-zero.
"""
from __future__ import annotations

import sys

from cs2intel import areas as A
from cs2intel import economy as E
from cs2intel import metrics as M
from cs2intel import players as PL
from cs2intel import tactics as TAC
from cs2intel.extract import extract


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__)
        return 2

    match = extract(sys.argv[1])
    swr = M.side_win_rates(match)
    stats = PL.player_stats(match)
    clutch = PL.clutches(match)
    duels = M.opening_duels(match)
    eco = E.team_economy(match)

    failures: list[str] = []

    wins = sum(v["overall"]["numerator"] for v in swr.values())
    if wins != len(match.rounds):
        failures.append(f"round wins sum to {wins}, expected {len(match.rounds)}")

    kills = sum(p["kills"] for p in stats["players"])
    deaths = sum(p["deaths"] for p in stats["players"])
    if kills != deaths:
        failures.append(f"kills ({kills}) != deaths ({deaths})")

    if clutch["reconstruction_warnings"]:
        failures.append(
            f"{len(clutch['reconstruction_warnings'])} deaths could not be "
            "matched to the reconstructed alive set")

    # Bombsites: every plant must be attributed to exactly one resolved site,
    # and each site's plant count must add up to the rounds that had a plant.
    sites = A.resolve_bombsites(match, match.plants)
    planted_rounds = [r for r in match.rounds if r.bomb_planted]
    if sites:
        attributed = sum(s.plant_count for s in sites)
        if attributed != len(planted_rounds):
            failures.append(
                f"bombsites account for {attributed} plants but {len(planted_rounds)} "
                "rounds had one")
        unlabelled = [r.number for r in planted_rounds if r.plant_site is None]
        if unlabelled:
            failures.append(f"rounds with an unattributed plant: {unlabelled}")

    calibration = A.load_calibration(match.map_name)
    off_map: list[dict] = []
    if calibration:
        layers = A.radar_layers(match, sites, calibration)
        projected = [p for key in ("kills", "utility", "plants")
                     for p in layers.get(key, [])]
        off_map = [p for p in projected
                   if not (0.0 <= p["x"] <= 1.0 and 0.0 <= p["y"] <= 1.0)]

        # A wrong transform shifts or scales everything, so it pushes most
        # events out, and far out. A grenade that left the area the radar
        # image covers is one point, barely outside - real, and no reason to
        # distrust the rest of the demo.
        worst = max((max(abs(p["x"] - 0.5), abs(p["y"] - 0.5)) - 0.5
                     for p in off_map), default=0.0)
        share = len(off_map) / len(projected) if projected else 0.0
        if projected and (share > 0.01 or worst > 0.25):
            failures.append(
                f"{len(off_map)} of {len(projected)} projected events fall "
                f"outside the radar image (worst {worst:.2f} beyond the edge); "
                "the calibration for this map is wrong")

    # Attack labels must agree with the plant, which records the target site
    # directly. A label that contradicts it is wrong by construction.
    attacks = TAC.classify_attacks(match, sites) if sites else {}
    for rec in attacks.get("rounds", []):
        if rec.get("plant_site") and rec.get("target_site") != rec["plant_site"]:
            failures.append(
                f"round {rec['round']}: attack labelled against "
                f"{rec.get('target_site')} but the bomb was planted at "
                f"{rec['plant_site']}")
        arrival = rec.get("arrival_seconds")
        if arrival is not None and arrival < 0:
            failures.append(
                f"round {rec['round']}: arrival {arrival}s precedes freeze-time end")

    # A full buy for five players tops out near $40,000, so a gap in the
    # hundreds of thousands means the arithmetic wrapped rather than that one
    # team was rich. This is the check that catches unsigned subtraction.
    anti = E.anti_eco(match)
    MAX_PLAUSIBLE_GAP = 100_000
    for row in anti.get("rounds", []):
        if row["equip_value_gap"] > MAX_PLAUSIBLE_GAP:
            failures.append(
                f"round {row['round']}: equipment gap ${row['equip_value_gap']:,} "
                "exceeds anything five players can buy; the subtraction wrapped")

    for team, buckets in eco["by_team"].items():
        counted = sum(b["rounds"] for b in buckets["buy_types"].values())
        played = swr[team]["overall"]["denominator"]
        if counted != played:
            failures.append(
                f"{team}: buy types cover {counted} rounds but the team played {played}")

    print(f"map         {match.map_name}")
    print(f"rounds      {len(match.rounds)}")
    print(f"score       " + "  ".join(
        f"{t} {v['overall']['numerator']}" for t, v in swr.items()))
    print(f"kills       {kills} (= deaths {deaths})")
    print(f"duels       {duels['rounds_with_an_opening_duel']}/{duels['rounds_total']} "
          f"rounds, {duels['team_kills_excluded']} team-kills excluded")
    if sites:
        print("bombsites   " + "  ".join(
            f"{s.label} ({s.plant_count} plants, {s.label_source})" for s in sites))
    else:
        print("bombsites   not resolved: no plants observed")
    if not calibration:
        print(f"radar       no calibration for {match.map_name}")
    elif off_map:
        kinds = ", ".join(sorted({str(p.get("type") or "kill") for p in off_map}))
        print(f"radar       {len(off_map)} event(s) landed outside the drawn "
              f"area ({kinds}); within tolerance")
    if attacks.get("rounds"):
        inferred = sum(1 for r in attacks["rounds"]
                       if r.get("target_source") == "inferred_from_arrival")
        low = sum(1 for r in attacks["rounds"] if r.get("confidence") == "low")
        print(f"attacks     {len(attacks['rounds'])} classified "
              f"({inferred} target inferred, {low} low confidence, "
              f"{len(attacks.get('arrival_rule_misses', []))} arrival-rule misses)")
    for w in match.warnings:
        print(f"warning     {w}")

    if failures:
        print("\nFAILED")
        for f in failures:
            print(f"  - {f}")
        return 1
    print("\nall consistency checks passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
