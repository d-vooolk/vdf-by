import { notFound } from "next/navigation";

import { CarTextsEditor, type CarTextEntry } from "@/components/admin/CarTextsEditor";
import { CategoryForm } from "@/components/admin/CategoryForm";
import { thumbsFor } from "@/lib/admin-thumbs";
import { aiConfigured, DEFAULT_PROMPTS, getPrompts } from "@/lib/ai";
import { listCarTexts } from "@/lib/car-texts";
import { carName, carsRoot, modelUrl } from "@/lib/car-types";
import { getCarTree, isCarFitmentCategory } from "@/lib/cars";
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
      carTexts={
        isCarFitmentCategory(category.id) && (
          <CarTextsEditor categoryId={category.id} entries={carTextEntries(category.id, category.slug)} />
        )
      }
    />
  );
}

function carTextEntries(categoryId: string, categorySlug: string): CarTextEntry[] {
  const texts = listCarTexts(categoryId);
  const base = carsRoot(categorySlug);
  return getCarTree(categoryId).flatMap((mark) =>
    mark.models.map((model) => ({
      modelId: model.id,
      name: carName(mark, model),
      url: modelUrl(mark.slug, model.slug, base),
      productCount: model.productCount,
      text: texts.get(model.id)?.text ?? "",
    })),
  );
}
