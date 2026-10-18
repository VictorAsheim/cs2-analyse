"use client";

import Link from "next/link";
import { useState } from "react";

import { RateValue } from "@/components/stats";

type Finding = {
  rule: string;
  title: string;
  detail: string;
  counter: string | null;
  our_side: "T" | "CT" | null;
  matches_fired: number;
  matches_on_map: number;
};

type MapData = {
  /** Resolved on the server; Badges cannot be imported into a client bundle. */
  image_src: string | null;
  matches: number;
  match_wins: number;
  rounds_for: number;
  rounds_against: number;
  round_win_rate: any;
  t: any;
  ct: any;
  strengths: Finding[];
  weaknesses: Finding[];
  match_ids: string[];
};

const SIDE_LABEL: Record<string, string> = {
  T: "når dere er T",
  CT: "når dere er CT",
};

/**
 * One finding, its evidence, and - behind the toggle - what to do about it.
 *
 * The counter sits in its own block with its own label because it is the one
 * thing on the page that is not measured. Everything above it comes from the
 * demo; the counter is a fixed sentence attached to the rule.
 */
function FindingRow({ f, showCounter, ourTeam }: {
  f: Finding; showCounter: boolean; ourTeam: boolean;
}) {
  const recurring = f.matches_on_map > 1;
  const everyMatch = recurring && f.matches_fired === f.matches_on_map;
  const thin = f.matches_fired === 1 && f.matches_on_map > 1;

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

      {showCounter && f.counter && !ourTeam && (
        <div className="mt-2 rounded border border-emerald-900/40 bg-emerald-950/20 px-3 py-2">
          <p className="flex flex-wrap items-baseline gap-x-2 text-[10px] font-medium uppercase tracking-wider text-emerald-400/80">
            Slik slår dere det
            {f.our_side && (
              <span className="text-neutral-500 normal-case tracking-normal">
                {SIDE_LABEL[f.our_side]}
              </span>
            )}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-neutral-300">
            {f.counter}
          </p>
          {thin && (
            <p className="mt-1 text-[10px] text-neutral-600">
              Slo bare ut i én av {f.matches_on_map} kamper — behandle som tips,
              ikke som plan.
            </p>
          )}
        </div>
      )}
    </li>
  );
}

function Verdict({ map, data, ourTeam }: {
  map: string; data: MapData; ourTeam: boolean;
}) {
  const t = data.t?.value, ct = data.ct?.value;
  if (t === null || ct === null || t === undefined || ct === undefined) return null;
  const strongerIsCt = ct >= t;
  const strong = strongerIsCt ? "CT" : "T";
  const weak = strongerIsCt ? "T" : "CT";
  // Their strong half is the half we meet on the opposite side.
  const ourHardSide = strongerIsCt ? "T" : "CT";

  return (
    <p className="text-xs leading-relaxed text-neutral-400">
      {ourTeam ? (
        <>
          Deres sterkeste halvdel her er <strong className="text-neutral-200">{strong}</strong>{" "}
          ({Math.round((strongerIsCt ? ct : t) * 100)} %), svakeste er {weak} (
          {Math.round((strongerIsCt ? t : ct) * 100)} %). Det er {weak}-siden som
          koster runder.
        </>
      ) : (
        <>
          Deres sterkeste halvdel er <strong className="text-neutral-200">{strong}</strong>{" "}
          ({Math.round((strongerIsCt ? ct : t) * 100)} %). Regn med at{" "}
          <strong className="text-neutral-200">{ourHardSide}</strong>-halvdelen
          deres blir den tunge — hent rundene på den andre.
        </>
      )}
    </p>
  );
}

function MapCard({ map, data, showCounter, ourTeam }: {
  map: string; data: MapData; showCounter: boolean; ourTeam: boolean;
}) {
  return (
    <div className="rounded-lg border border-neutral-800">
      <div className="border-b border-neutral-800 px-4 py-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <div>
            <h3 className="flex items-center gap-2.5 text-base font-semibold text-neutral-100">
              {data.image_src ? (
                // eslint-disable-next-line @next/next/no-img-element -- a local
                // static file in a statically exported site
                <img
                  src={data.image_src}
                  alt=""
                  className="h-8 w-8 shrink-0 rounded object-cover"
                />
              ) : (
                <span aria-hidden className="h-8 w-8 shrink-0 rounded bg-neutral-800" />
              )}
              {map.replace(/^de_/, "")}
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
              <RateValue rate={data.round_win_rate} />
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
        <div className="mt-2">
          <Verdict map={map} data={data} ourTeam={ourTeam} />
        </div>
      </div>

      <div className="grid gap-x-5 gap-y-4 px-4 py-4 sm:grid-cols-2">
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-emerald-400/80">
            {ourTeam ? "Dette fungerer" : "Styrker — planlegg mot dette"}
          </p>
          {data.strengths.length > 0 ? (
            <ul className="space-y-2.5">
              {data.strengths.map((f, i) => (
                <FindingRow key={i} f={f} showCounter={showCounter} ourTeam={ourTeam} />
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
            {ourTeam ? "Dette koster runder" : "Svakheter — utnytt dette"}
          </p>
          {data.weaknesses.length > 0 ? (
            <ul className="space-y-2.5">
              {data.weaknesses.map((f, i) => (
                <FindingRow key={i} f={f} showCounter={showCounter} ourTeam={ourTeam} />
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
        {data.match_ids.map((id, i) => (
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

export default function MapPlans({
  maps, ourTeam, maxPerMap,
}: {
  maps: [string, MapData][];
  ourTeam: boolean;
  maxPerMap: number;
}) {
  const [showCounter, setShowCounter] = useState(false);
  const counterCount = maps.reduce(
    (n, [, d]) =>
      n + [...d.strengths, ...d.weaknesses].filter((f) => f.counter).length,
    0,
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-xs leading-relaxed text-neutral-500">
          {maxPerMap > 1
            ? `Sortert etter rundevinnerrate, summert over alle kamper på kartet. «x av y kamper» viser hvor mange av kampene et funn slo ut i — det skiller et mønster fra en enkelthendelse.`
            : "Sortert etter rundevinnerrate. Med én kamp per kart rangerer dette resultater, ikke kartpreferanse."}
        </p>
        {!ourTeam && counterCount > 0 && (
          <button
            onClick={() => setShowCounter((v) => !v)}
            aria-pressed={showCounter}
            className={`shrink-0 rounded-lg border px-3 py-2 text-xs font-medium transition ${
              showCounter
                ? "border-emerald-800/60 bg-emerald-950/40 text-emerald-300"
                : "border-neutral-700 text-neutral-300 hover:bg-neutral-900"
            }`}
          >
            {showCounter ? "Skjul tiltak" : `Slik vinner dere (${counterCount})`}
          </button>
        )}
      </div>

      {showCounter && (
        <p className="rounded-lg border border-emerald-900/40 bg-emerald-950/20 px-4 py-3 text-xs leading-relaxed text-emerald-200/70">
          Tiltakene er <strong>ikke målt</strong>. Funnene over dem er lest fra
          demoene; tiltaket er en fast anbefaling knyttet til regelen som slo ut,
          og den er lik for hvert lag den treffer. Bruk den som utgangspunkt for
          en plan, ikke som fasit.
        </p>
      )}

      {maps.map(([map, data]) => (
        <MapCard
          key={map}
          map={map}
          data={data}
          showCounter={showCounter}
          ourTeam={ourTeam}
        />
      ))}
    </div>
  );
}
