import { cookies } from "next/headers";

import { ProductForm } from "@/components/admin/ProductForm";
import { thumbsFor, withCategoryThumbs } from "@/lib/admin-thumbs";
import { LAST_CATEGORY_COOKIE } from "@/lib/admin-prefs";
import { aiConfigured, DEFAULT_PROMPTS, getPrompts } from "@/lib/ai";
import { getProductCars } from "@/lib/cars";
import { getSite } from "@/lib/catalog";
import { getDb } from "@/lib/db";
import type { Product } from "@/lib/schema";
import { toSlug } from "@/lib/slug.mjs";
import { getProductRaw, listBrands, listCategoriesBrief, nextSku } from "@/lib/store";
import { allProductImages } from "@/lib/variant";

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
  searchParams: Promise<{ category?: string; copy?: string }>;
}

function freeCopyId(title: string): string {
  const db = getDb();
  const taken = (value: string) =>
    Boolean(db.prepare("SELECT 1 FROM products WHERE id = ? OR slug = ?").get(value, value));
  const base = toSlug(`${title} kopiya`);
  if (!taken(base)) return base;
  for (let index = 2; index < 1000; index += 1) {
    const candidate = `${base.slice(0, 74)}-${index}`;
    if (!taken(candidate)) return candidate;
  }
  return "";
}

export default async function NewProductPage({ searchParams }: PageProps) {
  const { category, copy } = await searchParams;
  const categories = listCategoriesBrief();
  const site = getSite();
  const source = copy ? getProductRaw(copy) : null;

  if (source) {
    const id = freeCopyId(source.title);
    return (
      <ProductForm
        key={`copy-${source.id}`}
        product={{ ...source, id, slug: id, sku: nextSku() }}
        copiedFrom={source.title}
        categories={withCategoryThumbs(categories)}
        brands={listBrands()}
        cars={getProductCars(source.id)}
        thumbs={thumbsFor(allProductImages(source))}
        currencySymbol={site.currencySymbol}
        ai={{ ready: aiConfigured(), prompts: getPrompts(), defaults: DEFAULT_PROMPTS }}
      />
    );
  }

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
