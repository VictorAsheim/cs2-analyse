import RadarMap from "@/components/RadarMap";
import {
  DetailGroup, Note, Row, RateValue, Section, SideBadge, Table,
} from "@/components/stats";

const pct = (v: number | null | undefined) =>
  v === null || v === undefined ? "\u2013" : `${(v * 100).toFixed(0)}%`;

/**
 * Every detail table, grouped and collapsed.
 *
 * These are the working numbers behind the findings up top. They are collapsed
 * because a reader who wants to check one figure should not have to scroll
 * past twelve tables to reach it, and a reader who does not want them should
 * not meet them at all.
 */
export default function MatchDetails({
  facts, teams,
}: { facts: any; teams: string[] }) {
  const s = facts.stats;

  return (
    <div className="mt-10 space-y-2">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-neutral-500">
        Detaljer
      </h2>
      <DetailGroup title="Lag, sider og bombesiter" blurb="Vinnerrate per side, rundeavslutninger, og angrep og forsvar per site.">
    {/* ---------------- sides ---------------- */}
          <Section
            title="Vinnerrate per side"
            subtitle="Runder vunnet delt på runder spilt på den siden, overtid inkludert."
          >
            <Table head={["Lag", "T", "CT", "Totalt"]}>
              {teams.map((t) => (
                <Row
                  key={t}
                  cells={[
                    t,
                    <RateValue key="t" rate={s.side_win_rates[t]?.T} />,
                    <RateValue key="ct" rate={s.side_win_rates[t]?.CT} />,
                    <RateValue key="all" rate={s.side_win_rates[t]?.overall} />,
                  ]}
                />
              ))}
            </Table>
          </Section>

          {/* ---------------- objective ---------------- */}
          <Section
            title="Bombe og runde&shy;avslutninger"
            subtitle="Planterate gjelder kun runder laget spilte T. Post-plant-raten har kun runder der laget faktisk plantet som nevner."
          >
            <Table head={["Lag", "Planterate (T)", "Vunnet etter plant", "Defuserate (CT)"]}>
              {teams.map((t) => (
                <Row
                  key={t}
                  cells={[
                    t,
                    <RateValue key="p" rate={s.round_outcomes[t]?.plant_rate_as_t} />,
                    <RateValue key="pp" rate={s.round_outcomes[t]?.post_plant_win_rate_as_t} />,
                    <RateValue key="d" rate={s.round_outcomes[t]?.defuse_rate_as_ct} />,
                  ]}
                />
              ))}
            </Table>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {teams.map((t) => (
                <div key={t} className="rounded-lg border border-neutral-800 px-4 py-3">
                  <p className="text-xs text-neutral-400">{t} — seire etter årsak</p>
                  <ul className="mt-2 space-y-1">
                    {Object.entries(s.round_outcomes[t]?.wins_by_reason ?? {}).map(
                      ([reason, n]) => (
                        <li key={reason} className="flex justify-between text-xs">
                          <span className="text-neutral-400">{reason}</span>
                          <span className="tabular-nums text-neutral-200">{n as number}</span>
                        </li>
                      ),
                    )}
                  </ul>
                </div>
              ))}
            </div>
          </Section>


          {/* ---------------- site attack ---------------- */}
          {facts.areas?.bombsites?.length > 0 && (
            <>
              <Section
                title="Angrep per bombesite"
                subtitle="Hvilken site hvert lag angriper som T, og hvor ofte et plant omsettes i rundeseier. Runder uten plant er med i nevneren for plantandel, fordi det å ikke plante også er et utfall av angrepet."
              >
                <Table
                  head={[
                    "Lag",
                    "T-runder",
                    ...(s.site_attack.sites as string[]).flatMap((l) => [
                      `${l}: plantandel`,
                      `${l}: vunnet etter plant`,
                    ]),
                    "Vant uten plant",
                  ]}
                >
                  {teams.map((t) => {
                    const v = s.site_attack.by_team[t];
                    if (!v) return null;
                    return (
                      <Row
                        key={t}
                        cells={[
                          t,
                          v.rounds_as_t,
                          ...(s.site_attack.sites as string[]).flatMap((l) => [
                            <RateValue key={`${l}p`} rate={v.per_site[l]?.plant_share} />,
                            <RateValue key={`${l}w`} rate={v.per_site[l]?.win_rate_after_planting_here} />,
                          ]),
                          <RateValue key="np" rate={v.rounds_without_a_plant?.win_rate} />,
                        ]}
                      />
                    );
                  })}
                </Table>
              </Section>

              {/* ---------------- site defence ---------------- */}
              <Section
                title="Forsvar per bombesite"
                subtitle="Retakeraten har kun runder der laget faktisk slapp inn et plant på den siten som nevner."
              >
                <Table
                  head={[
                    "Lag",
                    "CT-runder",
                    ...(s.site_defence.sites as string[]).flatMap((l) => [
                      `${l}: plants mot`,
                      `${l}: retake`,
                    ]),
                    "Holdt uten plant",
                  ]}
                >
                  {teams.map((t) => {
                    const v = s.site_defence.by_team[t];
                    if (!v) return null;
                    return (
                      <Row
                        key={t}
                        cells={[
                          t,
                          v.rounds_as_ct,
                          ...(s.site_defence.sites as string[]).flatMap((l) => [
                            v.per_site[l]?.plants_conceded ?? 0,
                            <RateValue key={`${l}r`} rate={v.per_site[l]?.retake_rate} />,
                          ]),
                          <RateValue key="h" rate={v.rounds_with_no_plant_conceded?.win_rate} />,
                        ]}
                      />
                    );
                  })}
                </Table>
              </Section>

              {/* ---------------- CT setup ---------------- */}
              {s.ct_setups?.by_player && (
                <Section title="CT-oppsett" subtitle={s.ct_setups.definition}>
                  <div className="mb-3 grid gap-3 sm:grid-cols-2">
                    {Object.entries(s.ct_setups.by_team ?? {}).map(([t, v]: [string, any]) => (
                      <div key={t} className="rounded-lg border border-neutral-800 px-4 py-3">
                        <p className="text-xs text-neutral-400">{t}</p>
                        <p className="mt-1 text-sm text-neutral-200">
                          {Object.entries(v.mean_players_per_site)
                            .map(([site, n]) => `${site}: ${n}`)
                            .join("  \u00b7  ")}
                        </p>
                        <p className="mt-0.5 text-xs text-neutral-500">
                          snitt spillere per site over {v.rounds_observed} runder
                        </p>
                      </div>
                    ))}
                  </div>
                  <Table
                    head={[
                      "Spiller", "Lag", "CT-runder", "Fordeling", "Oftest",
                      "Oppsett inne på site", "Median avstand",
                    ]}
                  >
                    {s.ct_setups.by_player.map((p: any) => (
                      <Row
                        key={p.steamid}
                        cells={[
                          p.name,
                          <span key="t" className="text-xs text-neutral-400">{p.team}</span>,
                          p.ct_rounds_observed,
                          <span key="d" className="text-xs text-neutral-400">
                            {Object.entries(p.setup_position_by_site)
                              .map(([k, v]) => `${k}: ${v}`)
                              .join(" \u00b7 ")}
                          </span>,
                          <RateValue key="m" rate={p.share_at_most_common} />,
                          <RateValue key="i" rate={p.set_up_inside_a_site} />,
                          p.median_distance_to_nearest_site,
                        ]}
                      />
                    ))}
                  </Table>
                </Section>
              )}

              {/* ---------------- retakes ---------------- */}
              {s.retake_arrivals?.by_team && (
                <Section
                  title="Retake-ankomst"
                  subtitle={`Tid fra plant til første CT er inne på siten, målt på ${s.retake_arrivals.sample_rate_hz} Hz-sampling: tallene er nøyaktige til omtrent et halvt sekund. Runder der ingen CT nådde siten er tatt med som «nådde ikke» \u2014 det er selve funnet.`}
                >
                  <Table head={["Lag", "Plants mot", "Nådde siten", "Median tid", "Alt på site ved plant"]}>
                    {teams.map((t) => {
                      const v = s.retake_arrivals.by_team[t];
                      if (!v) return null;
                      return (
                        <Row
                          key={t}
                          cells={[
                            t,
                            v.plants_conceded,
                            <RateValue key="r" rate={v.site_reached} />,
                            v.median_seconds_to_site !== null ? `${v.median_seconds_to_site}s` : "\u2013",
                            <RateValue key="p" rate={v.already_on_site_at_plant} />,
                          ]}
                        />
                      );
                    })}
                  </Table>
                </Section>
              )}

              {/* ---------------- presence ---------------- */}
              {s.position_presence?.by_player && (
                <Section title="Tid tilbrakt på site" subtitle={s.position_presence.definition}>
                  <Table
                    head={[
                      "Spiller", "Lag", "Målepunkter",
                      ...(s.site_attack.sites as string[]), "Andre steder",
                    ]}
                  >
                    {s.position_presence.by_player.map((p: any) => (
                      <Row
                        key={p.steamid}
                        cells={[
                          p.name,
                          <span key="t" className="text-xs text-neutral-400">{p.team}</span>,
                          p.samples,
                          ...(s.site_attack.sites as string[]).map((l) => (
                            <span key={l} className="tabular-nums">
                              {p.zone_share[l] ? `${(p.zone_share[l] * 100).toFixed(0)}%` : "\u2013"}
                            </span>
                          )),
                          <span key="e" className="tabular-nums text-neutral-500">
                            {p.zone_share.elsewhere
                              ? `${(p.zone_share.elsewhere * 100).toFixed(0)}%`
                              : "\u2013"}
                          </span>,
                        ]}
                      />
                    ))}
                  </Table>
                </Section>
              )}
            </>
          )}
      </DetailGroup>

      <DetailGroup title="Angrepsmønstre (utledet)" blurb="Runde for runde: mønster, målsite, ankomsttid og bevisene bak merkelappen.">
    {/* ---------------- attack patterns (inferred) ---------------- */}
          {s.attack_patterns?.rounds?.length > 0 && (
            <Section
              title="Angrepsmønstre (utledet)"
              subtitle="Dette er den eneste seksjonen som ikke er målt. Demoen lagrer hvor spillerne var, ikke hva de ville — merkelappene er lesninger av bevegelse mot faste terskler. Målsiten leses fra plantet der det finnes, og utledes bare ellers."
            >
              <div className="mb-4 grid gap-3 sm:grid-cols-2">
                {Object.entries(s.attack_patterns.by_team).map(([t, v]: [string, any]) => (
                  <div key={t} className="rounded-lg border border-neutral-800 px-4 py-3">
                    <p className="text-xs text-neutral-400">{t}</p>
                    <p className="mt-1 text-sm text-neutral-200">
                      median ankomst {v.median_arrival_seconds}s
                    </p>
                    <p className="mt-0.5 text-xs text-neutral-500">
                      {v.t_rounds_classified} T-runder · mål fra plant: {v.target_read_from_plant}
                      {" · "}utledet: {v.target_inferred} · lav konfidens: {v.low_confidence_rounds}
                    </p>
                  </div>
                ))}
              </div>

              <Table head={["Lag", "Mønster", "Runder", "Vinnerrate", "Hvilke runder"]}>
                {Object.entries(s.attack_patterns.by_team).flatMap(
                  ([t, v]: [string, any]) =>
                    Object.entries(v.patterns).map(
                      ([name, d]: [string, any], i) => (
                        <Row
                          key={`${t}-${name}`}
                          cells={[
                            i === 0 ? t : "",
                            <span key="n" className="font-medium text-neutral-100">{name}</span>,
                            d.rounds.length,
                            <RateValue key="w" rate={d.win_rate} />,
                            <span key="r" className="text-xs tabular-nums text-neutral-500">
                              {d.rounds.join(", ")}
                            </span>,
                          ]}
                        />
                      ),
                    ),
                )}
              </Table>

              <div className="mt-3">
                <Table
                  head={[
                    "#", "Lag", "Mønster", "Mål", "Kilde", "Ankomst",
                    "Utility", "Retninger", "Lurkere", "Vant", "Konfidens",
                  ]}
                >
                  {s.attack_patterns.rounds.map((r: any) => {
                    const ev = r.evidence ?? {};
                    const util = Object.entries(ev.utility_supporting ?? {})
                      .map(([k, v]) => `${k}:${v}`)
                      .join(" ");
                    return (
                      <Row
                        key={r.round}
                        cells={[
                          <span key="n" className="font-medium text-neutral-100">{r.round}</span>,
                          <span key="t" className="text-xs text-neutral-400">
                            {r.attacking_team}
                          </span>,
                          <span key="p" className="text-xs">{r.pattern}</span>,
                          r.target_site ?? "\u2013",
                          <span
                            key="s"
                            className={`text-xs ${
                              r.target_source === "bomb_plant"
                                ? "text-emerald-400/80"
                                : "text-neutral-500"
                            }`}
                          >
                            {r.target_source === "bomb_plant"
                              ? "plant"
                              : r.target_source === "inferred_from_arrival"
                                ? "utledet"
                                : "\u2013"}
                          </span>,
                          r.arrival_seconds !== null ? `${r.arrival_seconds}s` : "\u2013",
                          <span key="u" className="text-xs text-neutral-400">{util || "\u2013"}</span>,
                          ev.approach_directions ?? "\u2013",
                          ev.lurkers?.length
                            ? <span key="l" className="text-xs text-amber-400/80">
                                {ev.lurkers.map((l: any) => l.name).join(", ")}
                              </span>
                            : "",
                          r.won ? "\u2713" : "",
                          <span
                            key="c"
                            className={`text-xs ${
                              r.confidence === "high"
                                ? "text-emerald-400/80"
                                : r.confidence === "low"
                                  ? "text-red-400/70"
                                  : "text-neutral-400"
                            }`}
                          >
                            {r.confidence}
                          </span>,
                        ]}
                      />
                    );
                  })}
                </Table>
              </div>

              {s.attack_patterns.arrival_rule_misses?.length > 0 && (
                <p className="mt-2 text-xs leading-relaxed text-neutral-500">
                  {s.attack_patterns.arrival_rule_misses.length} runder der
                  ankomstregelen ikke stemte med plantet og ble korrigert mot det:{" "}
                  {s.attack_patterns.arrival_rule_misses
                    .map((mm: any) => `R${mm.round} (${mm.note})`)
                    .join("; ")}
                  .
                </p>
              )}
            </Section>
          )}
      </DetailGroup>

      <DetailGroup title="Dueller og trading" blurb="Åpningsdueller per lag og spiller, og hvor ofte dødsfall blir hevnet.">
    {/* ---------------- opening duels ---------------- */}
          <Section
            title="Åpningsdueller"
            subtitle={`Første drap i runden. ${s.opening_duels.rounds_with_an_opening_duel} av ${s.opening_duels.rounds_total} runder hadde en åpningsduell; ${s.opening_duels.team_kills_excluded} teamkills er utelatt.`}
          >
            <Table head={["Lag", "Åpningsdrap", "Åpningsdød", "Duellrate", "Rundevinn etter åpningsdrap"]}>
              {teams.map((t) => {
                const d = s.opening_duels.by_team[t];
                return (
                  <Row
                    key={t}
                    cells={[
                      t,
                      d?.opening_kills ?? 0,
                      d?.opening_deaths ?? 0,
                      <RateValue key="w" rate={d?.opening_duel_win_rate} />,
                      <RateValue key="r" rate={d?.round_win_rate_after_opening_kill} />,
                    ]}
                  />
                );
              })}
            </Table>

            <div className="mt-3">
              <Table head={["Spiller", "Åpningsdrap", "Åpningsdød", "Duellrate", "Snitt sek. inn i runden"]}>
                {s.opening_duels.by_player
                  .filter((p: any) => p.opening_kills + p.opening_deaths > 0)
                  .map((p: any) => (
                    <Row
                      key={p.steamid}
                      cells={[
                        p.name,
                        p.opening_kills,
                        p.opening_deaths,
                        <RateValue key="w" rate={p.opening_duel_win_rate} />,
                        p.mean_seconds_into_round ?? "–",
                      ]}
                    />
                  ))}
              </Table>
            </div>
          </Section>

          {/* ---------------- trades ---------------- */}
          <Section
            title="Trading"
            subtitle={`Et drap teller som trade hvis det hevner en lagkamerat innen ${s.trades.window_seconds} sekunder, og offeret er spilleren som drepte lagkameraten.`}
          >
            <Table head={["Lag", "Andel drap som er trades", "Andel dødsfall som ble hevnet"]}>
              {teams.map((t) => (
                <Row
                  key={t}
                  cells={[
                    t,
                    <RateValue key="tk" rate={s.trades.by_team[t]?.trade_kill_rate} />,
                    <RateValue key="td" rate={s.trades.by_team[t]?.traded_death_rate} />,
                  ]}
                />
              ))}
            </Table>
          </Section>
      </DetailGroup>

      <DetailGroup title="Økonomi og granatbruk" blurb="Kjøpstyper, utstyrsgap, og granater per runde fordelt på type og fase.">
    {/* ---------------- economy ---------------- */}
          <Section
            title="Økonomi"
            subtitle={`Kjøpstype er utledet fra lagets samlede utstyrsverdi ved slutten av freezetime — en konvensjon, ikke et felt i demoen. Terskler: ${Object.entries(
              s.economy.thresholds_usd,
            )
              .map(([k, v]) => `${k} ≥ $${v}`)
              .join(", ")}.`}
          >
            <Table head={["Lag", "Kjøpstype", "Runder", "Vinnerrate", "Snitt utstyrsverdi"]}>
              {teams.flatMap((t) =>
                Object.entries(s.economy.by_team[t]?.buy_types ?? {}).map(
                  ([buyType, v]: [string, any], i) => (
                    <Row
                      key={`${t}-${buyType}`}
                      cells={[
                        i === 0 ? t : "",
                        buyType,
                        v.rounds,
                        <RateValue key="w" rate={v.win_rate} />,
                        `$${v.mean_equip_value.toLocaleString("nb-NO")}`,
                      ]}
                    />
                  ),
                ),
              )}
            </Table>
            {s.anti_eco.rounds?.length > 0 && (
              <p className="mt-2 text-xs text-neutral-500">
                {s.anti_eco.rounds.length} runder hadde et utstyrsgap på minst $
                {s.anti_eco.gap_threshold_usd.toLocaleString("nb-NO")}. Laget med
                overtaket vant {s.anti_eco.conversion_rate.numerator} av{" "}
                {s.anti_eco.conversion_rate.denominator} av dem (
                {pct(s.anti_eco.conversion_rate.value)}).
              </p>
            )}
          </Section>

          {/* ---------------- utility ---------------- */}
          <Section
            title="Granatbruk"
            subtitle="Kast per runde er kastevents delt på runder spilt på den siden. Fasene er en gruppering: tidlig <20s, midt 20–60s, sent >60s etter freezetime."
          >
            <Table head={["Lag", "Side", "Runder", "Granater/runde", "Røyk", "Flash", "Molotov", "HE"]}>
              {teams.flatMap((t) =>
                ["T", "CT"].map((side) => {
                  const u = s.utility_usage.by_team?.[t]?.per_side?.[side];
                  if (!u) return null;
                  const per = u.by_type_per_round ?? {};
                  return (
                    <Row
                      key={`${t}-${side}`}
                      cells={[
                        side === "T" ? t : "",
                        <SideBadge key="s" side={side} />,
                        u.rounds_played,
                        <span key="tot" className="font-medium text-neutral-100">
                          {u.thrown_per_round ?? "–"}
                        </span>,
                        per.smoke?.toFixed(2) ?? "–",
                        per.flashbang?.toFixed(2) ?? "–",
                        per.molotov?.toFixed(2) ?? "–",
                        per.he?.toFixed(2) ?? "–",
                      ]}
                    />
                  );
                }),
              )}
            </Table>
            <div className="mt-3">
              <Table head={["Lag", "Drap", "Gjennom røyk", "Mens blendet", "Flash-assistert", "Drept av blendet fiende"]}>
                {teams.map((t) => {
                  const e = s.utility_effectiveness.by_team[t];
                  return (
                    <Row
                      key={t}
                      cells={[
                        t,
                        e?.kills ?? 0,
                        <RateValue key="s" rate={e?.through_smoke} />,
                        <RateValue key="b" rate={e?.while_blinded} />,
                        <RateValue key="f" rate={e?.flash_assisted} />,
                        <RateValue key="d" rate={e?.deaths_while_blinded} />,
                      ]}
                    />
                  );
                })}
              </Table>
            </div>
          </Section>
      </DetailGroup>

      <DetailGroup title="Spillere" blurb="Scoreboard med ADR, headshot- og overlevelsesrate, og clutchsituasjoner.">
    {/* ---------------- players ---------------- */}
          <Section
            title="Spillere"
            subtitle="ADR er skade på motstandere delt på runder spilleren faktisk deltok i. Overlevelsesrate er runder overlevd delt på runder spilt."
          >
            <Table head={["Spiller", "Lag", "Runder", "K", "D", "A", "ADR", "HS", "Overlevd", "AWP-drap"]}>
              {s.players.players.map((p: any) => (
                <Row
                  key={p.steamid}
                  cells={[
                    p.name,
                    <span key="t" className="text-xs text-neutral-400">{p.team}</span>,
                    p.rounds_played,
                    <span key="k" className="font-medium text-neutral-100">{p.kills}</span>,
                    p.deaths,
                    p.assists,
                    <span key="adr" className="font-medium text-neutral-100">{p.adr}</span>,
                    <RateValue key="hs" rate={p.headshot_rate} />,
                    <RateValue key="sv" rate={p.survival_rate} />,
                    p.awp_kills,
                  ]}
                />
              ))}
            </Table>
          </Section>

          {/* ---------------- clutches ---------------- */}
          <Section title="Clutcher" subtitle={s.clutches.definition}>
            <Table head={["Spiller", "Lag", "Situasjoner", "Vunnet", "Rate", "Fordeling"]}>
              {s.clutches.by_player.map((p: any) => (
                <Row
                  key={p.steamid}
                  cells={[
                    p.name,
                    <span key="t" className="text-xs text-neutral-400">{p.team}</span>,
                    p.clutch_situations,
                    p.clutch_wins,
                    <RateValue key="r" rate={p.clutch_win_rate} />,
                    <span key="d" className="text-xs text-neutral-400">
                      {Object.entries(p.by_opponent_count)
                        .sort()
                        .map(([k, v]: [string, any]) => `${k}: ${v.wins}/${v.situations}`)
                        .join(" · ")}
                    </span>,
                  ]}
                />
              ))}
            </Table>
            {s.clutches.reconstruction_warnings?.length > 0 && (
              <p className="mt-2 text-xs text-red-300/70">
                {s.clutches.reconstruction_warnings.length} runder der
                gjenoppbyggingen av hvem som var i live ikke stemte med dødsfallene.
              </p>
            )}
          </Section>
      </DetailGroup>

      <DetailGroup title="Runde for runde" blurb="Grunnlaget for alle tallene. Hver runde kan spores til tick-intervallet den ble lest fra.">
    {/* ---------------- round by round ---------------- */}
          <Section
            title="Runde for runde"
            subtitle="Grunnlaget for alle tallene over. Hver runde kan spores tilbake til tick-intervallet den ble lest fra."
          >
            <Table head={["#", "Halvdel", ...teams, "Vinner", "Årsak", "Plant", "Defuse", "Varighet", "Ticks"]}>
              {facts.rounds.map((r: any) => (
                <Row
                  key={r.number}
                  cells={[
                    <span key="n" className="font-medium text-neutral-100">
                      {r.number}
                      {r.overtime > 0 && (
                        <span className="ml-1 text-xs text-amber-400">OT{r.overtime}</span>
                      )}
                    </span>,
                    r.half,
                    ...teams.map((t) => <SideBadge key={t} side={r.sides?.[t] ?? null} />),
                    <SideBadge key="w" side={r.winner} />,
                    <span key="r" className="text-xs text-neutral-400">{r.end_reason}</span>,
                    r.bomb_planted ? "✓" : "",
                    r.defused ? "✓" : "",
                    `${r.duration_seconds}s`,
                    <span key="t" className="text-xs tabular-nums text-neutral-600">
                      {r.start_tick}–{r.end_tick}
                    </span>,
                  ]}
                />
              ))}
            </Table>
          </Section>
      </DetailGroup>
    </div>
  );
}
