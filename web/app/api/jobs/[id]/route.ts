import { readJob, reconcile } from "@/lib/jobs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const job = await readJob(id);
  if (!job) return Response.json({ error: "no such job" }, { status: 404 });
  return Response.json(await reconcile(job));
}
