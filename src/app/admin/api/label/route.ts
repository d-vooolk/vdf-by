import { getAdmin } from "@/lib/auth";
import { normalizeFrameType } from "@/lib/frame-sku";
import { frameTypeLabel, productLabel, renderLabelHtml } from "@/lib/label";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!(await getAdmin())) return new Response("Нужно войти заново", { status: 401 });
  const params = new URL(request.url).searchParams;
  const productId = params.get("product");
  const type = params.get("type");
  const label = productId
    ? productLabel(productId)
    : type
      ? frameTypeLabel(params.get("category") ?? "", normalizeFrameType(type))
      : null;
  if (!label) return new Response("Нечего печатать", { status: 404 });
  return new Response(await renderLabelHtml(label), {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}
