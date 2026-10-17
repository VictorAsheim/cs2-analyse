"use client";

import { useState } from "react";

type Rate = { value: number | null; numerator: number; denominator: number };

export type SummaryData = {
  map: string;
  rounds: number;
  result: { team: string; rounds: number }[];
  per_team: Record<string, {
    rounds_won: number;
    t: Rate | null;
    ct: Rate | null;
    headline: {
      title: string; detail: string; severity: string; confidence: string;
    } | null;
  }>;
  findings_total: number;
  limits?: {
    demos_in_sample: number | null;
    bombsites_resolved: number | null;
    callouts_resolved: boolean | null;
  };
};

const pct = (r: Rate | null | undefined) =>
  r && r.denominator > 0 && r.value !== null
    ? `${(r.value * 100).toFixed(0)}%`
    : "–";

/**
 * The briefing: one line of result, and the single worst thing about each team.
 *
 * Collapsed by default. Opening it should answer "what am I looking at and
 * what matters" without scrolling, which is why it holds one headline per team
 * rather than a digest of every section.
 */
export default function Summary({ data }: { data: SummaryData }) {
  const [open, setOpen] = useState(false);
  const teams = data.result.map((r) => r.team);

  return (
    <section className="rounded-lg border border-neutral-800 bg-neutral-900/40">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-neutral-900/60"
      >
        <span
          className={`text-neutral-500 transition-transform ${open ? "rotate-90" : ""}`}
          aria-hidden
        >
          ▸
        </span>
        <span className="min-w-0 flex-1">
          <span className="text-sm font-medium text-neutral-100">Sammendrag</span>
          <span className="ml-2 text-xs text-neutral-500">
            {data.result.map((r) => `${r.team} ${r.rounds}`).join(" – ")} ·{" "}
            {data.findings_total} funn
          </span>
        </span>
        <span className="shrink-0 text-xs text-neutral-600">
          {open ? "skjul" : "les"}
        </span>
      </button>

      {open && (
        <div className="space-y-4 border-t border-neutral-800 px-4 py-4">
          <p className="text-sm leading-relaxed text-neutral-300">
            <span className="font-medium text-neutral-100">
              {data.result[0]?.team}
            </span>{" "}
            vant {data.result[0]?.rounds}–{data.result[1]?.rounds} på{" "}
            {data.map} over {data.rounds} runder.
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            {teams.map((team) => {
              const t = data.per_team[team];
              if (!t) return null;
              return (
                <div
                  key={team}
                  className="rounded-lg border border-neutral-800 px-3 py-3"
                >
                  <p className="text-xs font-medium text-neutral-200">{team}</p>
                  <p className="mt-1 text-xs tabular-nums text-neutral-500">
                    T {pct(t.t)}{" "}
                    <span className="text-neutral-700">
                      ({t.t?.numerator}/{t.t?.denominator})
                    </span>
                    {"  ·  "}CT {pct(t.ct)}{" "}
                    <span className="text-neutral-700">
                      ({t.ct?.numerator}/{t.ct?.denominator})
                    </span>
                  </p>
                  {t.headline ? (
                    <div className="mt-2.5 border-t border-neutral-800 pt-2.5">
                      <p className="text-xs font-medium text-neutral-200">
                        {t.headline.title}
                      </p>
                      <p className="mt-1 text-xs leading-relaxed text-neutral-400">
                        {t.headline.detail}
                      </p>
                    </div>
                  ) : (
                    <p className="mt-2.5 text-xs text-neutral-600">
                      Ingen funn over terskel for dette laget.
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          {data.limits && (
            <p className="rounded border border-amber-900/50 bg-amber-950/20 px-3 py-2 text-xs leading-relaxed text-amber-200/80">
              {data.limits.demos_in_sample === 1
                ? "Bygget på én demo: tallene beskriver denne kampen, og kan ikke skille et gjentakende mønster fra en engangshendelse. "
                : `Bygget på ${data.limits.demos_in_sample} demoer. `}
              {data.limits.bombsites_resolved
                ? "Bombesitene er oppløst, så statistikk per site er tilgjengelig. "
                : "Bombesitene lot seg ikke oppløse. "}
              {!data.limits.callouts_resolved &&
                "Callouts finnes ikke i CS2-data, så spørsmål om ruter står ubesvart."}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
