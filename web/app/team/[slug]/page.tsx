import Link from "next/link";
import { notFound } from "next/navigation";

import { RateValue, Section } from "@/components/stats";
import { readLeague } from "@/lib/analyses";

export const instant = false;

export async function generateStaticParams() {
  const league = await readLeague();
  return (league?.teams ?? [])
    .filter((t) => t.demos_analysed > 0)
    .map((t) => ({ slug: t.slug }));
}

const MAP_LABEL = (m: string) => m.replace(/^de_/, "");

function MapCard({ map, data }: { map: string; data: any }) {
  const wr = data.round_win_rate;
  return (
    <div className="rounded-lg border border-neutral-800">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-neutral-800 px-4 py-3">
        <div>
          <h3 className="text-base font-semibold text-neutral-100">
            {MAP_LABEL(map)}
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
                <li key={i}>
                  <p className="text-xs font-medium text-neutral-200">{f.title}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-neutral-500">
                    {f.detail}
                  </p>
                </li>
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
                <li key={i}>
                  <p className="text-xs font-medium text-neutral-200">{f.title}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-neutral-500">
                    {f.detail}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-neutral-600">
              Ingenting over terskel på dette kartet.
            </p>
          )}
        </div>
      </div>

      <div className="border-t border-neutral-800 px-4 py-2.5">
        {data.match_ids.map((id: string) => (
          <Link
            key={id}
            href={`/match/${id}`}
            className="text-xs text-neutral-500 underline-offset-4 hover:text-neutral-200 hover:underline"
          >
            Full kampanalyse →
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
          {team.name}
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
          <div className="rounded-lg border border-neutral-800 px-4 py-3">
            <p className="text-xs text-neutral-500">Sterkest kart</p>
            <p className="mt-0.5 text-lg font-medium text-neutral-100">
              {team.best_map ? MAP_LABEL(team.best_map) : "–"}
            </p>
          </div>
          <div className="rounded-lg border border-neutral-800 px-4 py-3">
            <p className="text-xs text-neutral-500">Svakest kart</p>
            <p className="mt-0.5 text-lg font-medium text-neutral-100">
              {team.worst_map ? MAP_LABEL(team.worst_map) : "–"}
            </p>
          </div>
        </div>
      )}

      <Section
        title="Kart for kart"
        subtitle="Sortert etter rundevinnerrate. Med én kamp per kart rangerer dette resultater, ikke kartpreferanse — en veto-tendens krever flere kamper enn divisjonen har spilt."
      >
        <div className="space-y-3">
          {maps.map(([map, data]) => (
            <MapCard key={map} map={map} data={data} />
          ))}
        </div>
      </Section>

      <Section title="Kamper" subtitle="Hver rad går videre til full analyse.">
        <div className="overflow-x-auto rounded-lg border border-neutral-800">
          <table className="w-full min-w-max text-sm">
            <thead>
              <tr className="border-b border-neutral-800 bg-neutral-900/60 text-left">
                {["Kart", "Motstander", "Resultat", "Som T", "Som CT", ""].map((h) => (
                  <th
                    key={h}
                    className="px-3 py-2 text-xs font-medium uppercase tracking-wide text-neutral-500"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800/70">
              {team.matches.map((m: any) => (
                <tr key={m.match_id} className="hover:bg-neutral-900/40">
                  <td className="px-3 py-2.5 text-neutral-200">{MAP_LABEL(m.map)}</td>
                  <td className="px-3 py-2.5 text-neutral-400">{m.opponent}</td>
                  <td className="px-3 py-2.5 tabular-nums">
                    <span
                      className={
                        m.won ? "font-medium text-emerald-400" : "text-neutral-400"
                      }
                    >
                      {m.rounds_for}–{m.rounds_against}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 tabular-nums text-neutral-400">
                    {m.sides.won.T}/{m.sides.played.T}
                  </td>
                  <td className="px-3 py-2.5 tabular-nums text-neutral-400">
                    {m.sides.won.CT}/{m.sides.played.CT}
                  </td>
                  <td className="px-3 py-2.5">
                    <Link
                      href={`/match/${m.match_id}`}
                      className="text-xs text-neutral-500 underline-offset-4 hover:text-neutral-200 hover:underline"
                    >
                      analyse →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <p className="mt-8 rounded-lg border border-amber-900/50 bg-amber-950/20 px-4 py-3 text-xs leading-relaxed text-amber-200/80">
        {team.demos_analysed === 1
          ? "Bygget på én demo. Tallene beskriver den kampen og kan ikke skille et gjentakende mønster fra en engangshendelse."
          : `Bygget på ${team.demos_analysed} demoer, én per kart. Et mønster som går igjen på tvers av kamper kan ennå ikke skilles fra noe som skjedde én gang.`}
      </p>
    </main>
  );
}
