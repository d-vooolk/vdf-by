import { notFound } from "next/navigation";

import { CategoryForm } from "@/components/admin/CategoryForm";
import { thumbsFor } from "@/lib/admin-thumbs";
import { aiConfigured, DEFAULT_PROMPTS, getPrompts } from "@/lib/ai";
import { getProductsInCategory } from "@/lib/catalog";
import { getCategoryRaw, listCategoriesBrief } from "@/lib/store";

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps) {
  const { id } = await params;
  return { title: getCategoryRaw(id)?.name ?? "Категория" };
}

export default async function EditCategoryPage({ params }: PageProps) {
  const { id } = await params;
  const category = getCategoryRaw(id);
  if (!category) notFound();

  // Сколько товаров внутри — от этого зависит, можно ли удалить раздел
  // сразу или сначала спросить, куда переносить товары.
  const categories = listCategoriesBrief();
  const count = categories.find((entry) => entry.id === id)?.count ?? 0;

  return (
    <CategoryForm
      category={category}
      previousId={category.id}
      thumbs={thumbsFor(category.image ? [category.image] : [])}
      productCount={count}
      categories={categories}
      ai={{ ready: aiConfigured(), prompts: getPrompts(), defaults: DEFAULT_PROMPTS }}
      productTitles={getProductsInCategory(category.id).map((product) => product.title)}
    />
  );
}
