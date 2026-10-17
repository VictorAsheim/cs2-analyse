"use client";

import { useMemo, useState } from "react";

type Point = { round: number; x: number; y: number };

type Kill = Point & {
  victim: string;
  victim_side: "T" | "CT";
  victim_team: string;
  weapon: string;
  attacker?: string;
  attacker_team?: string;
  attacker_x?: number;
  attacker_y?: number;
};

type Plant = Point & { site: string | null; planter: string; won_by_t: boolean };
type Util = Point & { type: string; thrower: string; team: string };

type Bombsite = {
  label: string;
  label_source: string;
  x: number;
  y: number;
  radius_normalised: number;
  plants_observed: number;
};

export type RadarData = {
  image?: string;
  note?: string;
  bombsites?: Bombsite[];
  kills?: Kill[];
  plants?: Plant[];
  utility?: Util[];
};

type Layer = "deaths" | "plants" | "smoke" | "molotov" | "flashbang";

const LAYERS: { key: Layer; label: string; colour: string }[] = [
  { key: "deaths", label: "Dødsfall", colour: "#f87171" },
  { key: "plants", label: "Plants", colour: "#fbbf24" },
  { key: "smoke", label: "Røyk", colour: "#a3a3a3" },
  { key: "molotov", label: "Molotov", colour: "#fb923c" },
  { key: "flashbang", label: "Flash", colour: "#facc15" },
];

export default function RadarMap({
  radar, teams, radarSrc, rounds,
}: {
  radar: RadarData;
  teams: string[];
  /** Served by the local API, or a static file in the published build. */
  radarSrc: string;
  rounds: number;
}) {
  const [layer, setLayer] = useState<Layer>("deaths");
  const [team, setTeam] = useState<string | "all">("all");
  const [round, setRound] = useState<number | "all">("all");
  const [showLinks, setShowLinks] = useState(false);

  if (radar.note || !radar.bombsites) {
    return (
      <p className="rounded-lg border border-neutral-800 px-4 py-3 text-xs text-neutral-500">
        {radar.note ?? "ingen radardata for dette kartet"}
      </p>
    );
  }

  const inRound = (p: Point) => round === "all" || p.round === round;

  // For deaths, "team" filters by who died — the question a coach asks of a
  // death map is where their own players are losing, not who shot them.
  const points = useMemo(() => {
    if (layer === "deaths") {
      return (radar.kills ?? [])
        .filter(inRound)
        .filter((k) => team === "all" || k.victim_team === team)
        .map((k) => ({ ...k, kind: "death" as const }));
    }
    if (layer === "plants") {
      return (radar.plants ?? []).filter(inRound).map((p) => ({ ...p, kind: "plant" as const }));
    }
    return (radar.utility ?? [])
      .filter((u) => u.type === layer)
      .filter(inRound)
      .filter((u) => team === "all" || u.team === team)
      .map((u) => ({ ...u, kind: "util" as const }));
  }, [layer, team, round, radar]);

  const colour = LAYERS.find((l) => l.key === layer)!.colour;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <div className="flex overflow-hidden rounded border border-neutral-800">
          {LAYERS.map((l) => (
            <button
              key={l.key}
              onClick={() => setLayer(l.key)}
              className={`px-2.5 py-1.5 transition ${
                layer === l.key
                  ? "bg-neutral-800 text-neutral-100"
                  : "text-neutral-500 hover:text-neutral-300"
              }`}
            >
              <span
                className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle"
                style={{ background: l.colour }}
              />
              {l.label}
            </button>
          ))}
        </div>

        <select
          value={team}
          onChange={(e) => setTeam(e.target.value)}
          disabled={layer === "plants"}
          className="rounded border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-neutral-300 disabled:opacity-40"
        >
          <option value="all">Begge lag</option>
          {teams.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>

        <select
          value={round}
          onChange={(e) => setRound(e.target.value === "all" ? "all" : Number(e.target.value))}
          className="rounded border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-neutral-300"
        >
          <option value="all">Alle runder</option>
          {Array.from({ length: rounds }, (_, i) => i + 1).map((r) => (
            <option key={r} value={r}>Runde {r}</option>
          ))}
        </select>

        {layer === "deaths" && (
          <label className="flex items-center gap-1.5 text-neutral-400">
            <input
              type="checkbox"
              checked={showLinks}
              onChange={(e) => setShowLinks(e.target.checked)}
              className="accent-amber-400"
            />
            vis skuddlinjer
          </label>
        )}

        <span className="ml-auto tabular-nums text-neutral-500">
          {points.length} punkter
        </span>
      </div>

      <div className="relative overflow-hidden rounded-lg border border-neutral-800 bg-black">
        {/* eslint-disable-next-line @next/next/no-img-element -- served from the
            local job store, not an optimisable remote asset */}
        <img
          src={radarSrc}
          alt="radarkart"
          className="block w-full opacity-60"
        />

        <svg
          viewBox="0 0 1 1"
          preserveAspectRatio="none"
          className="pointer-events-none absolute inset-0 h-full w-full"
        >
          {radar.bombsites.map((s) => (
            <g key={s.label}>
              <circle
                cx={s.x} cy={s.y} r={s.radius_normalised}
                fill="none" stroke="#f59e0b" strokeWidth={0.0015}
                strokeDasharray="0.006 0.004" opacity={0.55}
              />
              <text
                x={s.x} y={s.y} dy={0.006}
                textAnchor="middle" fill="#f59e0b"
                fontSize={0.032} fontWeight="600" opacity={0.75}
              >
                {s.label}
              </text>
            </g>
          ))}

          {showLinks && layer === "deaths" &&
            points.map((p, i) =>
              "attacker_x" in p && p.attacker_x !== undefined ? (
                <line
                  key={`l${i}`}
                  x1={p.attacker_x} y1={p.attacker_y}
                  x2={p.x} y2={p.y}
                  stroke={colour} strokeWidth={0.0008} opacity={0.3}
                />
              ) : null,
            )}

          {points.map((p, i) => (
            <circle
              key={i}
              cx={p.x} cy={p.y}
              r={layer === "plants" ? 0.009 : 0.0055}
              fill={colour}
              opacity={layer === "plants" ? 0.9 : 0.65}
            />
          ))}
        </svg>
      </div>

      <p className="text-xs leading-relaxed text-neutral-500">
        Sirklene er bombesitene slik de ble funnet fra observerte plants, ikke
        kartets faktiske trigger-geometri — radien dekker den målte spredningen.
        {radar.bombsites.some((s) => s.label_source !== "curated_reference_point") &&
          " Sitene for dette kartet mangler A/B-merking og vises med posisjon."}
      </p>
    </div>
  );
}
