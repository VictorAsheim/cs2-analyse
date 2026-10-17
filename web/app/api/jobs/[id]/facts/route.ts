import { readFacts } from "@/lib/jobs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const facts = await readFacts(id);
  if (!facts) return Response.json({ error: "facts not ready" }, { status: 404 });
  return Response.json(facts);
}
