import { listJobs, reconcile } from "@/lib/jobs";

export async function GET() {
  const jobs = await Promise.all((await listJobs()).map(reconcile));
  return Response.json({ jobs });
}
