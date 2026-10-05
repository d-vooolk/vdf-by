import { invalidateCatalog } from "@/lib/catalog";
import { cronAuthorized } from "@/lib/cron-auth";
import { refreshLinkedPrices } from "@/lib/linked-prices";
import { revalidateSite } from "@/lib/revalidate";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!cronAuthorized(request)) return Response.json({ error: "forbidden" }, { status: 403 });
  const report = await refreshLinkedPrices();
  if (report.products) {
    invalidateCatalog();
    revalidateSite();
  }
  return Response.json(report, { status: report.ok ? 200 : 500 });
}
