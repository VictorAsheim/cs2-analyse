import Link from "next/link";

import { MapBadge, TeamBadge } from "@/components/Badges";
import Uploader from "@/components/Uploader";
import { IS_STATIC, readLeague } from "@/lib/analyses";

// Locally this page reads the job store from disk on every request, so there
// is nothing to prerender; this is the Next 16 replacement for force-dynamic.
export const instant = false;

export default async function Home() {
  const league = await readLeague();

  if (!league) {
    return (
      <main className="mx-auto w-full min-w-0 max-w-3xl px-6 py-16">
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-100">
          CS2 demoanalyse
        </h1>
        <p className="mt-3 text-sm text-neutral-400">
          Ingen ligadata ennå. Kjør{" "}
          <code className="text-neutral-300">python worker/build_league.py</code>{" "}
          etter at minst én demo er parset.
        </p>
        {!IS_STATIC && <div className="mt-8"><Uploader /></div>}
      </main>
    );
  }

  const analysed = league.teams.filter((t) => t.demos_analysed > 0);

  return (
    <main className="mx-auto w-full min-w-0 max-w-4xl px-6 py-14">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-100">
          {league.division}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-neutral-400">
          Motstanderanalyse fra parsede demoer. {analysed.length} av{" "}
          {league.teams.length} lag har demoer analysert
          {" "}({league.matches_analysed} kamper). Trykk på et lag for å se
          hvordan de spiller kart for kart.
        </p>
      </header>

      <section>
        <div className="overflow-x-auto rounded-lg border border-neutral-800">
          <table className="w-full min-w-max text-sm">
            <thead>
              <tr className="border-b border-neutral-800 bg-neutral-900/60 text-left">
                {["#", "Lag", "K", "V", "T", "+/-", "P", "Demoer", "Kart"].map((h, i) => (
                  <th
                    key={h}
                    className={`px-3 py-2 text-xs font-medium uppercase tracking-wide text-neutral-500 ${
                      i >= 2 && i <= 6 ? "text-right" : ""
                    }`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800/70">
              {league.teams.map((team) => {
                const s = team.standing;
                const hasData = team.demos_analysed > 0;
                const name = hasData ? (
                  <Link
                    href={`/team/${team.slug}`}
                    className="font-medium text-neutral-100 underline-offset-4 hover:underline"
                  >
                    <TeamBadge slug={team.slug} name={team.name} size={22} />
                  </Link>
                ) : (
                  <TeamBadge
                    slug={team.slug}
                    name={team.name}
                    size={22}
                    className="text-neutral-400"
                  />
                );
                return (
                  <tr key={team.slug} className="hover:bg-neutral-900/40">
                    <td className="px-3 py-2.5 tabular-nums text-neutral-500">
                      {s?.rank ?? "–"}
                    </td>
                    <td className="px-3 py-2.5">{name}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-neutral-400">{s?.played ?? "–"}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-neutral-400">{s?.won ?? "–"}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-neutral-400">{s?.lost ?? "–"}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-neutral-400">
                      {s ? (s.round_diff > 0 ? `+${s.round_diff}` : s.round_diff) : "–"}
                    </td>
                    <td className="px-3 py-2.5 text-right font-medium tabular-nums text-neutral-200">
                      {s?.points ?? "–"}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-neutral-400">
                      {hasData ? team.demos_analysed : (
                        <span className="text-neutral-700">–</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      {hasData ? (
                        <span className="flex flex-wrap gap-1.5">
                          {Object.keys(team.maps).map((m) => (
                            <MapBadge
                              key={m}
                              map={m}
                              size={18}
                              className="rounded bg-neutral-800/80 py-0.5 pl-0.5 pr-1.5 text-[11px] text-neutral-300"
                            />
                          ))}
                        </span>
                      ) : (
                        <span className="text-xs text-neutral-700">ingen demoer</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <p className="mt-2 text-xs leading-relaxed text-neutral-500">
          Plassering, kamper og poeng er avskrevet fra ligatabellen
          {league.table_updated && ` (${league.table_updated})`} og oppdateres
          for hånd. Alt annet på sidene er regnet ut fra demoene.
        </p>
      </section>

      {league.unmatched_clan_names.length > 0 && (
        <p className="mt-4 rounded-lg border border-amber-900/50 bg-amber-950/20 px-4 py-3 text-xs leading-relaxed text-amber-200/80">
          Klannavn fra demoer som ikke matcher noe lag i oppsettet:{" "}
          {league.unmatched_clan_names.map((n) => `«${n}»`).join(", ")}. Legg dem
          inn som alias i <code>league.config.json</code>.
        </p>
      )}

      {!IS_STATIC && (
        <section className="mt-12">
          <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-neutral-500">
            Legg til en kamp
          </h2>
          <Uploader />
          <p className="mt-2 text-xs text-neutral-500">
            Etter opplasting: kjør{" "}
            <code className="text-neutral-400">python worker/build_league.py</code>{" "}
            for å oppdatere lagoversikten.
          </p>
        </section>
      )}
    </main>
  );
}
