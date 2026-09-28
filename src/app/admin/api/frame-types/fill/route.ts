import { getAdmin } from "@/lib/auth";
import { carPathsForProduct } from "@/lib/cars";
import { categoryPaths } from "@/lib/catalog";
import { FrameBusyError } from "@/lib/frame-lock";
import { fillFrameProduct, type FramePart } from "@/lib/frame-products";
import { revalidateProduct } from "@/lib/revalidate";
import { getProductRaw } from "@/lib/store";

export const dynamic = "force-dynamic";

const PARTS: FramePart[] = ["description", "faq"];

export async function POST(request: Request) {
  if (!(await getAdmin())) {
    return Response.json({ error: "Нужно войти заново" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { productId?: string; part?: string };
  const productId = String(body.productId ?? "");
  const part = PARTS.find((item) => item === body.part);
  if (!part) return Response.json({ error: "Неизвестный шаг" }, { status: 400 });

  try {
    const result = await fillFrameProduct(productId, part);
    const product = getProductRaw(productId);
    if (result.status === "done" && product) {
      revalidateProduct(product.slug, categoryPaths(product.categoryId), undefined, carPathsForProduct(productId));
    }
    return Response.json(result);
  } catch (error) {
    if (error instanceof FrameBusyError) return Response.json({ error: error.message }, { status: 409 });
    console.error("[frame-fill]", error);
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
}
