import { spawn } from "node:child_process";
import fs from "node:fs/promises";

import {
  FACTS_DIR, JOB_DIR, PYTHON, UPLOAD_DIR, WORKER_DIR,
  demoPath, factsPath, jobPath, logPath, positionsPath, radarPath,
} from "./paths";

export type JobStatus = "uploading" | "parsing" | "done" | "failed";

export type Job = {
  id: string;
  filename: string;
  sizeBytes: number;
  status: JobStatus;
  createdAt: string;
  finishedAt?: string;
  parseSeconds?: number;
  error?: string;
  /** Filled in once parsing succeeds, so the job list can show a summary. */
  summary?: {
    map: string;
    rounds: number;
    score: Record<string, number>;
    serverName: string;
  };
};

export async function ensureDirs() {
  for (const dir of [UPLOAD_DIR, JOB_DIR, FACTS_DIR]) {
    await fs.mkdir(dir, { recursive: true });
  }
}

export async function writeJob(job: Job) {
  await fs.writeFile(jobPath(job.id), JSON.stringify(job, null, 1), "utf8");
}

export async function readJob(id: string): Promise<Job | null> {
  try {
    return JSON.parse(await fs.readFile(jobPath(id), "utf8")) as Job;
  } catch {
    return null;
  }
}

export async function listJobs(): Promise<Job[]> {
  await ensureDirs();
  const names = await fs.readdir(JOB_DIR);
  const jobs = await Promise.all(
    names.filter((n) => n.endsWith(".json"))
      .map((n) => readJob(n.replace(/\.json$/, ""))),
  );
  return jobs.filter((j): j is Job => j !== null)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/**
 * Reconcile a job record with what is actually on disk.
 *
 * The dev server restarts on every edit, which would orphan an in-memory job,
 * so status is recovered from the artefacts the worker leaves behind rather
 * than trusted from the record alone.
 */
export async function reconcile(job: Job): Promise<Job> {
  if (job.status !== "parsing") return job;

  const facts = await readFacts(job.id);
  if (facts) {
    const done: Job = {
      ...job,
      status: "done",
      finishedAt: new Date().toISOString(),
      parseSeconds: facts.parse_seconds,
      summary: {
        map: facts.match?.map ?? "unknown",
        rounds: facts.match?.rounds_played ?? 0,
        score: facts.match?.score ?? {},
        serverName: facts.match?.server_name ?? "",
      },
    };
    await writeJob(done);
    return done;
  }

  const log = await readLog(job.id);
  if (log && /Traceback|Error:|error:/.test(log)) {
    const failed: Job = {
      ...job,
      status: "failed",
      finishedAt: new Date().toISOString(),
      error: log.trim().split("\n").slice(-6).join("\n"),
    };
    await writeJob(failed);
    return failed;
  }
  return job;
}

export async function readFacts(id: string): Promise<any | null> {
  try {
    return JSON.parse(await fs.readFile(factsPath(id), "utf8"));
  } catch {
    return null;
  }
}

export async function readLog(id: string): Promise<string | null> {
  try {
    return await fs.readFile(logPath(id), "utf8");
  } catch {
    return null;
  }
}

/**
 * Start the Python worker detached.
 *
 * Parsing a half-gigabyte demo takes seconds, not milliseconds, and must not
 * hold the request open; the route returns the job id and the client polls.
 */
export async function startParse(job: Job) {
  const log = await fs.open(logPath(job.id), "a");
  const child = spawn(
    PYTHON,
    ["parse_demo.py", demoPath(job.id),
      "-o", factsPath(job.id),
      "--positions", positionsPath(job.id),
      "--radar", radarPath(job.id)],
    {
      cwd: WORKER_DIR,
      detached: true,
      stdio: ["ignore", log.fd, log.fd],
      windowsHide: true,
    },
  );

  child.on("exit", async (code) => {
    await log.close().catch(() => {});
    if (code === 0) return; // reconcile() promotes it once facts land
    const current = await readJob(job.id);
    if (!current || current.status === "done") return;
    await writeJob({
      ...current,
      status: "failed",
      finishedAt: new Date().toISOString(),
      error: (await readLog(job.id))?.trim().split("\n").slice(-6).join("\n")
        ?? `worker exited with code ${code}`,
    });
  });

  child.unref();
}
