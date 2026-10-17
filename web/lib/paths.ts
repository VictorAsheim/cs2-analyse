import path from "node:path";

/** Repository root: the web app lives in <root>/web. */
export const ROOT = path.resolve(process.cwd(), "..");
export const DATA_DIR = process.env.CS2_DATA_DIR ?? path.join(ROOT, "data");
export const UPLOAD_DIR = path.join(DATA_DIR, "uploads");
export const JOB_DIR = path.join(DATA_DIR, "jobs");
export const FACTS_DIR = path.join(DATA_DIR, "facts");
export const WORKER_DIR = path.join(ROOT, "worker");

/** Interpreter from the repo venv, overridable for other environments. */
export const PYTHON =
  process.env.CS2_PYTHON ??
  path.join(ROOT, ".venv", process.platform === "win32" ? "Scripts" : "bin",
    process.platform === "win32" ? "python.exe" : "python");

export const factsPath = (id: string) => path.join(FACTS_DIR, `${id}.facts.json`);
export const positionsPath = (id: string) => path.join(FACTS_DIR, `${id}.positions.parquet`);
export const radarPath = (id: string) => path.join(FACTS_DIR, `${id}.radar.png`);
export const logPath = (id: string) => path.join(JOB_DIR, `${id}.log`);
export const jobPath = (id: string) => path.join(JOB_DIR, `${id}.json`);
export const demoPath = (id: string) => path.join(UPLOAD_DIR, `${id}.dem`);
