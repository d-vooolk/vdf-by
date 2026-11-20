import { after } from "next/server";

import { startAnswerCheck } from "@/lib/ai-seo";
import { cronAuthorized } from "@/lib/cron-auth";
import { runSeoCollection, type SeoKind } from "@/lib/seo-data";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!cronAuthorized(request)) return Response.json({ error: "forbidden" }, { status: 403 });
  const requested = new URL(request.url).searchParams.get("kind");
  if (requested === "ai") {
    const result = startAnswerCheck();
    if (!result.ok) return Response.json({ kind: "ai", error: result.error }, { status: 409 });
    after(() => result.done);
    return Response.json({ kind: "ai", started: true });
  }
  const kind: SeoKind = requested === "competitors" ? "competitors" : "search";
  const status = await runSeoCollection(kind);
  return Response.json({ kind, ...status }, { status: status.errors.length ? 500 : 200 });
}
