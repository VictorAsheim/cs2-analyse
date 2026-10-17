import type { ReactNode } from "react";

export type Rate = {
  value: number | null;
  numerator: number;
  denominator: number;
  definition: string;
};

/**
 * A percentage shown with the fraction that produced it.
 *
 * The fraction is always visible rather than hidden in a tooltip: a 100% that
 * means 1/1 reads very differently from one that means 14/14, and a scouting
 * report is wrong if it lets a reader confuse the two.
 */
export function RateValue({ rate, className = "" }: { rate?: Rate; className?: string }) {
  if (!rate || rate.denominator === 0) {
    return <span className="text-neutral-600">–</span>;
  }
  return (
    <span className={`tabular-nums ${className}`} title={rate.definition}>
      <span className="font-medium text-neutral-100">
        {rate.value === null ? "–" : `${(rate.value * 100).toFixed(0)}%`}
      </span>
      <span className="ml-1.5 text-xs text-neutral-500">
        {rate.numerator}/{rate.denominator}
      </span>
    </span>
  );
}

export function Section({
  title, subtitle, children,
}: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-amber-400/90">
        {title}
      </h2>
      {subtitle && (
        <p className="mt-1 max-w-2xl text-xs leading-relaxed text-neutral-500">{subtitle}</p>
      )}
      <div className="mt-3">{children}</div>
    </section>
  );
}

export function Table({
  head, children,
}: { head: ReactNode[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-neutral-800">
      <table className="w-full min-w-max text-sm">
        <thead>
          <tr className="border-b border-neutral-800 bg-neutral-900/60 text-left">
            {head.map((h, i) => (
              <th
                key={i}
                className={`px-3 py-2 text-xs font-medium uppercase tracking-wide text-neutral-500 ${
                  i === 0 ? "" : "text-right"
                }`}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-800/70">{children}</tbody>
      </table>
    </div>
  );
}

export function Row({ cells }: { cells: ReactNode[] }) {
  return (
    <tr className="hover:bg-neutral-900/40">
      {cells.map((c, i) => (
        <td
          key={i}
          className={`px-3 py-2 ${i === 0 ? "text-neutral-200" : "text-right text-neutral-300"}`}
        >
          {c}
        </td>
      ))}
    </tr>
  );
}

export function Note({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-lg border border-amber-900/50 bg-amber-950/20 px-4 py-3 text-xs leading-relaxed text-amber-200/80">
      {children}
    </p>
  );
}

export function SideBadge({ side }: { side: string | null }) {
  if (!side) return <span className="text-neutral-600">–</span>;
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-xs font-medium ${
        side === "T"
          ? "bg-amber-500/15 text-amber-300"
          : "bg-sky-500/15 text-sky-300"
      }`}
    >
      {side}
    </span>
  );
}

/**
 * A collapsed group of detail tables.
 *
 * Native <details> rather than React state: it needs no client bundle, it is
 * keyboard- and screen-reader-accessible for free, and the browser's find-in-page
 * can open it. The group stays closed so the page leads with findings.
 */
export function DetailGroup({
  title, blurb, children,
}: { title: string; blurb?: string; children: ReactNode }) {
  return (
    <details className="group rounded-lg border border-neutral-800 open:bg-neutral-900/20">
      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 transition hover:bg-neutral-900/50">
        <span
          className="text-neutral-500 transition-transform group-open:rotate-90"
          aria-hidden
        >
          ▸
        </span>
        <span className="min-w-0 flex-1">
          <span className="text-sm font-medium text-neutral-200">{title}</span>
          {blurb && (
            <span className="mt-0.5 block text-xs leading-relaxed text-neutral-500">
              {blurb}
            </span>
          )}
        </span>
      </summary>
      <div className="border-t border-neutral-800 px-4 pb-5">{children}</div>
    </details>
  );
}
