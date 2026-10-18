import Link from "next/link";
import { notFound } from "next/navigation";

import {
  MapBadge, MapTile, TeamBadge, mapLabel, mapSrc,
} from "@/components/Badges";
import CrossMap from "@/components/CrossMap";
import MapPlans from "@/components/MapPlans";
import { Section } from "@/components/stats";
import { readLeague } from "@/lib/analyses";

export const instant = false;

export async function generateStaticParams() {
  const league = await readLeague();
  return (league?.teams ?? [])
    .filter((t) => t.demos_analysed > 0)
    .map((t) => ({ slug: t.slug }));
}

export default async function TeamPage(
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const league = await readLeague();
  const team = league?.teams.find((t) => t.slug === slug);
  if (!league || !team) notFound();

  const s = team.standing;
  // Ordered by round win rate, so the maps they are strongest on come first.
  // With one match per map this ranks results, not map preference: a veto
  // pattern needs more matches than this division has played.
  const maxPerMap = Math.max(
    0, ...Object.values(team.maps).map((m: any) => m.matches),
  );
  // The thumbnail is resolved here, on the server, because the lookup reads
  // the public directory and the card that renders it is a client component.
  const maps = Object.entries(team.maps)
    .map(([name, data]: [string, any]) =>
      [name, { ...data, image_src: mapSrc(name) }] as [string, any])
    .sort(
    (a, b) =>
      (b[1].round_win_rate.value ?? 0) - (a[1].round_win_rate.value ?? 0),
  );

  return (
    <main className="mx-auto w-full min-w-0 max-w-4xl px-6 py-12">
      <Link href="/" className="text-xs text-neutral-500 hover:text-neutral-300">
        ← {league.division}
      </Link>

      <header className="mt-4 pb-5">
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-100">
          <TeamBadge slug={team.slug} name={team.name} size={36} />
        </h1>
        {team.us && (
          <p className="mt-1 text-xs text-neutral-500">
            Vårt eget lag — lest for å finne hva som må fikses, ikke hvordan
            laget slås.
          </p>
        )}
        <p className="mt-2 text-xs text-neutral-500">
          {s && (
            <>
              {s.rank}. plass · {s.points} poeng · {s.won}–{s.lost} i serien ·{" "}
            </>
          )}
          {team.demos_analysed} demo{team.demos_analysed === 1 ? "" : "er"}{" "}
          analysert over {team.maps_played} kart
        </p>
      </header>

      {team.demos_analysed > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {team.best_map ? (
            <MapTile map={team.best_map} label="Sterkest kart" />
          ) : (
            <div className="rounded-lg border border-neutral-800 px-4 py-3 text-sm text-neutral-600">
              Sterkest kart –
            </div>
          )}
          {team.worst_map ? (
            <MapTile map={team.worst_map} label="Svakest kart" />
          ) : (
            <div className="rounded-lg border border-neutral-800 px-4 py-3 text-sm text-neutral-600">
              Svakest kart –
            </div>
          )}
        </div>
      )}

      <CrossMap
        findings={(team.cross_map ?? []) as any}
        ourTeam={team.us}
        mapsPlayed={team.maps_played}
      />

      <Section title={team.us ? "Kart for kart" : "Slik kan dere vinne kartene"}>
        <MapPlans
          maps={maps as any}
          ourTeam={team.us}
          maxPerMap={maxPerMap}
        />
      </Section>

      <Section
        title="Kamper"
        subtitle="Hele raden er en lenke til full kampanalyse."
      >
        <div className="divide-y divide-neutral-800/70 overflow-hidden rounded-lg border border-neutral-800">
          {team.matches.map((m: any) => {
            // An opponent outside the division has no page, but still has a
            // name and possibly a crest.
            const opponent = league.teams.find((t) => t.name === m.opponent);
            const outside = opponent
              ? null
              : league.non_division_opponents?.find((t) => t.name === m.opponent);
            return (
              <Link
                key={m.match_id}
                href={`/match/${m.match_id}`}
                className="flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3 transition hover:bg-neutral-900/60"
              >
                <MapBadge map={m.map} size={40} bold className="min-w-[9rem]" />

                <span className="flex min-w-[11rem] items-center gap-2 text-sm text-neutral-400">
                  <span className="text-neutral-600">mot</span>
                  {opponent || outside ? (
                    <TeamBadge
                      slug={(opponent ?? outside)!.slug}
                      name={m.opponent}
                      size={20}
                    />
                  ) : (
                    m.opponent
                  )}
                </span>

                <span
                  className={`text-base tabular-nums ${
                    m.won ? "font-semibold text-emerald-400" : "text-neutral-300"
                  }`}
                >
                  {m.rounds_for}–{m.rounds_against}
                </span>

                <span className="flex gap-3 text-xs tabular-nums text-neutral-500">
                  <span>
                    <span className="text-amber-300/70">T </span>
                    {m.sides.won.T}/{m.sides.played.T}
                  </span>
                  <span>
                    <span className="text-sky-300/70">CT </span>
                    {m.sides.won.CT}/{m.sides.played.CT}
                  </span>
                </span>

                <span className="ml-auto text-xs text-neutral-600">
                  full analyse →
                </span>
              </Link>
            );
          })}
        </div>
      </Section>

      <p className="mt-8 rounded-lg border border-amber-900/50 bg-amber-950/20 px-4 py-3 text-xs leading-relaxed text-amber-200/80">
        {team.demos_analysed === 1
          ? "Bygget på én demo. Tallene beskriver den kampen og kan ikke skille et gjentakende mønster fra en engangshendelse."
          : maxPerMap > 1
            ? `Bygget på ${team.demos_analysed} demoer over ${team.maps_played} kart, med opptil ${maxPerMap} kamper på samme kart. Der et funn slo ut i flere kamper er det et mønster; der det slo ut i én, kan det like gjerne ha vært den kvelden.`
            : `Bygget på ${team.demos_analysed} demoer, én per kart. Et mønster som går igjen på tvers av kamper kan ennå ikke skilles fra noe som skjedde én gang.`}
      </p>
    </main>
  );
}
