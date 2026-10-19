import { getAdmin } from "@/lib/auth";
import { normalizeFrameType } from "@/lib/frame-sku";
import {
  frameTypeLabel,
  frameTypeStorageCode,
  productLabel,
  productStorageCode,
  renderBigTextHtml,
  renderLabelHtml,
} from "@/lib/label";

export const dynamic = "force-dynamic";

const HTML_HEADERS = { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" };

export async function GET(request: Request) {
  if (!(await getAdmin())) return new Response("Нужно войти заново", { status: 401 });
  const params = new URL(request.url).searchParams;
  const productId = params.get("product");
  const type = params.get("type");
  const layout = params.get("layout");
  if (layout === "storage") {
    const storageCode = productId
      ? productStorageCode(productId)
      : type
        ? frameTypeStorageCode(params.get("category") ?? "", normalizeFrameType(type))
        : null;
    if (storageCode === null) return new Response("Нечего печатать", { status: 404 });
    if (!storageCode) return new Response("Складской номер не заведён", { status: 404 });
    return new Response(renderBigTextHtml(storageCode), { headers: HTML_HEADERS });
  }
  const label = productId
    ? productLabel(productId)
    : type
      ? frameTypeLabel(params.get("category") ?? "", normalizeFrameType(type))
      : null;
  if (!label) return new Response("Нечего печатать", { status: 404 });
  if (type && !productId && layout === "number") {
    return new Response(renderBigTextHtml(normalizeFrameType(type)), { headers: HTML_HEADERS });
  }
  return new Response(await renderLabelHtml(label), { headers: HTML_HEADERS });
}
