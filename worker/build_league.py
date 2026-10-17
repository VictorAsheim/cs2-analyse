"""Aggregate parsed matches into a per-team, per-map league view.

    python build_league.py [-c league.config.json] [-o data/league.json]

Reads every facts document in data/facts, groups it by team and by map, and
writes one document the site renders: the division table, each team's matches,
and for each map they have played, how it went and what stood out.

Nothing is re-measured here. Per-map figures are sums of round outcomes the
match layer already computed, and the strengths and weaknesses are the
findings that match already produced, filed under the team they concern. What
this layer adds is the grouping - and the sample sizes that come with it,
which are small enough to be reported next to every figure.
"""
from __future__ import annotations

import argparse
import glob
import io
import json
import os
import re
import unicodedata
from collections import defaultdict
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def slugify(name: str) -> str:
    """A URL-safe id for a team name, accents folded."""
    folded = unicodedata.normalize("NFKD", name)
    folded = "".join(c for c in folded if not unicodedata.combining(c))
    folded = folded.replace("ø", "o").replace("Ø", "O")
    return re.sub(r"[^a-z0-9]+", "-", folded.lower()).strip("-")


def rate(numerator: int, denominator: int, definition: str) -> dict:
    return {
        "value": round(numerator / denominator, 4) if denominator else None,
        "numerator": int(numerator),
        "denominator": int(denominator),
        "definition": definition,
    }


def load_config(path: str) -> tuple[dict, dict[str, str]]:
    """The league config, plus a lookup from every known name to the canonical one."""
    config = json.load(io.open(path, encoding="utf-8"))
    canonical: dict[str, str] = {}
    for team in config["teams"]:
        canonical[team["name"]] = team["name"]
        for alias in team.get("aliases", []):
            canonical[alias] = team["name"]
    return config, canonical


def load_matches(facts_dir: str) -> list[dict]:
    out = []
    for path in sorted(glob.glob(os.path.join(facts_dir, "*.facts.json"))):
        facts = json.load(io.open(path, encoding="utf-8"))
        facts["_id"] = os.path.basename(path).replace(".facts.json", "")
        out.append(facts)
    return out


def _side_rounds(facts: dict, team: str) -> dict:
    """Rounds won and played per side, counted from the round list."""
    won = {"T": 0, "CT": 0}
    played = {"T": 0, "CT": 0}
    for r in facts.get("rounds", []):
        side = (r.get("sides") or {}).get(team)
        if side not in played:
            continue
        played[side] += 1
        if r.get("winner") == side:
            won[side] += 1
    return {"won": won, "played": played}


def build(config_path: str, facts_dir: str) -> dict:
    config, canonical = load_config(config_path)
    matches = load_matches(facts_dir)

    # team -> map -> list of per-match records
    per_team_map: dict[str, dict[str, list[dict]]] = defaultdict(lambda: defaultdict(list))
    per_team_matches: dict[str, list[dict]] = defaultdict(list)
    unknown_teams: set[str] = set()

    for facts in matches:
        match = facts["match"]
        map_name = match["map"]
        score = match.get("score", {})
        raw_teams = list(score)
        if len(raw_teams) != 2:
            continue

        for raw in raw_teams:
            name = canonical.get(raw)
            if name is None:
                unknown_teams.add(raw)
                continue
            other_raw = next(t for t in raw_teams if t != raw)
            opponent = canonical.get(other_raw, other_raw)

            sides = _side_rounds(facts, raw)
            stats = facts.get("stats", {})

            record = {
                "match_id": facts["_id"],
                "map": map_name,
                "opponent": opponent,
                "rounds_for": score.get(raw, 0),
                "rounds_against": score.get(other_raw, 0),
                "won": score.get(raw, 0) > score.get(other_raw, 0),
                "sides": sides,
                "plant_rate": (stats.get("round_outcomes", {}).get(raw) or {})
                              .get("plant_rate_as_t"),
                "post_plant": (stats.get("round_outcomes", {}).get(raw) or {})
                              .get("post_plant_win_rate_as_t"),
                "opening_duels": (stats.get("opening_duels", {}).get("by_team", {})
                                  .get(raw) or {}).get("opening_duel_win_rate"),
                "findings": [
                    _canonicalise(f, canonical)
                    for f in facts.get("findings", [])
                    if canonical.get(f["subject"], f["subject"]) == name
                    or _is_player_of(f, stats, raw)
                ],
            }
            per_team_map[name][map_name].append(record)
            per_team_matches[name].append(record)

    teams_out = []
    for team in config["teams"]:
        name = team["name"]
        maps_out = {}
        for map_name, records in sorted(per_team_map.get(name, {}).items()):
            rounds_for = sum(r["rounds_for"] for r in records)
            rounds_against = sum(r["rounds_against"] for r in records)
            wins = sum(1 for r in records if r["won"])

            t_won = sum(r["sides"]["won"]["T"] for r in records)
            t_played = sum(r["sides"]["played"]["T"] for r in records)
            ct_won = sum(r["sides"]["won"]["CT"] for r in records)
            ct_played = sum(r["sides"]["played"]["CT"] for r in records)

            findings = [f for r in records for f in r["findings"]]
            findings.sort(key=lambda f: -f["score"])

            maps_out[map_name] = {
                "matches": len(records),
                "match_wins": wins,
                "rounds_for": rounds_for,
                "rounds_against": rounds_against,
                "round_win_rate": rate(
                    rounds_for, rounds_for + rounds_against,
                    "runder vunnet / runder spilt på dette kartet"),
                "t": rate(t_won, t_played, "runder vunnet som T / runder spilt som T"),
                "ct": rate(ct_won, ct_played, "runder vunnet som CT / runder spilt som CT"),
                "strengths": [f for f in findings if f["severity"] == "good"][:4],
                "weaknesses": [f for f in findings if f["severity"] != "good"][:6],
                "match_ids": [r["match_id"] for r in records],
            }

        played_maps = sorted(
            maps_out.items(),
            key=lambda kv: (-(kv[1]["round_win_rate"]["value"] or 0), kv[0]),
        )

        teams_out.append({
            "slug": slugify(name),
            "name": name,
            "standing": team.get("standing"),
            "maps_played": len(maps_out),
            "best_map": played_maps[0][0] if played_maps else None,
            "worst_map": played_maps[-1][0] if played_maps else None,
            "maps": maps_out,
            "matches": sorted(per_team_matches.get(name, []),
                              key=lambda r: (r["map"], r["match_id"])),
            "demos_analysed": len(per_team_matches.get(name, [])),
        })

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "division": config.get("division"),
        "format": config.get("format"),
        "table_updated": config.get("table_updated"),
        "table_note": ("plasseringen er avskrevet fra ligatabellen, ikke regnet "
                       "ut fra demoene"),
        "teams": sorted(teams_out,
                        key=lambda t: (t["standing"] or {}).get("rank", 99)),
        "unmatched_clan_names": sorted(unknown_teams),
        "matches_analysed": len(matches),
    }


def _canonicalise(finding: dict, canonical: dict[str, str]) -> dict:
    """Rewrite demo clan names in a finding's text to the league's spelling.

    Findings are written when a match is parsed, using the clan name the
    server recorded, so a team whose name loses its accents there would be
    called one thing on its own page and another in its findings.
    """
    out = dict(finding)
    out["subject"] = canonical.get(finding["subject"], finding["subject"])
    for field in ("title", "detail"):
        text = out.get(field) or ""
        for raw, proper in canonical.items():
            if raw != proper and raw in text:
                text = text.replace(raw, proper)
        out[field] = text
    return out


def _is_player_of(finding: dict, stats: dict, raw_team: str) -> bool:
    """Whether a player-level finding belongs to this team.

    Player findings name the player, not the team, so the roster has to be
    consulted; without this a defender's habit would be filed under neither
    side.
    """
    subject = finding.get("subject")
    for player in stats.get("players", {}).get("players", []):
        if player.get("name") == subject:
            return player.get("team") == raw_team
    for player in stats.get("ct_setups", {}).get("by_player", []):
        if player.get("name") == subject:
            return player.get("team") == raw_team
    return False


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("-c", "--config", default=os.path.join(ROOT, "league.config.json"))
    ap.add_argument("-o", "--out", default=os.path.join(ROOT, "data", "league.json"))
    ap.add_argument("--facts", default=os.path.join(ROOT, "data", "facts"))
    args = ap.parse_args()

    league = build(args.config, args.facts)
    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    with io.open(args.out, "w", encoding="utf-8") as fh:
        json.dump(league, fh, indent=1, ensure_ascii=False)

    print(f"{league['matches_analysed']} kamper -> {len(league['teams'])} lag")
    for team in league["teams"]:
        maps = ", ".join(team["maps"]) or "ingen demoer"
        print(f"  {team['name']:24s} {team['demos_analysed']} demoer  [{maps}]")
    if league["unmatched_clan_names"]:
        print("\nklannavn uten lag i konfigurasjonen (legg dem inn som alias):")
        for n in league["unmatched_clan_names"]:
            print(f"  {n!r}")
    print(f"\nskrev {args.out}")


if __name__ == "__main__":
    main()
