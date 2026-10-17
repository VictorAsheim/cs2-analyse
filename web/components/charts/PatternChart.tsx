"use client";

type Pattern = {
  rounds: number[];
  win_rate: { value: number | null; numerator: number; denominator: number };
};

type ByTeam = Record<string, {
  patterns: Record<string, Pattern>;
  median_arrival_seconds: number | null;
  t_rounds_classified: number;
}>;

/**
 * How often each attack shape was used, and how much of it converted.
 *
 * Won and lost are two shades of one hue rather than two hues: the categories
 * here are the patterns, not the outcomes, so spending a second hue on the
 * outcome would compete with the thing the reader is comparing. Bar length is
 * rounds used, and the solid part is rounds won — one axis, no second scale.
 */
export default function PatternChart({
  byTeam, teams,
}: { byTeam: ByTeam; teams: string[] }) {
  const max = Math.max(
    1,
    ...teams.flatMap((t) =>
      Object.values(byTeam[t]?.patterns ?? {}).map((p) => p.rounds.length)),
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
        <span className="flex items-center gap-1.5 text-neutral-400">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-[var(--series-1)]" />
          vunnet
        </span>
        <span className="flex items-center gap-1.5 text-neutral-400">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-[var(--chart-axis)]" />
          tapt
        </span>
      </div>

      {teams.map((team) => {
        const entry = byTeam[team];
        if (!entry) return null;
        const patterns = Object.entries(entry.patterns).sort(
          (a, b) => b[1].rounds.length - a[1].rounds.length,
        );
        return (
          <div key={team}>
            <p className="mb-2 text-xs text-neutral-400">
              {team}
              <span className="ml-2 text-neutral-600">
                {entry.t_rounds_classified} T-runder · median ankomst{" "}
                {entry.median_arrival_seconds}s
              </span>
            </p>
            <div className="space-y-1.5">
              {patterns.map(([name, p]) => {
                const used = p.rounds.length;
                const won = p.win_rate.numerator;
                return (
                  <div key={name} className="flex items-center gap-3">
                    <span className="w-36 shrink-0 truncate text-right text-xs text-neutral-300">
                      {name}
                    </span>
                    {/* The bar needs its own track: as a flex item of the row
                        its percentage would resolve against the full row
                        width - labels included - and then shrink to fit,
                        rendering the longest bars ~22% short. */}
                    <div className="min-w-0 flex-1">
                      <div
                        className="flex h-5 items-stretch"
                        style={{ width: `${(used / max) * 100}%`, minWidth: 8 }}
                        title={`${name}: ${won}/${used} runder vunnet (runde ${p.rounds.join(", ")})`}
                      >
                        {won > 0 && (
                          <div
                            className="mr-[2px] rounded-l-[4px] bg-[var(--series-1)]"
                            style={{ width: `${(won / used) * 100}%` }}
                          />
                        )}
                        {used - won > 0 && (
                          <div
                            className="flex-1 rounded-r-[4px] bg-[var(--chart-axis)]"
                            style={{ borderRadius: won > 0 ? undefined : 4 }}
                          />
                        )}
                      </div>
                    </div>
                    <span className="w-12 shrink-0 text-right text-xs tabular-nums text-neutral-500">
                      {won}/{used}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
      <p className="text-xs text-neutral-500">
        Merkelappene er utledet fra bevegelse og utility, ikke målt. Se
        detaljseksjonen for terskler og runde-for-runde-bevis.
      </p>
    </div>
  );
}
