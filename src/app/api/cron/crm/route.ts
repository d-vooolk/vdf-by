import { cronAuthorized } from "@/lib/cron-auth";
import { syncCrm } from "@/lib/crm-sync";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!cronAuthorized(request)) return Response.json({ error: "forbidden" }, { status: 403 });
  const report = await syncCrm();
  return Response.json(report, { status: report.failed ? 502 : 200 });
}
