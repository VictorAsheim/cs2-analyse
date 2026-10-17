import fs from "node:fs/promises";
import path from "node:path";

import { FACTS_DIR } from "./paths";

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
 * The published copy wins: once an analysis has been published, that is the
 * version teammates are reading, and a local re-parse should not silently
 * change what the page shows until it is published again.
 */
export async function readAnalysis(id: string): Promise<any | null> {
  for (const file of [
    path.join(PUBLIC_DIR, `${id}.facts.json`),
    path.join(FACTS_DIR, `${id}.facts.json`),
  ]) {
    try {
      return JSON.parse(await fs.readFile(file, "utf8"));
    } catch {
      // try the next location
    }
  }
  return null;
}

/** Where the radar image lives, which differs between the two modes. */
export function radarUrl(id: string): string {
  const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  return IS_STATIC ? `${base}/analyses/${id}.radar.png` : `/api/radar/${id}`;
}
