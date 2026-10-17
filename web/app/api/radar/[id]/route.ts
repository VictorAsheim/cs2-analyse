import fs from "node:fs/promises";

import { radarPath } from "@/lib/paths";

/** Serve the radar image copied alongside a parsed match. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const png = await fs.readFile(radarPath(id));
    return new Response(new Uint8Array(png), {
      headers: {
        "Content-Type": "image/png",
        // The radar for a parsed match never changes.
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new Response("no radar for this match", { status: 404 });
  }
}
