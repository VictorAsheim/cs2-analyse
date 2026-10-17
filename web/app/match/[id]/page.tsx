import Link from "next/link";
import { notFound } from "next/navigation";

import Findings from "@/components/Findings";
import MatchDetails from "@/components/MatchDetails";
import RadarMap from "@/components/RadarMap";
import Summary from "@/components/Summary";
import PatternChart from "@/components/charts/PatternChart";
import RoundTimeline from "@/components/charts/RoundTimeline";
import UtilityChart from "@/components/charts/UtilityChart";
import { Section } from "@/components/stats";
import {
  IS_STATIC, radarUrl, readAnalysis, readLeague, readManifest,
} from "@/lib/analyses";
import { readJob } from "@/lib/jobs";

// Locally these pages read the job store on every request, so there is nothing
// to prerender; this is the Next 16 replacement for force-dynamic. The static
// build renders every published match ahead of time instead.
export const instant = false;

export async function generateStaticParams() {
  const published = await readManifest();
  return published.map((a) => ({ id: a.id }));
}

export default async function MatchPage(
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const facts = await readAnalysis(id);
  if (!facts) notFound();
  // The job record only exists locally; published pages carry the filename in
  // the facts document instead.
  const job = IS_STATIC ? null : await readJob(id);
  const sourceName = job?.filename ?? facts.source?.filename;

  // Which league teams played this match, so the page links back up.
  const league = await readLeague();
  const linked = (league?.teams ?? []).filter((t) =>
    t.matches.some((m: any) => m.match_id === id),
  );

  const m = facts.match;
  const s = facts.stats;
  const teams: string[] = Object.keys(m.teams);
  const score = m.score as Record<string, number>;
  const ranked = [...teams].sort((a, b) => (score[b] ?? 0) - (score[a] ?? 0));

  return (
    <main className="mx-auto w-full min-w-0 max-w-5xl px-6 py-12">
      <nav className="flex flex-wrap items-center gap-x-2 text-xs text-neutral-500">
        <Link href="/" className="hover:text-neutral-300">
          ← {league?.division ?? "alle kamper"}
        </Link>
        {linked.map((t) => (
          <span key={t.slug} className="flex items-center gap-2">
            <span className="text-neutral-700">/</span>
            <Link href={`/team/${t.slug}`} className="hover:text-neutral-300">
              {t.name}
            </Link>
          </span>
        ))}
      </nav>

      <header className="mt-4 pb-5">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-100">
            {m.map}
          </h1>
          <p className="text-lg tabular-nums text-neutral-300">
            {ranked.map((t, i) => (
              <span key={t}>
                {i > 0 && <span className="mx-2 text-neutral-600">–</span>}
                {t}{" "}
                <span className="font-semibold text-neutral-100">
                  {score[t] ?? 0}
                </span>
              </span>
            ))}
          </p>
        </div>
        <p className="mt-2 text-xs text-neutral-500">
          {m.rounds_played} runder · {m.server_name} · parset på{" "}
          {facts.parse_seconds}s · {sourceName}
        </p>
      </header>

      {/* The briefing comes first and stays shut: one click for the gist, and
          no scrolling past it for anyone who already has it. */}
      {facts.summary && <Summary data={facts.summary} />}

      {facts.warnings?.length > 0 && (
        <div className="mt-3 rounded-lg border border-red-900/50 bg-red-950/20 px-4 py-3 text-xs text-red-200/80">
          {facts.warnings.map((w: string, i: number) => <p key={i}>{w}</p>)}
        </div>
      )}

      {/* ---------------- what to act on ---------------- */}
      <Section
        title="Prioriterte funn"
        subtitle="Rangert etter effekt ganget med utvalgsstørrelse, så en 100 %-rate over to runder ikke kan slå en 25 %-rate over tolv. Hvert funn er en omskriving av tall fra detaljseksjonen, ikke en ny måling."
      >
        <Findings findings={facts.findings ?? []} />
      </Section>

      {/* ---------------- where ---------------- */}
      <Section
        title="Kart"
        subtitle="Hvert punkt er en målt hendelse. Filtrer på lag, type og runde."
      >
        <RadarMap
          radar={facts.radar ?? {}}
          teams={teams}
          radarSrc={radarUrl(id)}
          rounds={m.rounds_played}
        />
      </Section>

      {/* ---------------- the shape of the match ---------------- */}
      <Section
        title="Kampforløpet"
        subtitle="Hver søyle er en runde, i rekkefølge. Mellomrom markerer sidebytte."
      >
        <RoundTimeline rounds={facts.rounds ?? []} teams={teams} />
      </Section>

      <Section
        title="Granatbruk per runde"
        subtitle="Lengden er hvor mye utility laget bruker; segmentene er hva de bruker den på."
      >
        <UtilityChart usage={s.utility_usage ?? {}} teams={teams} />
      </Section>

      {s.attack_patterns?.by_team && (
        <Section
          title="Angrepsmønstre"
          subtitle="Hvor ofte hvert mønster ble brukt, og hvor mye av det som ble omsatt i rundeseier."
        >
          <PatternChart byTeam={s.attack_patterns.by_team} teams={teams} />
        </Section>
      )}

      <MatchDetails facts={facts} teams={teams} />
    </main>
  );
}
