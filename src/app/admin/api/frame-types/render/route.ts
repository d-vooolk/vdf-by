import { getAdmin } from "@/lib/auth";
import { carPathsForProduct } from "@/lib/cars";
import { categoryPaths, invalidateCatalog } from "@/lib/catalog";
import { renderFrameProduct } from "@/lib/frame-renders";
import { revalidateImages, revalidateProduct } from "@/lib/revalidate";
import { getProductRaw } from "@/lib/store";

export const dynamic = "force-dynamic";

interface Body {
  categoryId?: string;
  type?: string;
  productId?: string;
}

export async function POST(request: Request) {
  if (!(await getAdmin())) {
    return Response.json({ error: "Нужно войти заново" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as Body;
  const productId = String(body.productId ?? "");

  try {
    const result = await renderFrameProduct(String(body.categoryId ?? ""), String(body.type ?? ""), productId);
    if (result.status === "done") {
      invalidateCatalog();
      const product = getProductRaw(productId);
      if (product) {
        revalidateProduct(product.slug, categoryPaths(product.categoryId), undefined, carPathsForProduct(productId));
      }
      revalidateImages();
    }
    return Response.json(result);
  } catch (error) {
    console.error("[frame-render]", error);
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
}
