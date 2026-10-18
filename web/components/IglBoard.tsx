"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Finding = {
  title: string;
  detail: string;
  counter: string | null;
  our_side: "T" | "CT" | null;
  severity: string;
  matches_fired: number;
  matches_on_map: number;
  maps?: string[];
};

export type IglData = {
  team: string;
  teamSlug: string;
  logo: string | null;
  map: string;
  mapImage: string | null;
  matches: number;
  roundsFor: number;
  roundsAgainst: number;
  theirT: { numerator: number; denominator: number; value: number | null };
  theirCt: { numerator: number; denominator: number; value: number | null };
  plantsBySite: Record<string, number>;
  medianArrival: number | null;
  retakeBySite: Record<string, { numerator: number; denominator: number }>;
  setups: { name: string; most_common: string | null; most_common_rounds: number; rounds: number }[];
  reactionBuys: {
    after_loss: { rounds: number; buys: Record<string, number> };
    after_win: { rounds: number; buys: Record<string, number> };
  };
  findings: Finding[];
  crossMap: Finding[];
};

const BUY_LABEL: Record<string, string> = {
  full_buy: "full buy",
  semi_buy: "semi",
  force_buy: "force",
  eco: "eco",
};

const pct = (r: { value: number | null }) =>
  r.value === null ? "–" : `${Math.round(r.value * 100)}%`;

/** The largest share in a buy distribution, as a sentence fragment. */
function topBuy(part: { rounds: number; buys: Record<string, number> }) {
  const entries = Object.entries(part.buys).sort((a, b) => b[1] - a[1]);
  if (part.rounds === 0 || entries.length === 0) return null;
  const [buy, n] = entries[0];
  return { label: BUY_LABEL[buy] ?? buy, n, of: part.rounds };
}

function Tile({ label, value, sub }: {
  label: string; value: string; sub?: string;
}) {
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 px-4 py-3">
      <p className="text-[11px] uppercase tracking-wider text-neutral-500">{label}</p>
      <p className="mt-1 text-3xl font-semibold tabular-nums text-neutral-50">
        {value}
      </p>
      {sub && <p className="mt-0.5 text-xs text-neutral-500">{sub}</p>}
    </div>
  );
}

/**
 * The in-game board: one opponent, one map, one side, read at a glance.
 *
 * Everything is sized for a second monitor across the desk rather than a
 * browser an arm's length away, and the side switch filters rather than adds
 * - during a round there is no time to work out which half a line belongs to.
 */
export default function IglBoard({ data }: { data: IglData }) {
  const [side, setSide] = useState<"T" | "CT">("T");
  const [showAll, setShowAll] = useState(false);

  // The side outlives a page reload: the board is left open for a whole half.
  useEffect(() => {
    const saved = localStorage.getItem("igl-side");
    if (saved === "T" || saved === "CT") setSide(saved);
  }, []);
  useEffect(() => {
    try { localStorage.setItem("igl-side", side); } catch { /* private window */ }
  }, [side]);

  // Our side is the opposite of theirs, so when we are CT they are attacking.
  const theyAttack = side === "CT";
  const relevant = [...data.crossMap, ...data.findings].filter(
    (f) => f.counter && (f.our_side === null || f.our_side === side),
  );
  const shown = showAll ? relevant : relevant.slice(0, 3);

  const plants = Object.entries(data.plantsBySite).sort((a, b) => b[1] - a[1]);
  const plantTotal = plants.reduce((n, [, v]) => n + v, 0);
  const loss = topBuy(data.reactionBuys.after_loss);

  return (
    <div className="min-h-screen bg-neutral-950 px-6 py-5">
      <header className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <Link
          href="/igl"
          className="text-xs text-neutral-600 hover:text-neutral-300"
        >
          ←
        </Link>
        {data.logo && (
          // eslint-disable-next-line @next/next/no-img-element -- local static file
          <img src={data.logo} alt="" className="h-10 w-10 rounded object-contain" />
        )}
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-50">
            {data.team}
          </h1>
          <p className="text-xs text-neutral-500">
            {data.map.replace(/^de_/, "")} · {data.matches} kamp
            {data.matches === 1 ? "" : "er"} · runder {data.roundsFor}–
            {data.roundsAgainst}
          </p>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-neutral-500">Vi spiller</span>
          {(["T", "CT"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setSide(s)}
              aria-pressed={side === s}
              className={`rounded-lg px-5 py-2.5 text-lg font-semibold transition ${
                side === s
                  ? s === "T"
                    ? "bg-amber-500 text-neutral-950"
                    : "bg-sky-500 text-neutral-950"
                  : "border border-neutral-700 text-neutral-400 hover:bg-neutral-900"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </header>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        {theyAttack ? (
          <>
            <Tile
              label="De angriper"
              value={
                plantTotal > 0
                  ? plants.map(([s, n]) =>
                      `${s} ${Math.round((n / plantTotal) * 100)}%`).join(" · ")
                  : "–"
              }
              sub={plantTotal > 0 ? `${plantTotal} plants` : "ingen plants målt"}
            />
            <Tile
              label="Kontakt kommer"
              value={data.medianArrival !== null ? `${Math.round(data.medianArrival)}s` : "–"}
              sub="median, fra freezetime"
            />
            <Tile
              label="Deres T-side"
              value={pct(data.theirT)}
              sub={`${data.theirT.numerator}/${data.theirT.denominator} runder`}
            />
          </>
        ) : (
          <>
            <Tile
              label="Deres CT-side"
              value={pct(data.theirCt)}
              sub={`${data.theirCt.numerator}/${data.theirCt.denominator} runder`}
            />
            <Tile
              label="Retake mot oss"
              value={
                Object.keys(data.retakeBySite).length > 0
                  ? Object.entries(data.retakeBySite)
                      .map(([s, r]) => `${s} ${r.numerator}/${r.denominator}`)
                      .join(" · ")
                  : "–"
              }
              sub="runder de vant etter plant"
            />
            <Tile
              label="Etter tapt runde"
              value={loss ? `${loss.label} ${loss.n}/${loss.of}` : "–"}
              sub="vanligste kjøp"
            />
          </>
        )}
      </div>

      <section className="mt-5">
        <h2 className="mb-2 text-xs font-medium uppercase tracking-wider text-emerald-400/80">
          Slik vinner dere — når dere er {side}
        </h2>
        {shown.length > 0 ? (
          <ul className="space-y-2">
            {shown.map((f, i) => (
              <li
                key={i}
                className="rounded-lg border border-emerald-900/40 bg-emerald-950/20 px-4 py-3"
              >
                <p className="text-base leading-snug text-neutral-100">
                  {f.counter}
                </p>
                <p className="mt-1 text-xs text-neutral-500">
                  {f.title}
                  {f.maps
                    ? ` · ${f.maps.length} kart`
                    : f.matches_on_map > 1
                      ? ` · ${f.matches_fired} av ${f.matches_on_map} kamper`
                      : ""}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-lg border border-neutral-800 px-4 py-3 text-sm text-neutral-500">
            Ingen tiltak over terskel for denne siden.
          </p>
        )}
        {relevant.length > 3 && (
          <button
            onClick={() => setShowAll((v) => !v)}
            className="mt-2 w-full rounded-lg border border-neutral-800 px-4 py-2 text-xs text-neutral-500 transition hover:bg-neutral-900 hover:text-neutral-300"
          >
            {showAll ? "Vis færre" : `Vis alle ${relevant.length}`}
          </button>
        )}
      </section>

      {data.setups.length > 0 && (
        <section className="mt-5">
          <h2 className="mb-2 text-xs font-medium uppercase tracking-wider text-neutral-500">
            Hvor de står som CT
          </h2>
          <div className="flex flex-wrap gap-2">
            {data.setups.slice(0, 5).map((p) => (
              <span
                key={p.name}
                className="rounded-lg border border-neutral-800 bg-neutral-900/40 px-3 py-2"
              >
                <span className="text-sm font-medium text-neutral-100">
                  {p.name}
                </span>
                <span className="ml-2 text-sm text-neutral-400">
                  {p.most_common ?? "–"}
                </span>
                <span className="ml-1.5 text-xs tabular-nums text-neutral-600">
                  {p.most_common_rounds}/{p.rounds}
                </span>
              </span>
            ))}
          </div>
        </section>
      )}

      <p className="mt-5 text-[11px] leading-relaxed text-neutral-700">
        Tiltakene er ikke målt — de er faste anbefalinger knyttet til funnet
        over dem. Tallene er lest fra {data.matches} demo
        {data.matches === 1 ? "" : "er"} på dette kartet.
      </p>
    </div>
  );
}
