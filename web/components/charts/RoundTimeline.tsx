"use client";

import { useState } from "react";

type Round = {
  number: number;
  half: number;
  overtime: number;
  winner: string | null;
  end_reason: string;
  bomb_planted: boolean;
  defused: boolean;
  plant_site: string | null;
  sides: Record<string, string>;
  duration_seconds: number;
};

/**
 * The match as a sequence: who won each round, on which side, and whether the
 * bomb went down.
 *
 * A table of 29 rounds answers "what happened in round 17"; this answers "where
 * did the match turn", which is the question a coach actually opens with. Runs
 * of colour are the whole point, so the rounds stay in order and keep equal
 * width rather than being sorted or scaled by anything.
 */
export default function RoundTimeline({
  rounds, teams,
}: { rounds: Round[]; teams: string[] }) {
  const [hover, setHover] = useState<Round | null>(null);
  const colour = (team: string) =>
    team === teams[0] ? "var(--series-1)" : "var(--series-2)";

  const winnerTeam = (r: Round) =>
    Object.entries(r.sides).find(([, side]) => side === r.winner)?.[0] ?? null;

  // Halves within a phase, and each overtime, are visual groups: a gap marks
  // the side swap so a run of wins is not read across it.
  const breaks = new Set<number>();
  rounds.forEach((r, i) => {
    const prev = rounds[i - 1];
    if (prev && (prev.half !== r.half || prev.overtime !== r.overtime)) {
      breaks.add(r.number);
    }
  });

  const tally = teams.map((t) => ({
    team: t,
    won: rounds.filter((r) => winnerTeam(r) === t).length,
  }));

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        {tally.map((t) => (
          <span key={t.team} className="flex items-center gap-1.5 text-neutral-400">
            <span
              className="inline-block h-2.5 w-2.5 rounded-sm"
              style={{ background: colour(t.team) }}
            />
            {t.team}
            <span className="tabular-nums text-neutral-200">{t.won}</span>
          </span>
        ))}
        <span className="flex items-center gap-1.5 text-neutral-500">
          <span className="inline-block h-2.5 w-2.5 rounded-sm border border-neutral-600" />
          merke = bombe plantet
        </span>
      </div>

      <div className="flex items-end gap-[2px] overflow-x-auto pb-1">
        {rounds.map((r) => {
          const team = winnerTeam(r);
          return (
            <div
              key={r.number}
              className={breaks.has(r.number) ? "ml-3" : ""}
              onMouseEnter={() => setHover(r)}
              onMouseLeave={() => setHover(null)}
            >
              <div
                className="relative h-12 w-[18px] shrink-0 cursor-default rounded-sm transition-opacity hover:opacity-100"
                style={{
                  background: team ? colour(team) : "var(--chart-axis)",
                  opacity: hover && hover.number !== r.number ? 0.45 : 1,
                }}
                title={`Runde ${r.number}`}
              >
                {r.bomb_planted && (
                  <span
                    className="absolute inset-x-[3px] bottom-[3px] block h-[3px] rounded-[1px]"
                    style={{ background: "rgba(11,11,12,0.75)" }}
                  />
                )}
              </div>
              <p className="mt-1 text-center text-[9px] tabular-nums text-neutral-600">
                {r.number}
              </p>
            </div>
          );
        })}
      </div>

      {/* Reserve the row so the layout does not jump as the pointer moves. */}
      <div className="mt-1 min-h-[2.5rem] text-xs leading-relaxed text-neutral-400">
        {hover ? (
          <>
            <span className="font-medium text-neutral-200">
              Runde {hover.number}
              {hover.overtime > 0 && (
                <span className="ml-1 text-amber-400">OT{hover.overtime}</span>
              )}
            </span>{" "}
            · {winnerTeam(hover)} vant som {hover.winner} ·{" "}
            {hover.end_reason}
            {hover.plant_site && ` · plant ${hover.plant_site}`}
            {hover.defused && " · defuset"} · {hover.duration_seconds}s
          </>
        ) : (
          <span className="text-neutral-600">
            Hold over en runde for detaljer. Mellomrom markerer sidebytte.
          </span>
        )}
      </div>
    </div>
  );
}
