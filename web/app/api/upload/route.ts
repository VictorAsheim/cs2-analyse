import { createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { randomUUID } from "node:crypto";

import { ensureDirs, startParse, writeJob, type Job } from "@/lib/jobs";
import { demoPath } from "@/lib/paths";

/**
 * Accept a .dem as a raw request body and stream it to disk.
 *
 * Demos run to hundreds of megabytes, so the body is piped straight to a file
 * rather than buffered through FormData, and the filename travels in a header.
 */
export async function POST(request: Request) {
  await ensureDirs();

  const filename = request.headers.get("x-demo-filename") ?? "upload.dem";
  if (!filename.toLowerCase().endsWith(".dem")) {
    return Response.json({ error: "only .dem files are accepted" }, { status: 400 });
  }
  if (!request.body) {
    return Response.json({ error: "empty request body" }, { status: 400 });
  }

  const id = randomUUID();
  const target = demoPath(id);

  const job: Job = {
    id,
    filename,
    sizeBytes: 0,
    status: "uploading",
    createdAt: new Date().toISOString(),
  };
  await writeJob(job);

  try {
    await pipeline(
      Readable.fromWeb(request.body as import("node:stream/web").ReadableStream),
      createWriteStream(target),
    );
  } catch (err) {
    await writeJob({
      ...job,
      status: "failed",
      error: `upload failed: ${(err as Error).message}`,
    });
    await fs.rm(target, { force: true });
    return Response.json({ error: "upload failed", id }, { status: 500 });
  }

  const { size } = await fs.stat(target);
  // A CS2 demo starts with the PBDEMS2 magic; reject anything else before
  // handing a half-gigabyte file to the parser.
  const head = Buffer.alloc(8);
  const fh = await fs.open(target, "r");
  await fh.read(head, 0, 8, 0);
  await fh.close();
  if (!head.toString("latin1").startsWith("PBDEMS2")) {
    await fs.rm(target, { force: true });
    const failed: Job = {
      ...job, sizeBytes: size, status: "failed",
      error: "not a CS2 demo: missing PBDEMS2 file signature",
    };
    await writeJob(failed);
    return Response.json({ error: failed.error, id }, { status: 400 });
  }

  const parsing: Job = { ...job, sizeBytes: size, status: "parsing" };
  await writeJob(parsing);
  await startParse(parsing);

  return Response.json({ id, status: "parsing", sizeBytes: size });
}
