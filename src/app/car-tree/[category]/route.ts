import { pickerTree } from "@/lib/car-picker";
import { fitmentCategories } from "@/lib/cars";

export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return fitmentCategories()
    .filter((category) => !category.parentId)
    .map((category) => ({ category: category.slug }));
}

export async function GET(_request: Request, context: { params: Promise<{ category: string }> }) {
  const { category: slug } = await context.params;
  const category = fitmentCategories().find((item) => item.slug === slug && !item.parentId);
  return Response.json(category ? pickerTree(category.id) : [], { headers: { "x-robots-tag": "noindex" } });
}
