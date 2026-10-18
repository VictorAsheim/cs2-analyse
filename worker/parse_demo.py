"""Parse a CS2 demo into a match-facts JSON document.

    python parse_demo.py <demo.dem> [-o out.json] [--positions out.parquet]

The JSON is the only thing downstream consumers read: the web layer renders it,
and the report layer reasons over it. Sampled player positions are written
separately because they are two orders of magnitude larger than the facts and
are only needed by the heatmap and area layers.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import logging
import os
import time
from dataclasses import asdict
from datetime import datetime, timezone

from cs2intel import SCHEMA_VERSION
from cs2intel import areas as A
from cs2intel import economy as E
from cs2intel import findings as F
from cs2intel import metrics as M
from cs2intel import players as PL
from cs2intel import site_metrics as SM
from cs2intel import tactics as TAC
from cs2intel import utility as U
from cs2intel.extract import Match, extract

log = logging.getLogger("parse_demo")


def _sha256(path: str, chunk: int = 1 << 20) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        while block := fh.read(chunk):
            h.update(block)
    return h.hexdigest()


def _scoreboard(match: Match) -> dict:
    """Final score per team, counted from recorded round winners."""
    score: dict[str, int] = {team: 0 for team in match.teams}
    for r in match.rounds:
        for clan, side in r.sides.items():
            if r.winner == side:
                score[clan] = score.get(clan, 0) + 1
    return score


def build_facts(match: Match) -> dict:
    """Assemble every deterministic figure into one document."""
    sites = A.resolve_bombsites(match, match.plants)
    calibration = A.load_calibration(match.map_name)

    rounds = []
    for r in match.rounds:
        d = asdict(r)
        d["duration_seconds"] = round(
            (r.end_tick - (r.freeze_end_tick or r.start_tick)) / match.tickrate, 1)
        rounds.append(d)

    return {
        "schema_version": SCHEMA_VERSION,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "match": {
            "map": match.map_name,
            "server_name": match.server_name,
            "tickrate": match.tickrate,
            "rounds_played": len(match.rounds),
            "score": _scoreboard(match),
            "teams": {k: [str(s) for s in v] for k, v in match.teams.items()},
            "players": match.players[["steamid", "name", "clan"]]
                       .astype(str).to_dict("records"),
        },
        "rounds": rounds,
        "stats": {
            "side_win_rates": M.side_win_rates(match),
            "round_outcomes": M.round_end_reasons(match),
            "opening_duels": M.opening_duels(match),
            "trades": M.trades(match),
            "economy": E.team_economy(match),
            "anti_eco": E.anti_eco(match),
            "reaction_buys": E.reaction_buys(match),
            "utility_usage": U.utility_usage(match),
            "utility_effectiveness": U.utility_effectiveness(match),
            "players": PL.player_stats(match),
            "clutches": PL.clutches(match),
            "site_attack": SM.site_attack(match, sites),
            "site_defence": SM.site_defence(match, sites),
            "ct_setups": SM.ct_setups(match, sites),
            "retake_arrivals": SM.retake_arrivals(match, sites),
            "position_presence": SM.position_presence(match, sites),
            "attack_patterns": TAC.classify_attacks(match, sites),
        },
        "areas": {
            "bombsites": [
                {"site_id": s.site_id, "label": s.label,
                 "label_source": s.label_source,
                 "centroid": [round(s.centroid_x, 1), round(s.centroid_y, 1)],
                 "plants_observed": s.plant_count,
                 "radius_world_units": round(s.radius, 0)}
                for s in sites
            ],
            "callouts_available": False,
            "callout_note": ("CS2's nav format carries no place names and no "
                             "public dataset ships authoritative CS2 callouts, "
                             "so areas are limited to resolved bombsites. "
                             "Route and callout statistics are not available."),
        },
        "radar": A.radar_layers(match, sites, calibration),
        "data_limits": {
            "demos_in_sample": 1,
            "position_sample_hz": 2.0,
            "bombsites_resolved": len(sites),
            "callouts_resolved": False,
            "attack_patterns_are_inferred": True,
            "note": ("single-demo sample: figures describe this match only and "
                     "cannot distinguish a recurring pattern from a one-off. "
                     "Bombsites are resolved, so site-level attack, defence, "
                     "setup and retake figures are available; callouts are "
                     "not, so route-level questions remain unanswered."),
        },
        "warnings": match.warnings,
    }


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("demo")
    ap.add_argument("-o", "--out", default=None, help="facts JSON output path")
    ap.add_argument("--positions", default=None,
                    help="write sampled positions to this parquet file")
    ap.add_argument("--position-hz", type=float, default=2.0)
    ap.add_argument("--radar", default=None,
                    help="copy the map's radar image here, so a finished "
                         "analysis does not depend on the awpy cache")
    ap.add_argument("-q", "--quiet", action="store_true")
    args = ap.parse_args()

    logging.basicConfig(level=logging.WARNING if args.quiet else logging.INFO,
                        format="%(message)s")

    t0 = time.time()
    log.info("parsing %s (%.0f MB)", os.path.basename(args.demo),
             os.path.getsize(args.demo) / 1e6)
    match = extract(args.demo, position_hz=args.position_hz)
    log.info("  %d rounds, %d players, %.1fs",
             len(match.rounds), len(match.players), time.time() - t0)

    facts = build_facts(match)
    ranked = F.collect(facts)
    facts["findings"] = F.to_dict(ranked)
    facts["summary"] = F.summarise(facts, ranked)
    facts["source"] = {
        "filename": os.path.basename(args.demo),
        "size_bytes": os.path.getsize(args.demo),
        "sha256": _sha256(args.demo),
    }
    facts["parse_seconds"] = round(time.time() - t0, 1)

    out = args.out or os.path.splitext(args.demo)[0] + ".facts.json"
    with open(out, "w", encoding="utf-8") as fh:
        json.dump(facts, fh, indent=1, default=str)
    log.info("wrote %s (%.1f MB)", out, os.path.getsize(out) / 1e6)

    if args.positions:
        match.positions.to_parquet(args.positions, index=False)
        log.info("wrote %s (%d rows)", args.positions, len(match.positions))

    if args.radar:
        try:
            import shutil
            import awpy.data as awpy_data
            shutil.copy(awpy_data.radar_path(match.map_name), args.radar)
            log.info("wrote %s", args.radar)
        except Exception as exc:
            # A missing radar costs the map view and nothing else, so this is
            # reported rather than raised.
            log.warning("no radar image for %s: %s", match.map_name, exc)

    for w in facts["warnings"]:
        log.warning("warning: %s", w)


if __name__ == "__main__":
    main()
