import { cronAuthorized } from "@/lib/cron-auth";
import { runSeoCollection, type SeoKind } from "@/lib/seo-data";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!cronAuthorized(request)) return Response.json({ error: "forbidden" }, { status: 403 });
  const kind: SeoKind = new URL(request.url).searchParams.get("kind") === "competitors" ? "competitors" : "search";
  const status = await runSeoCollection(kind);
  return Response.json({ kind, ...status }, { status: status.errors.length ? 500 : 200 });
}
