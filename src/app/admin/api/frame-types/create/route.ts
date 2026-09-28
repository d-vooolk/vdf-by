import { getAdmin } from "@/lib/auth";
import { carPathsForProduct } from "@/lib/cars";
import { categoryPaths } from "@/lib/catalog";
import { createFrameProduct } from "@/lib/frame-products";
import { isFrameCategory } from "@/lib/frame-types";
import { revalidateProduct } from "@/lib/revalidate";

export const dynamic = "force-dynamic";

interface Body {
  categoryId?: string;
  type?: string;
  generationId?: string;
}

export async function POST(request: Request) {
  if (!(await getAdmin())) {
    return Response.json({ error: "Нужно войти заново" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as Body;
  const categoryId = String(body.categoryId ?? "");
  if (!isFrameCategory(categoryId)) {
    return Response.json({ error: "Раздел рамок не найден" }, { status: 404 });
  }

  try {
    const result = await createFrameProduct(categoryId, String(body.type ?? ""), String(body.generationId ?? ""));
    if (result.status === "created") {
      revalidateProduct(result.productId, categoryPaths(categoryId), undefined, carPathsForProduct(result.productId));
    }
    return Response.json(result);
  } catch (error) {
    console.error("[frame-create]", error);
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
}
