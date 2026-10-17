"""Ranked findings: the handful of things worth acting on, in order.

Every statistic the system produces is true and almost none of it is urgent.
This module applies fixed rules to the computed statistics and ranks what comes
out, so a reader meets the exploitable things first instead of a wall of
tables.

Nothing new is measured here. A finding is a restatement of figures computed
elsewhere, plus the rule that selected it, so each one carries its evidence and
can be checked against the section it came from.

Ranking is `effect x sample confidence`. Effect is how far the figure sits from
a neutral baseline; sample confidence rises with the denominator and is capped
at 1. The product means a 100% rate over two rounds cannot outrank a 25% rate
over twelve, which is the failure mode a single-demo sample invites.
"""
from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class Finding:
    rule: str                    # which rule fired
    subject: str                 # the team the finding is about
    severity: str                # "critical" | "serious" | "warning" | "good"
    title: str
    detail: str
    evidence: dict = field(default_factory=dict)
    score: float = 0.0
    confidence: str = "low"
    section: str | None = None   # where in the page to verify it


def _confidence(denominator: int, full_at: int) -> tuple[float, str]:
    """Sample weight in 0-1, and the word for it.

    `full_at` is the denominator at which a rule is considered to have seen
    enough. Below it the weight scales linearly, so thin evidence is ranked
    down rather than excluded outright.
    """
    weight = min(1.0, denominator / full_at) if full_at else 0.0
    label = "high" if weight >= 1.0 else "medium" if weight >= 0.6 else "low"
    return weight, label


def _rate_value(rate: dict | None) -> float | None:
    if not rate or rate.get("denominator", 0) == 0:
        return None
    return rate.get("value")


def collect(facts: dict) -> list[Finding]:
    """Run every rule over a facts document and return findings, worst first."""
    stats = facts.get("stats", {})
    teams = list(facts.get("match", {}).get("teams", {}))
    out: list[Finding] = []

    out += _site_defence_rules(stats, teams)
    out += _retake_arrival_rules(stats, teams)
    out += _utility_rules(stats, teams)
    out += _trade_rules(stats, teams)
    out += _opening_duel_rules(stats, teams)
    out += _setup_rules(stats)
    out += _attack_pattern_rules(stats)
    out += _economy_rules(stats, teams)
    out += _strength_rules(stats, teams)

    return sorted(out, key=lambda f: -f.score)


# --- rules --------------------------------------------------------------------

def _site_defence_rules(stats: dict, teams: list[str]) -> list[Finding]:
    """A site a team keeps losing once the bomb is down."""
    found = []
    defence = stats.get("site_defence", {}).get("by_team", {})
    for team in teams:
        entry = defence.get(team)
        if not entry:
            continue
        for site, d in entry.get("per_site", {}).items():
            conceded = d.get("plants_conceded", 0)
            value = _rate_value(d.get("retake_rate"))
            if conceded < 3 or value is None or value > 0.34:
                continue
            weight, label = _confidence(conceded, 6)
            effect = (0.5 - value) / 0.5
            won = d["retake_rate"]["numerator"]
            found.append(Finding(
                rule="site_retake_weak",
                subject=team,
                severity="critical" if value <= 0.1 else "serious",
                title=(f"{team} vant aldri tilbake {site}" if won == 0
                       else f"{team} vinner sjelden tilbake {site}"),
                detail=(f"Av {conceded} plants sluppet inn på {site} ble "
                        + ("ingen runder vunnet." if won == 0
                           else f"bare {won} runde{'r' if won != 1 else ''} vunnet.")),
                evidence={"site": site, "retake_rate": d["retake_rate"],
                          "defuses": d.get("defuses")},
                score=effect * weight,
                confidence=label,
                section="Forsvar per bombesite",
            ))
    return found


def _retake_arrival_rules(stats: dict, teams: list[str]) -> list[Finding]:
    """Defenders who do not physically get back to the site."""
    found = []
    arrivals = stats.get("retake_arrivals", {}).get("by_team", {})
    for team in teams:
        entry = arrivals.get(team)
        if not entry:
            continue
        reached = entry.get("site_reached")
        value = _rate_value(reached)
        conceded = entry.get("plants_conceded", 0)
        if value is None or conceded < 4 or value > 0.8:
            continue
        weight, label = _confidence(conceded, 8)
        effect = 1.0 - value
        missed = reached["denominator"] - reached["numerator"]
        found.append(Finding(
            rule="retake_never_arrives",
            subject=team,
            severity="serious",
            title=f"{team} når ikke fram til siten etter plant",
            detail=(f"I {missed} av {reached['denominator']} runder med plant mot "
                    f"seg kom ingen CT seg inn på siten i det hele tatt. "
                    f"Median ankomsttid for de som kom fram: "
                    f"{entry.get('median_seconds_to_site')} s."),
            evidence={"site_reached": reached,
                      "median_seconds": entry.get("median_seconds_to_site")},
            score=effect * weight,
            confidence=label,
            section="Retake-ankomst",
        ))
    return found


def _utility_rules(stats: dict, teams: list[str]) -> list[Finding]:
    """One team buying and using markedly less utility than the other."""
    usage = stats.get("utility_usage", {}).get("by_team", {})
    totals: dict[str, tuple[float, int]] = {}
    for team in teams:
        entry = usage.get(team)
        if not entry:
            continue
        thrown = rounds = 0
        for side in entry.get("per_side", {}).values():
            thrown += side.get("thrown_total", 0)
            rounds += side.get("rounds_played", 0)
        if rounds:
            totals[team] = (thrown / rounds, rounds)

    if len(totals) != 2:
        return []
    (low_team, (low, low_rounds)), (high_team, (high, _)) = sorted(
        totals.items(), key=lambda kv: kv[1][0])
    if high <= 0 or (high - low) / high < 0.25:
        return []

    weight, label = _confidence(low_rounds, 20)
    return [Finding(
        rule="utility_deficit",
        subject=low_team,
        severity="warning",
        title=f"{low_team} kaster langt mindre utility",
        detail=(f"{low:.1f} granater per runde mot {high_team} sine {high:.1f} "
                f"— {(high - low) / high * 100:.0f} % mindre. Målt over "
                f"{low_rounds} runder."),
        evidence={"per_round": round(low, 2), "opponent_per_round": round(high, 2),
                  "rounds": low_rounds},
        score=((high - low) / high) * weight,
        confidence=label,
        section="Granatbruk",
    )]


def _trade_rules(stats: dict, teams: list[str]) -> list[Finding]:
    """Deaths that go unavenged: players dying alone."""
    found = []
    trades = stats.get("trades", {}).get("by_team", {})
    for team in teams:
        entry = trades.get(team)
        if not entry:
            continue
        traded = entry.get("traded_death_rate")
        value = _rate_value(traded)
        if value is None or value > 0.18:
            continue
        weight, label = _confidence(traded["denominator"], 80)
        found.append(Finding(
            rule="low_trade_rate",
            subject=team,
            severity="warning",
            title=f"{team} blir sjelden byttet opp etter et dødsfall",
            detail=(f"Bare {traded['numerator']} av {traded['denominator']} "
                    f"dødsfall ble hevnet innen "
                    f"{stats['trades'].get('window_seconds')} sekunder. Spillere "
                    "dør alene og motstanderen får duellene gratis."),
            evidence={"traded_death_rate": traded},
            score=((0.25 - value) / 0.25) * weight,
            confidence=label,
            section="Trading",
        ))
    return found


def _opening_duel_rules(stats: dict, teams: list[str]) -> list[Finding]:
    """A player who keeps losing the first duel of the round."""
    found = []
    for player in stats.get("opening_duels", {}).get("by_player", []):
        duels = player.get("opening_duel_win_rate", {})
        value = _rate_value(duels)
        total = duels.get("denominator", 0)
        if value is None or total < 6 or value > 0.35:
            continue
        weight, label = _confidence(total, 12)
        found.append(Finding(
            rule="opening_duel_weak_player",
            subject=player.get("name", "?"),
            severity="warning",
            title=f"{player['name']} taper åpningsduellene",
            detail=(f"{duels['numerator']} av {duels['denominator']} åpningsdueller "
                    f"vunnet. Å oppsøke denne spilleren tidlig i runden er den "
                    "billigste duellen på kartet."),
            evidence={"opening_duel_win_rate": duels,
                      "opening_deaths": player.get("opening_deaths")},
            score=((0.5 - value) / 0.5) * weight,
            confidence=label,
            section="Åpningsdueller",
        ))
    return found


def _setup_rules(stats: dict) -> list[Finding]:
    """A defender who holds the same callout nearly every round.

    Reported by callout rather than by distance to a bombsite. The distance
    version fired on half of every roster, because holding an off-site
    position - Jungle, Connector, Apps - is how the side is played, not a
    tell. Holding *the same named spot* almost every round is a tell.
    """
    found = []
    for player in stats.get("ct_setups", {}).get("by_player", []):
        share = player.get("share_at_most_common", {})
        value = _rate_value(share)
        rounds = share.get("denominator", 0)
        spot = player.get("most_common", "?")
        if value is None or rounds < 8 or value < 0.7 or spot == "ukjent":
            continue
        weight, label = _confidence(rounds, 14)
        found.append(Finding(
            rule="predictable_setup",
            subject=player.get("name", "?"),
            severity="serious" if value >= 0.85 else "warning",
            title=f"{player['name']} står på {spot} nesten hver runde",
            detail=(f"{share['numerator']} av {share['denominator']} CT-runder "
                    f"startet på {spot}"
                    + (f", og bare {player.get('distinct_positions')} ulike "
                       "posisjoner totalt." if player.get("distinct_positions")
                       else ".")
                    + " En utility-åpning mot dette punktet treffer hver gang."),
            evidence={"callout": spot,
                      "share_at_most_common": share,
                      "positions": player.get("positions"),
                      "team": player.get("team")},
            score=value * weight,
            confidence=label,
            section="CT-oppsett",
        ))
    return found


def _attack_pattern_rules(stats: dict) -> list[Finding]:
    """A repeated attack shape that keeps working."""
    found = []
    patterns = stats.get("attack_patterns", {})
    for team, entry in patterns.get("by_team", {}).items():
        for name, data in entry.get("patterns", {}).items():
            rounds = data.get("rounds", [])
            win = data.get("win_rate", {})
            value = _rate_value(win)
            if len(rounds) < 3 or value is None or value < 0.7:
                continue
            weight, label = _confidence(len(rounds), 5)
            found.append(Finding(
                rule="repeated_attack_pattern",
                subject=team,
                severity="good",
                title=f"{team} gjentar «{name}» og vinner på det",
                detail=(f"{win['numerator']} av {win['denominator']} runder vunnet "
                        f"med dette mønsteret (runde {', '.join(map(str, rounds))}). "
                        "Merk at mønstermerkingen er utledet, ikke målt."),
                evidence={"pattern": name, "rounds": rounds, "win_rate": win},
                score=value * weight * 0.9,   # inferred layer ranks below measured
                confidence=label,
                section="Angrepsmønstre",
            ))
    return found


def _economy_rules(stats: dict, teams: list[str]) -> list[Finding]:
    """Full buys that do not convert, and eco rounds that leak."""
    found = []
    economy = stats.get("economy", {}).get("by_team", {})
    for team in teams:
        buckets = economy.get(team, {}).get("buy_types", {})
        full = buckets.get("full_buy")
        if not full:
            continue
        win = full.get("win_rate", {})
        value = _rate_value(win)
        if value is None or win.get("denominator", 0) < 10 or value > 0.5:
            continue
        weight, label = _confidence(win["denominator"], 16)
        found.append(Finding(
            rule="full_buy_conversion",
            subject=team,
            severity="warning",
            title=f"{team} omsetter ikke full buy",
            detail=(f"{win['numerator']} av {win['denominator']} full-buy-runder "
                    "vunnet. Utstyret er ikke problemet."),
            evidence={"full_buy_win_rate": win},
            score=((0.55 - value) / 0.55) * weight,
            confidence=label,
            section="Økonomi",
        ))

    anti = stats.get("anti_eco", {})
    conversion = anti.get("conversion_rate")
    value = _rate_value(conversion)
    if value is not None and conversion["denominator"] >= 6 and value <= 0.8:
        lost = conversion["denominator"] - conversion["numerator"]
        weight, label = _confidence(conversion["denominator"], 12)
        found.append(Finding(
            rule="equipment_advantage_leak",
            subject="begge lag",
            severity="warning",
            title="Utstyrsovertak omsettes ikke konsekvent",
            detail=(f"Laget med minst ${anti.get('gap_threshold_usd'):,} mer utstyr "
                    f"tapte {lost} av {conversion['denominator']} slike runder."
                    ).replace(",", " "),
            evidence={"conversion_rate": conversion},
            score=(1.0 - value) * weight * 0.8,
            confidence=label,
            section="Økonomi",
        ))
    return found


def _strength_rules(stats: dict, teams: list[str]) -> list[Finding]:
    """What a team does well.

    A scouting report that only lists weaknesses reads as if the opponent is
    bad at everything, which is both wrong and useless for preparation: the
    things they do well are what you have to plan around.
    """
    found = []

    defence = stats.get("site_defence", {}).get("by_team", {})
    for team in teams:
        for site, d in (defence.get(team) or {}).get("per_site", {}).items():
            conceded = d.get("plants_conceded", 0)
            value = _rate_value(d.get("retake_rate"))
            if conceded < 3 or value is None or value < 0.5:
                continue
            weight, label = _confidence(conceded, 6)
            found.append(Finding(
                rule="strong_retake",
                subject=team, severity="good",
                title=f"{team} tar tilbake {site} ofte",
                detail=(f"Vant {d['retake_rate']['numerator']} av {conceded} runder "
                        f"der motstanderen fikk plantet på {site}."),
                evidence={"site": site, "retake_rate": d["retake_rate"]},
                score=value * weight, confidence=label,
                section="Forsvar per bombesite",
            ))

    outcomes = stats.get("round_outcomes", {})
    for team in teams:
        pp = (outcomes.get(team) or {}).get("post_plant_win_rate_as_t")
        value = _rate_value(pp)
        if value is None or pp.get("denominator", 0) < 5 or value < 0.8:
            continue
        weight, label = _confidence(pp["denominator"], 10)
        found.append(Finding(
            rule="strong_post_plant",
            subject=team, severity="good",
            title=f"{team} holder post-plant",
            detail=(f"Vant {pp['numerator']} av {pp['denominator']} runder de "
                    "fikk plantet i."),
            evidence={"post_plant_win_rate": pp},
            score=value * weight, confidence=label,
            section="Bombe og rundeavslutninger",
        ))

    duels = stats.get("opening_duels", {}).get("by_team", {})
    for team in teams:
        rate_ = (duels.get(team) or {}).get("opening_duel_win_rate")
        value = _rate_value(rate_)
        if value is None or rate_.get("denominator", 0) < 12 or value < 0.58:
            continue
        weight, label = _confidence(rate_["denominator"], 20)
        found.append(Finding(
            rule="strong_opening_duels",
            subject=team, severity="good",
            title=f"{team} vinner åpningsduellene",
            detail=(f"{rate_['numerator']} av {rate_['denominator']} første-drap "
                    "i runden gikk deres vei."),
            evidence={"opening_duel_win_rate": rate_},
            score=value * weight, confidence=label,
            section="Åpningsdueller",
        ))

    usage = stats.get("utility_usage", {}).get("by_team", {})
    totals = {}
    for team in teams:
        entry = usage.get(team)
        if not entry:
            continue
        thrown = rounds = 0
        for side in entry.get("per_side", {}).values():
            thrown += side.get("thrown_total", 0)
            rounds += side.get("rounds_played", 0)
        if rounds:
            totals[team] = (thrown / rounds, rounds)
    if len(totals) == 2:
        (low, _), (high_team, (high, high_rounds)) = (
            sorted(totals.items(), key=lambda kv: kv[1][0])[0][1],
            sorted(totals.items(), key=lambda kv: kv[1][0])[1],
        )
        if high > 0 and (high - low) / high >= 0.25:
            weight, label = _confidence(high_rounds, 20)
            found.append(Finding(
                rule="utility_advantage",
                subject=high_team, severity="good",
                title=f"{high_team} spiller med mye utility",
                detail=(f"{high:.1f} granater per runde mot motstanderens "
                        f"{low:.1f}. Forvent røyk og molotov på hver execute."),
                evidence={"per_round": round(high, 2),
                          "opponent_per_round": round(low, 2)},
                score=((high - low) / high) * weight, confidence=label,
                section="Granatbruk",
            ))

    return found


def summarise(facts: dict, findings: list[Finding]) -> dict:
    """A short briefing: the result, the sides, and the top finding per team."""
    match = facts.get("match", {})
    score = match.get("score", {})
    ranked = sorted(score.items(), key=lambda kv: -kv[1])
    sides = facts.get("stats", {}).get("side_win_rates", {})

    per_team: dict[str, dict] = {}
    for team in score:
        top = next((f for f in findings if f.subject == team), None)
        per_team[team] = {
            "rounds_won": score[team],
            "t": sides.get(team, {}).get("T"),
            "ct": sides.get(team, {}).get("CT"),
            "headline": {"title": top.title, "detail": top.detail,
                         "severity": top.severity, "confidence": top.confidence}
            if top else None,
        }

    return {
        "map": match.get("map"),
        "rounds": match.get("rounds_played"),
        "result": [{"team": t, "rounds": n} for t, n in ranked],
        "per_team": per_team,
        "findings_total": len(findings),
        "limits": {
            "demos_in_sample": facts.get("data_limits", {}).get("demos_in_sample"),
            "bombsites_resolved": facts.get("data_limits", {}).get("bombsites_resolved"),
            "callouts_resolved": facts.get("data_limits", {}).get("callouts_resolved"),
        },
    }


def to_dict(findings: list[Finding]) -> list[dict]:
    return [
        {
            "rule": f.rule, "subject": f.subject, "severity": f.severity,
            "title": f.title, "detail": f.detail, "evidence": f.evidence,
            "score": round(f.score, 4), "confidence": f.confidence,
            "section": f.section,
        }
        for f in findings
    ]
