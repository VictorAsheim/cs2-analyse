"use client";

type SideUsage = {
  rounds_played: number;
  thrown_per_round: number | null;
  by_type_per_round: Record<string, number>;
};

type Usage = {
  by_team?: Record<string, { per_side: Record<string, SideUsage> }>;
};

// Fixed slot per grenade type, never cycled. The stack is ordered so the
// orange and yellow slots never touch — that is the one adjacent pair in this
// palette that sits near the separation floor.
const TYPES: { key: string; label: string; token: string }[] = [
  { key: "smoke", label: "Røyk", token: "var(--series-1)" },
  { key: "flashbang", label: "Flash", token: "var(--series-4)" },
  { key: "he", label: "HE", token: "var(--series-3)" },
  { key: "molotov", label: "Molotov", token: "var(--series-2)" },
];

/**
 * Grenades thrown per round, split by type, for each team and side.
 *
 * Stacked rather than grouped because both questions matter at once: the bar
 * length is how much utility a team spends, and the segments are what it
 * spends it on. Four rows is few enough to label every segment directly, which
 * is what the palette's four-slot rule requires.
 */
export default function UtilityChart({
  usage, teams,
}: { usage: Usage; teams: string[] }) {
  const rows = teams.flatMap((team) =>
    ["T", "CT"].map((side) => {
      const u = usage.by_team?.[team]?.per_side?.[side];
      if (!u) return null;
      return { team, side, total: u.thrown_per_round ?? 0, per: u.by_type_per_round ?? {}, rounds: u.rounds_played };
    }).filter(Boolean) as {
      team: string; side: string; total: number;
      per: Record<string, number>; rounds: number;
    }[],
  );
  if (rows.length === 0) return null;

  const max = Math.max(...rows.map((r) => r.total), 1);

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {TYPES.map((t) => (
          <span key={t.key} className="flex items-center gap-1.5 text-neutral-400">
            <span
              className="inline-block h-2.5 w-2.5 rounded-sm"
              style={{ background: t.token }}
            />
            {t.label}
          </span>
        ))}
      </div>

      <div className="space-y-2.5">
        {rows.map((r) => (
          <div key={`${r.team}-${r.side}`} className="flex items-center gap-3">
            <div className="w-40 shrink-0 text-right">
              <span className="text-xs text-neutral-300">{r.team}</span>
              <span
                className={`ml-1.5 rounded px-1 py-0.5 text-[10px] font-medium ${
                  r.side === "T"
                    ? "bg-amber-500/15 text-amber-300"
                    : "bg-sky-500/15 text-sky-300"
                }`}
              >
                {r.side}
              </span>
            </div>

            {/* Track, then bar: sizing the segments against the row itself
                lets the longest row - whose segments sum to 100% plus the
                2px gaps - shrink to fit and understate the biggest total. */}
            <div className="min-w-0 flex-1">
              <div
                className="flex h-6 items-stretch"
                style={{ width: `${(r.total / max) * 100}%` }}
              >
                {TYPES.map((t) => {
                  const v = r.per[t.key] ?? 0;
                  if (v <= 0) return null;
                  return (
                    <div
                      key={t.key}
                      // A 2px surface gap keeps adjacent fills from reading as
                      // one block.
                      className="relative mr-[2px] flex items-center justify-center overflow-hidden first:rounded-l-[4px] last:mr-0"
                      style={{ width: `${(v / r.total) * 100}%`, background: t.token }}
                      title={`${t.label}: ${v.toFixed(2)} per runde`}
                    >
                      {v >= 1.2 && (
                        <span className="text-[10px] font-medium tabular-nums text-neutral-950/80">
                          {v.toFixed(1)}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="w-24 shrink-0 text-right text-xs tabular-nums">
              <span className="font-medium text-neutral-100">
                {r.total.toFixed(1)}
              </span>
              <span className="ml-1 text-neutral-600">/runde</span>
            </div>
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-neutral-500">
        Kastevents delt på runder spilt på den siden.
      </p>
    </div>
  );
}
