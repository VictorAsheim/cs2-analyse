import fs from "node:fs/promises";
import path from "node:path";

import { DATA_DIR, FACTS_DIR } from "./paths";

/**
 * Published analyses.
 *
 * The app runs in two modes from one codebase. Locally it is the full tool:
 * upload a demo, the worker parses it into `data/facts`, and the pages read
 * from there. Published, it is a static site: the publish script copies the
 * chosen analyses into `public/analyses`, and the same pages read from there
 * at build time instead.
 *
 * Both modes share these readers so a published page cannot drift from the one
 * that was checked locally.
 */
export const IS_STATIC = process.env.CS2_STATIC === "1";

/** Where the publish script stages analyses for the static build. */
export const PUBLIC_DIR = path.join(process.cwd(), "public", "analyses");

export type Published = {
  id: string;
  label: string;          // what the link says, e.g. "de_inferno"
  map: string;
  rounds: number;
  score: Record<string, number>;
  serverName: string;
  publishedAt: string;
};

export async function readManifest(): Promise<Published[]> {
  try {
    const raw = await fs.readFile(path.join(PUBLIC_DIR, "index.json"), "utf8");
    const parsed = JSON.parse(raw) as { analyses: Published[] };
    return parsed.analyses ?? [];
  } catch {
    return [];
  }
}

/**
 * Facts for one analysis.
 *
 * Locally the live copy in data/facts wins; published, only the staged copy
 * exists. The other order looked tidier - "what teammates see is what you
 * see" - but it meant a re-parse changed nothing on screen until the next
 * publish, so local checks silently ran against stale data.
 */
export async function readAnalysis(id: string): Promise<any | null> {
  const candidates = [
    path.join(FACTS_DIR, `${id}.facts.json`),
    path.join(PUBLIC_DIR, `${id}.facts.json`),
  ];
  for (const file of IS_STATIC ? candidates.reverse() : candidates) {
    try {
      return JSON.parse(await fs.readFile(file, "utf8"));
    } catch {
      // try the next location
    }
  }
  return null;
}

export type LeagueTeam = {
  slug: string;
  name: string;
  standing: {
    rank: number; played: number; won: number; drawn: number;
    lost: number; round_diff: number; points: number;
  } | null;
  in_division: boolean;
  maps_played: number;
  best_map: string | null;
  worst_map: string | null;
  maps: Record<string, any>;
  matches: any[];
  demos_analysed: number;
  clan_names: string[];
};

export type League = {
  generated_at: string;
  division: string;
  format: string;
  table_updated: string;
  table_note: string;
  teams: LeagueTeam[];
  non_division_opponents: { name: string; slug: string }[];
  unmatched_clan_names: string[];
  matches_analysed: number;
};

/**
 * The league view: the division, its teams, and what their demos showed.
 *
 * Staged into public/analyses by the publish script, the same as the match
 * documents, so the published site and the local one read one file.
 */
export async function readLeague(): Promise<League | null> {
  // Same precedence as readAnalysis: live data locally, staged when published.
  const candidates = [
    path.join(DATA_DIR, "league.json"),
    path.join(PUBLIC_DIR, "league.json"),
  ];
  for (const file of IS_STATIC ? candidates.reverse() : candidates) {
    try {
      return JSON.parse(await fs.readFile(file, "utf8")) as League;
    } catch {
      // try the next location
    }
  }
  return null;
}

/**
 * Rewrite every demo clan name in a match document to the league's spelling.
 *
 * A match document is written when the demo is parsed, with no knowledge of
 * the league, so it says "Kaefer DD" where the division says "Kaefer DåDå".
 * Threading a display function through every component that renders a team
 * name missed six of them - the summary, three charts, the player tables and
 * the round-by-round headers - so the document is normalised once instead.
 *
 * Keys are rewritten as well as values. The stats objects are indexed by team
 * name and the pages look them up with the same strings, so renaming both
 * sides keeps every lookup intact; renaming only values would break them.
 */
export function canonicaliseFacts<T>(facts: T, league: League | null): T {
  const pairs: [string, string][] = [];
  for (const team of league?.teams ?? []) {
    for (const raw of team.clan_names ?? []) {
      if (raw !== team.name) pairs.push([raw, team.name]);
    }
  }
  if (pairs.length === 0) return facts;

  const rename = (text: string) => {
    let out = text;
    for (const [raw, proper] of pairs) out = out.split(raw).join(proper);
    return out;
  };

  const walk = (node: unknown): unknown => {
    if (typeof node === "string") return rename(node);
    if (Array.isArray(node)) return node.map(walk);
    if (node && typeof node === "object") {
      const out: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(node)) {
        out[rename(key)] = walk(value);
      }
      return out;
    }
    return node;
  };

  return walk(facts) as T;
}

/** Where the radar image lives, which differs between the two modes. */
export function radarUrl(id: string): string {
  const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  return IS_STATIC ? `${base}/analyses/${id}.radar.png` : `/api/radar/${id}`;
}
