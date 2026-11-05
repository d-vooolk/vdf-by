import { sendDueBusinessPosts } from "@/lib/business-posts";
import { cronAuthorized } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!cronAuthorized(request)) return Response.json({ error: "forbidden" }, { status: 403 });
  const report = await sendDueBusinessPosts();
  return Response.json(report, { status: report.failed.length ? 502 : 200 });
}
