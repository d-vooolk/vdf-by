import { cronAuthorized } from "@/lib/cron-auth";
import { runFrameSplitBatch } from "@/lib/frame-split";

export const dynamic = "force-dynamic";

const BUDGET_MS = 4 * 60 * 1000;

export async function POST(request: Request) {
  if (!cronAuthorized(request)) return Response.json({ error: "forbidden" }, { status: 403 });
  const report = await runFrameSplitBatch(BUDGET_MS);
  return Response.json(report);
}
