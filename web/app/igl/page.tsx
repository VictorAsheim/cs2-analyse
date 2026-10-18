import Link from "next/link";

import { MapBadge, TeamBadge } from "@/components/Badges";
import { readLeague } from "@/lib/analyses";

export const instant = false;

/**
 * The picker: opponent, then map.
 *
 * Two clicks to a board, because this is opened in the minute before a match
 * starts. Our own team is left out - the board exists to read an opponent.
 */
export default async function IglPicker() {
  const league = await readLeague();
  const opponents = (league?.teams ?? []).filter(
    (t) => !t.us && t.demos_analysed > 0,
  );

  return (
    <main className="mx-auto w-full min-w-0 max-w-4xl px-6 py-12">
      <Link href="/" className="text-xs text-neutral-500 hover:text-neutral-300">
        ← {league?.division ?? "forsiden"}
      </Link>

      <header className="mt-4 mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-100">
          IGL-visning
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-neutral-400">
          Velg motstander og kart. Visningen er laget for en andreskjerm mens
          dere spiller: store tall, ett kart, og en bryter for hvilken side
          dere er på. Bokmerk lenken før kampen.
        </p>
      </header>

      <div className="space-y-4">
        {opponents.map((team) => (
          <section
            key={team.slug}
            className="rounded-lg border border-neutral-800 px-4 py-4"
          >
            <p className="mb-3">
              <TeamBadge slug={team.slug} name={team.name} size={26} />
            </p>
            <div className="flex flex-wrap gap-2">
              {Object.keys(team.maps).map((map) => (
                <Link
                  key={map}
                  href={`/igl/${team.slug}/${map.replace(/^de_/, "")}`}
                  className="rounded-lg border border-neutral-700 px-3 py-2 transition hover:border-neutral-500 hover:bg-neutral-900"
                >
                  <MapBadge map={map} size={24} bold />
                </Link>
              ))}
            </div>
          </section>
        ))}
        {opponents.length === 0 && (
          <p className="rounded-lg border border-neutral-800 px-4 py-6 text-center text-sm text-neutral-500">
            Ingen motstandere med analyserte demoer ennå.
          </p>
        )}
      </div>
    </main>
  );
}
