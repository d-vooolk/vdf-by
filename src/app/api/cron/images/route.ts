import { cronAuthorized } from "@/lib/cron-auth";
import { deleteLongUnusedImages } from "@/lib/image-cleanup";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!cronAuthorized(request)) return Response.json({ error: "forbidden" }, { status: 403 });
  const { tracked, deleted } = await deleteLongUnusedImages();
  return Response.json({ ok: true, tracked, deleted: deleted.length, paths: deleted });
}
