import { invalidateCatalog } from "@/lib/catalog";
import { cronAuthorized } from "@/lib/cron-auth";
import { revalidateSite } from "@/lib/revalidate";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!cronAuthorized(request)) return Response.json({ error: "forbidden" }, { status: 403 });
  invalidateCatalog();
  revalidateSite();
  return Response.json({ ok: true });
}
