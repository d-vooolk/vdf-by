import { ProductForm } from "@/components/admin/ProductForm";
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

  return (
    <ProductForm
      product={{
        ...BLANK,
        // Если пришли из конкретного раздела, он уже выбран — одно действие
        // меньше.
        categoryId: category ?? categories[0]?.id ?? "",
        // Артикул сразу свободный: заполнять его руками не нужно, а забыть
        // — нечего. Занять его между открытием формы и сохранением может
        // только другой такой же черновик, и на это есть проверка в
        // saveProduct.
        sku: nextSku(),
      }}
      categories={categories}
      brands={listBrands()}
      cars={[]}
      thumbs={{}}
      currencySymbol={site.currencySymbol}
    />
  );
}
