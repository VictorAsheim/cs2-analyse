import Link from "next/link";

import Uploader from "@/components/Uploader";
import { IS_STATIC, readManifest } from "@/lib/analyses";
import { listJobs, reconcile } from "@/lib/jobs";

function Score({ score }: { score: Record<string, number> }) {
  const entries = Object.entries(score).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) return null;
  return (
    <span className="tabular-nums">
      {entries.map(([team, rounds], i) => (
        <span key={team}>
          {i > 0 && <span className="text-neutral-600"> – </span>}
          <span className="text-neutral-400">{team}</span>{" "}
          <span className="font-medium text-neutral-200">{rounds}</span>
        </span>
      ))}
    </span>
  );
}

// Locally this page reads the job store from disk on every request, so there
// is nothing to prerender; this is the Next 16 replacement for force-dynamic.
// The static build renders it once from the published manifest.
export const instant = false;

type Row = {
  id: string;
  title: string;
  score: Record<string, number>;
  rounds: number | null;
  meta: string | null;
  href: string | null;
  error?: string;
};

async function rows(): Promise<Row[]> {
  if (IS_STATIC) {
    const published = await readManifest();
    return published.map((a) => ({
      id: a.id,
      title: a.map,
      score: a.score,
      rounds: a.rounds,
      meta: a.serverName,
      href: `/match/${a.id}`,
    }));
  }

  const jobs = await Promise.all((await listJobs()).map(reconcile));
  return jobs.map((job) => ({
    id: job.id,
    title: job.summary?.map ?? job.filename,
    score: job.summary?.score ?? {},
    rounds: job.summary?.rounds ?? null,
    meta: job.parseSeconds !== undefined ? `${job.parseSeconds} s` : null,
    href: job.status === "done" ? `/match/${job.id}` : null,
    error: job.status === "failed"
      ? job.error?.split("\n").at(-1)
      : job.status !== "done"
        ? "parser…"
        : undefined,
  }));
}

export default async function Home() {
  const list = await rows();

  return (
    <main className="mx-auto w-full min-w-0 max-w-3xl px-6 py-16">
      <header className="mb-10">
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-100">
          CS2 demoanalyse
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-neutral-400">
          {IS_STATIC
            ? "Publiserte kampanalyser. Alle tall er regnet ut fra demoen og oppgis med teller og nevner, slik at ingen prosent står uten utvalgsstørrelsen bak den."
            : "Last opp en .dem-fil. Alle tall regnes ut fra demoen og oppgis med teller og nevner, slik at ingen prosent står uten utvalgsstørrelsen bak den."}
        </p>
      </header>

      {!IS_STATIC && <Uploader />}

      {list.length > 0 ? (
        <section className={IS_STATIC ? "" : "mt-12"}>
          <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-neutral-500">
            {IS_STATIC ? "Kamper" : "Analyserte kamper"}
          </h2>
          <ul className="divide-y divide-neutral-800 rounded-lg border border-neutral-800">
            {list.map((row) => {
              const body = (
                <div className="flex items-baseline justify-between gap-4 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-neutral-200">{row.title}</p>
                    <p className="mt-0.5 truncate text-xs text-neutral-500">
                      {row.error ? (
                        <span className="text-red-400">{row.error}</span>
                      ) : (
                        <Score score={row.score} />
                      )}
                    </p>
                  </div>
                  <div className="shrink-0 text-right text-xs tabular-nums text-neutral-500">
                    {row.rounds !== null && <p>{row.rounds} runder</p>}
                    {row.meta && <p className="truncate">{row.meta}</p>}
                  </div>
                </div>
              );
              return (
                <li key={row.id} className="hover:bg-neutral-900/50">
                  {row.href ? (
                    <Link href={row.href} className="block">{body}</Link>
                  ) : (
                    body
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ) : (
        IS_STATIC && (
          <p className="rounded-lg border border-neutral-800 px-4 py-6 text-center text-sm text-neutral-500">
            Ingen analyser er publisert ennå.
          </p>
        )
      )}
    </main>
  );
}
