"use client";

import { useState } from "react";

type Finding = {
  rule: string;
  severity: string;
  title: string;
  detail: string;
  counter: string | null;
  our_side: "T" | "CT" | null;
  maps: string[];
  matches_fired: number;
  matches_total: number;
};

const mapLabel = (m: string) => m.replace(/^de_/, "");

/**
 * Findings that recur on more than one map.
 *
 * A habit that shows up on every map is a different thing from one that shows
 * up on a single map: it is how the team plays rather than how they play that
 * map. The per-map cards cannot show it, because each only sees its own map,
 * so it sits above them - and for our own team it is the list worth fixing
 * first.
 */
export default function CrossMap({
  findings, ourTeam, mapsPlayed,
}: { findings: Finding[]; ourTeam: boolean; mapsPlayed: number }) {
  const [showCounter, setShowCounter] = useState(false);
  if (findings.length === 0) return null;

  const weaknesses = findings.filter((f) => f.severity !== "good");
  const strengths = findings.filter((f) => f.severity === "good");
  const withCounters = findings.filter((f) => f.counter).length;

  const Row = ({ f }: { f: Finding }) => {
    const everyMap = f.maps.length === mapsPlayed && mapsPlayed > 1;
    return (
      <li className="rounded-lg border border-neutral-800 px-4 py-3">
        <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="text-sm font-medium text-neutral-100">{f.title}</span>
          <span
            className={`rounded px-1.5 py-0.5 text-[10px] font-medium tabular-nums ${
              everyMap
                ? "bg-neutral-100/10 text-neutral-200"
                : "bg-neutral-800 text-neutral-500"
            }`}
          >
            {everyMap ? "alle " : ""}{f.maps.length} kart
          </span>
          <span className="text-[10px] tabular-nums text-neutral-600">
            {f.matches_fired} av {f.matches_total} kamper
          </span>
        </p>
        <p className="mt-1 text-xs text-neutral-500">
          {f.maps.map(mapLabel).join(" · ")}
        </p>
        <p className="mt-1 text-xs leading-relaxed text-neutral-400">{f.detail}</p>

        {showCounter && f.counter && !ourTeam && (
          <div className="mt-2 rounded border border-emerald-900/40 bg-emerald-950/20 px-3 py-2">
            <p className="text-[10px] font-medium uppercase tracking-wider text-emerald-400/80">
              Slik slår dere det
              {f.our_side && (
                <span className="ml-2 normal-case tracking-normal text-neutral-500">
                  når dere er {f.our_side}
                </span>
              )}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-neutral-300">
              {f.counter}
            </p>
          </div>
        )}
      </li>
    );
  };

  return (
    <section className="mt-10">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-amber-400/90">
            {ourTeam ? "Går igjen uansett kart" : "Går igjen på tvers av kart"}
          </h2>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-neutral-500">
            {ourTeam
              ? "Dette følger laget, ikke kartet. Det er her en endring betaler seg over hele kartpoolen."
              : "Dette følger laget, ikke kartet — så det gjelder uansett hvilket kart dere havner på."}
          </p>
        </div>
        {!ourTeam && withCounters > 0 && (
          <button
            onClick={() => setShowCounter((v) => !v)}
            aria-pressed={showCounter}
            className={`shrink-0 rounded-lg border px-3 py-2 text-xs font-medium transition ${
              showCounter
                ? "border-emerald-800/60 bg-emerald-950/40 text-emerald-300"
                : "border-neutral-700 text-neutral-300 hover:bg-neutral-900"
            }`}
          >
            {showCounter ? "Skjul tiltak" : "Slik vinner dere"}
          </button>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {weaknesses.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wider text-red-400/80">
              {ourTeam ? "Dette koster runder overalt" : "Svakheter på tvers"}
            </p>
            <ul className="space-y-2">
              {weaknesses.map((f, i) => <Row key={i} f={f} />)}
            </ul>
          </div>
        )}
        {strengths.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wider text-emerald-400/80">
              {ourTeam ? "Dette sitter" : "Styrker på tvers"}
            </p>
            <ul className="space-y-2">
              {strengths.map((f, i) => <Row key={i} f={f} />)}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
