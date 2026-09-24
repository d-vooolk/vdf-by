import { cookies } from "next/headers";

import { ProductForm } from "@/components/admin/ProductForm";
import { withCategoryThumbs } from "@/lib/admin-thumbs";
import { LAST_CATEGORY_COOKIE } from "@/lib/admin-prefs";
import { aiConfigured, DEFAULT_PROMPTS, getPrompts } from "@/lib/ai";
import { getSite } from "@/lib/catalog";
import type { Product } from "@/lib/schema";
import { listBrands, listCategoriesBrief, nextSku } from "@/lib/store";

export const metadata = { title: "Новый товар" };

/** Заготовка нового товара: обязательные поля есть, остальное пусто. */
const BLANK: Product = {
  id: "",
  slug: "",
  categoryId: "",
  title: "",
  price: 0,
  inStock: true,
  images: [],
  specs: [],
  optionGroups: [],
};

interface PageProps {
  searchParams: Promise<{ category?: string }>;
}

export default async function NewProductPage({ searchParams }: PageProps) {
  const { category } = await searchParams;
  const categories = listCategoriesBrief();
  const site = getSite();
  const remembered = (await cookies()).get(LAST_CATEGORY_COOKIE)?.value;
  const leaf = (id: string | undefined) =>
    categories.find((entry) => entry.id === id && entry.children === 0)?.id;
  const initialCategory =
    leaf(category) ??
    leaf(remembered) ??
    categories.find((entry) => entry.children === 0)?.id ??
    "";

  return (
    <ProductForm
      product={{
        ...BLANK,
        // Если пришли из конкретного раздела, он уже выбран — одно действие
        // меньше.
        categoryId: initialCategory,
        // Артикул сразу свободный: заполнять его руками не нужно, а забыть
        // — нечего. Занять его между открытием формы и сохранением может
        // только другой такой же черновик, и на это есть проверка в
        // saveProduct.
        sku: nextSku(),
      }}
      categories={withCategoryThumbs(categories)}
      brands={listBrands()}
      cars={[]}
      thumbs={{}}
      currencySymbol={site.currencySymbol}
      ai={{ ready: aiConfigured(), prompts: getPrompts(), defaults: DEFAULT_PROMPTS }}
    />
  );
}
