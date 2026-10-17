"use client";

import { useState } from "react";

export type Finding = {
  rule: string;
  subject: string;
  severity: "critical" | "serious" | "warning" | "good" | string;
  title: string;
  detail: string;
  evidence: Record<string, unknown>;
  score: number;
  confidence: "high" | "medium" | "low" | string;
  section: string | null;
};

// Status colours are reserved for state and never reused as series colours.
// Each ships with a word as well as a colour, so severity never rests on hue.
const SEVERITY: Record<string, { label: string; token: string }> = {
  critical: { label: "Kritisk", token: "var(--status-critical)" },
  serious: { label: "Alvorlig", token: "var(--status-serious)" },
  warning: { label: "Verdt å merke", token: "var(--status-warning)" },
  good: { label: "Styrke", token: "var(--status-good)" },
};

const CONFIDENCE: Record<string, string> = {
  high: "god dekning",
  medium: "tynn dekning",
  low: "svak dekning",
};

const TOP = 5;

/**
 * Findings in priority order.
 *
 * Only the top few are shown: a ranked list that renders all thirteen is just
 * the wall of tables again with a different shape. The confidence word is
 * always next to the severity word, because in a one-demo sample the
 * difference between a finding over twelve rounds and one over three is the
 * whole story.
 */
export default function Findings({ findings }: { findings: Finding[] }) {
  const [all, setAll] = useState(false);
  if (findings.length === 0) {
    return (
      <p className="rounded-lg border border-neutral-800 px-4 py-3 text-sm text-neutral-500">
        Ingen funn passerte terskelen i denne kampen.
      </p>
    );
  }
  const shown = all ? findings : findings.slice(0, TOP);

  return (
    <div className="space-y-2">
      {shown.map((f, i) => {
        const sev = SEVERITY[f.severity] ?? SEVERITY.warning;
        return (
          <div
            key={`${f.rule}-${f.subject}-${i}`}
            className="flex gap-3 rounded-lg border border-neutral-800 bg-neutral-900/30 px-4 py-3"
          >
            <span
              className="w-[3px] shrink-0 self-stretch rounded-full"
              style={{ background: sev.token }}
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className="text-sm font-medium text-neutral-100">
                  {f.title}
                </span>
                <span
                  className="rounded px-1.5 py-0.5 text-[10px] font-medium"
                  style={{ background: `${sev.token}22`, color: sev.token }}
                >
                  {sev.label}
                </span>
                <span className="text-[10px] text-neutral-600">
                  {CONFIDENCE[f.confidence] ?? f.confidence}
                </span>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-neutral-400">
                {f.detail}
              </p>
              {f.section && (
                <p className="mt-1.5 text-[11px] text-neutral-600">
                  Kontroller i «{f.section}»
                </p>
              )}
            </div>
            <span className="shrink-0 self-start text-xs tabular-nums text-neutral-700">
              {i + 1}
            </span>
          </div>
        );
      })}

      {findings.length > TOP && (
        <button
          onClick={() => setAll((v) => !v)}
          className="w-full rounded-lg border border-neutral-800 px-4 py-2 text-xs text-neutral-400 transition hover:bg-neutral-900/50 hover:text-neutral-200"
        >
          {all
            ? "Vis bare de viktigste"
            : `Vis alle ${findings.length} funn`}
        </button>
      )}
    </div>
  );
}
