#!/usr/bin/env node
/**
 * Build the public, read-only version of the site.
 *
 *   node scripts/publish.mjs [--repo <github-repo-name>] [id ...]
 *
 * With no ids every parsed analysis in ../data/facts is published; with ids,
 * only those. Output lands in ../docs, which is what GitHub Pages serves.
 *
 * Two things make this more than `next build`:
 *
 *  - Analyses are staged into public/analyses so the pages can read them at
 *    build time. Nothing under ../data ships; only what is staged here.
 *  - The API routes are moved aside for the duration of the build. Next has no
 *    way to exclude a route from `output: export`, and a POST handler cannot be
 *    statically rendered, so the build fails while they are in the tree. They
 *    are restored in a finally block, including when the build throws.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const WEB = path.resolve(import.meta.dirname, "..");
const ROOT = path.resolve(WEB, "..");
const FACTS = path.join(ROOT, "data", "facts");
const STAGE = path.join(WEB, "public", "analyses");
const DOCS = path.join(ROOT, "docs");
const API = path.join(WEB, "app", "api");
const API_PARKED = path.join(WEB, ".api-parked");

const args = process.argv.slice(2);
const repoIndex = args.indexOf("--repo");
// Taken as a bare repository name rather than a path: Git Bash rewrites any
// argument that looks like a Unix path into a Windows one, so "--base /name"
// arrives as "C:/Program Files/Git/name".
const repo = repoIndex >= 0 ? (args[repoIndex + 1] ?? "").replace(/^\/+|\/+$/g, "") : "";
const basePath = repo ? `/${repo}` : "";
const ids = args.filter((a, i) => !a.startsWith("--") && i !== repoIndex + 1);

async function exists(p) {
  try { await fs.access(p); return true; } catch { return false; }
}

async function stage() {
  await fs.rm(STAGE, { recursive: true, force: true });
  await fs.mkdir(STAGE, { recursive: true });

  const files = (await fs.readdir(FACTS)).filter((f) => f.endsWith(".facts.json"));
  const chosen = files.filter(
    (f) => ids.length === 0 || ids.includes(f.replace(".facts.json", "")),
  );
  if (chosen.length === 0) {
    throw new Error(
      `no analyses to publish in ${FACTS}` +
      (ids.length ? ` matching: ${ids.join(", ")}` : ""),
    );
  }

  const analyses = [];
  for (const file of chosen) {
    const id = file.replace(".facts.json", "");
    const facts = JSON.parse(await fs.readFile(path.join(FACTS, file), "utf8"));

    await fs.copyFile(path.join(FACTS, file), path.join(STAGE, file));

    // The radar is the only binary a published page needs. Positions are left
    // behind: they are an input to the worker, not to the page.
    const radar = path.join(FACTS, `${id}.radar.png`);
    if (await exists(radar)) {
      await fs.copyFile(radar, path.join(STAGE, `${id}.radar.png`));
    } else {
      console.warn(`  ! ${id}: no radar image, the map view will be empty`);
    }

    analyses.push({
      id,
      label: facts.match?.map ?? id,
      map: facts.match?.map ?? "ukjent",
      rounds: facts.match?.rounds_played ?? 0,
      score: facts.match?.score ?? {},
      serverName: facts.match?.server_name ?? "",
      publishedAt: new Date().toISOString(),
    });
    console.log(`  + ${facts.match?.map ?? id}  (${id})`);
  }

  analyses.sort((a, b) => a.map.localeCompare(b.map));
  await fs.writeFile(
    path.join(STAGE, "index.json"),
    JSON.stringify({ analyses }, null, 1),
    "utf8",
  );
  return analyses;
}

// Pages carrying `export const instant = false` cannot build in export mode:
// that config requires cacheComponents, which implies Partial Prerendering,
// which the exporter rejects. The value is genuinely per-mode and route config
// must be a literal, so the line is commented out for the static build and put
// back afterwards.
const INSTANT = "export const instant = false;";
const PAGES_WITH_INSTANT = [
  path.join(WEB, "app", "page.tsx"),
  path.join(WEB, "app", "match", "[id]", "page.tsx"),
];

async function withStaticSources(run) {
  const originals = new Map();
  const parkedApi = await exists(API_PARKED);
  if (parkedApi) {
    throw new Error(
      `${path.relative(WEB, API_PARKED)} already exists - a previous publish was ` +
      "interrupted. Move it back to app/api before retrying.",
    );
  }

  try {
    await fs.rename(API, API_PARKED);
  } catch (err) {
    if (err.code === "EPERM" || err.code === "EBUSY") {
      throw new Error(
        "could not move app/api aside: the dev server is holding it open on " +
        "Windows. Stop `npm run dev` and run this again.",
      );
    }
    throw err;
  }

  try {
    for (const file of PAGES_WITH_INSTANT) {
      const text = await fs.readFile(file, "utf8");
      if (!text.includes(INSTANT)) continue;
      originals.set(file, text);
      await fs.writeFile(file, text.replace(INSTANT, `// ${INSTANT}`), "utf8");
    }
    return await run();
  } finally {
    // Restore every source change whether the build succeeded or threw, so a
    // failed publish never leaves the local app broken.
    for (const [file, text] of originals) {
      await fs.writeFile(file, text, "utf8");
    }
    await fs.rename(API_PARKED, API);
  }
}

async function buildStatic() {
  await withStaticSources(async () => {
    // The dev server leaves generated route types behind that still name the
    // API routes we just parked, and type checking fails on them. The two
    // modes must not share build artefacts at all, so start clean.
    await fs.rm(path.join(WEB, ".next"), { recursive: true, force: true });

    execFileSync("npx", ["next", "build"], {
      cwd: WEB,
      stdio: "inherit",
      shell: process.platform === "win32",
      env: {
        ...process.env,
        CS2_STATIC: "1",
        NEXT_PUBLIC_BASE_PATH: basePath,
      },
    });
  });
}

async function finish() {
  await fs.rm(DOCS, { recursive: true, force: true });
  await fs.cp(path.join(WEB, "out"), DOCS, { recursive: true });

  // GitHub Pages runs Jekyll unless told not to, and Jekyll drops files and
  // folders beginning with an underscore - which is where Next puts its JS.
  await fs.writeFile(path.join(DOCS, ".nojekyll"), "", "utf8");

  // Unlisted, not private: this keeps the report out of search results, but
  // anyone with the link can still open it.
  await fs.writeFile(
    path.join(DOCS, "robots.txt"),
    "User-agent: *\nDisallow: /\n",
    "utf8",
  );
}

async function main() {
  if (!(await exists(FACTS))) {
    throw new Error(`no parsed analyses found at ${FACTS}`);
  }
  console.log("staging analyses:");
  const analyses = await stage();

  console.log(`\nbuilding static site${basePath ? ` under ${basePath}` : ""}…`);
  await buildStatic();

  await finish();
  console.log(
    `\npublished ${analyses.length} analyse(s) to ${path.relative(ROOT, DOCS)}`,
  );
  console.log("commit and push, then enable GitHub Pages from the docs/ folder.");
}

main().catch((err) => {
  console.error(`\npublish failed: ${err.message}`);
  process.exit(1);
});
