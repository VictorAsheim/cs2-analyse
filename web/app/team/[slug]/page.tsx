import Link from "next/link";
import { notFound } from "next/navigation";

import { MapBadge, MapTile, TeamBadge, mapLabel } from "@/components/Badges";
import { RateValue, Section } from "@/components/stats";
import { readLeague } from "@/lib/analyses";

export const instant = false;

export async function generateStaticParams() {
  const league = await readLeague();
  return (league?.teams ?? [])
    .filter((t) => t.demos_analysed > 0)
    .map((t) => ({ slug: t.slug }));
}

/**
 * One finding, with how many of the map's matches it appeared in.
 *
 * On a map played once the count says nothing and is hidden. Past that it is
 * the strongest evidence here: a habit seen in every match is a pattern, and
 * one seen once may be a bad night.
 */
function Finding({ f }: { f: any }) {
  const recurring = f.matches_on_map > 1;
  const everyMatch = recurring && f.matches_fired === f.matches_on_map;
  return (
    <li>
      <p className="flex flex-wrap items-baseline gap-x-2 text-xs font-medium text-neutral-200">
        {f.title}
        {recurring && (
          <span
            className={`rounded px-1.5 py-0.5 text-[10px] font-medium tabular-nums ${
              everyMatch
                ? "bg-neutral-100/10 text-neutral-200"
                : "bg-neutral-800 text-neutral-500"
            }`}
            title={`Slo ut i ${f.matches_fired} av ${f.matches_on_map} kamper på dette kartet`}
          >
            {f.matches_fired}/{f.matches_on_map} kamper
          </span>
        )}
      </p>
      <p className="mt-0.5 text-xs leading-relaxed text-neutral-500">{f.detail}</p>
    </li>
  );
}

function MapCard({ map, data }: { map: string; data: any }) {
  const wr = data.round_win_rate;
  return (
    <div className="rounded-lg border border-neutral-800">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-neutral-800 px-4 py-3">
        <div>
          <h3 className="text-base text-neutral-100">
            <MapBadge map={map} size={32} bold />
          </h3>
          <p className="mt-0.5 text-xs text-neutral-500">
            {data.match_wins} av {data.matches} kamp
            {data.matches === 1 ? "" : "er"} vunnet · runder{" "}
            {data.rounds_for}–{data.rounds_against}
          </p>
        </div>
        <div className="flex gap-4 text-xs">
          <span>
            <span className="text-neutral-500">Runder </span>
            <RateValue rate={wr} />
          </span>
          <span>
            <span className="text-amber-300/70">T </span>
            <RateValue rate={data.t} />
          </span>
          <span>
            <span className="text-sky-300/70">CT </span>
            <RateValue rate={data.ct} />
          </span>
        </div>
      </div>

      <div className="grid gap-x-5 gap-y-4 px-4 py-4 sm:grid-cols-2">
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-emerald-400/80">
            Styrker — planlegg mot dette
          </p>
          {data.strengths.length > 0 ? (
            <ul className="space-y-2">
              {data.strengths.map((f: any, i: number) => (
                <Finding key={i} f={f} />
              ))}
            </ul>
          ) : (
            <p className="text-xs text-neutral-600">
              Ingenting over terskel på dette kartet.
            </p>
          )}
        </div>

        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-red-400/80">
            Svakheter — utnytt dette
          </p>
          {data.weaknesses.length > 0 ? (
            <ul className="space-y-2">
              {data.weaknesses.map((f: any, i: number) => (
                <Finding key={i} f={f} />
              ))}
            </ul>
          ) : (
            <p className="text-xs text-neutral-600">
              Ingenting over terskel på dette kartet.
            </p>
          )}
        </div>
      </div>

      <div className="border-t border-neutral-800">
        {data.match_ids.map((id: string, i: number) => (
          <Link
            key={id}
            href={`/match/${id}`}
            className="block px-4 py-2.5 text-xs text-neutral-500 transition hover:bg-neutral-900/60 hover:text-neutral-200"
          >
            Full kampanalyse
            {data.match_ids.length > 1 ? ` ${i + 1} av ${data.match_ids.length}` : ""} →
          </Link>
        ))}
      </div>
    </div>
  );
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
  const maps = Object.entries(team.maps).sort(
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

      <Section
        title="Kart for kart"
        subtitle={
          maxPerMap > 1
            ? `Sortert etter rundevinnerrate, summert over alle kamper på kartet (opptil ${maxPerMap} per kart). Merkelappen «x av y kamper» viser hvor mange av kampene et funn slo ut i — det skiller et mønster fra en enkelthendelse.`
            : "Sortert etter rundevinnerrate. Med én kamp per kart rangerer dette resultater, ikke kartpreferanse — en veto-tendens krever flere kamper enn divisjonen har spilt."
        }
      >
        <div className="space-y-3">
          {maps.map(([map, data]) => (
            <MapCard key={map} map={map} data={data} />
          ))}
        </div>
      </Section>

      <Section
        title="Kamper"
        subtitle="Hele raden er en lenke til full kampanalyse."
      >
        <div className="divide-y divide-neutral-800/70 overflow-hidden rounded-lg border border-neutral-800">
          {team.matches.map((m: any) => {
            const opponent = league.teams.find((t) => t.name === m.opponent);
            return (
              <Link
                key={m.match_id}
                href={`/match/${m.match_id}`}
                className="flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3 transition hover:bg-neutral-900/60"
              >
                <MapBadge map={m.map} size={40} bold className="min-w-[9rem]" />

                <span className="flex min-w-[11rem] items-center gap-2 text-sm text-neutral-400">
                  <span className="text-neutral-600">mot</span>
                  {opponent ? (
                    <TeamBadge slug={opponent.slug} name={m.opponent} size={20} />
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
