import { notFound } from "next/navigation";

import { ProductForm } from "@/components/admin/ProductForm";
import { getProductCars } from "@/lib/cars";
import { getSite } from "@/lib/catalog";
import { getUsdRate } from "@/lib/rates";
import { thumbsFor } from "@/lib/admin-thumbs";
import { allProductImages } from "@/lib/variant";
import { getProductRaw, listBrands, listCategoriesBrief } from "@/lib/store";

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps) {
  const { id } = await params;
  const product = getProductRaw(id);
  return { title: product?.title ?? "Товар" };
}

export default async function EditProductPage({ params }: PageProps) {
  const { id } = await params;
  const product = getProductRaw(id);
  if (!product) notFound();

  const site = getSite();
  const usdRate = product.costUsd != null ? await getUsdRate() : null;
  const current = usdRate && product.costUsd != null
    ? { ...product, costPrice: Math.round(product.costUsd * usdRate.rate * 100) / 100 }
    : product;

  return (
    <ProductForm
      key={product.id}
      product={current}
      usdRate={usdRate}
      savedCostPrice={product.costPrice ?? null}
      previousId={product.id}
      categories={listCategoriesBrief()}
      brands={listBrands()}
      cars={getProductCars(product.id)}
      // Ссылки на миниатюры считаем на сервере: и общая галерея, и галереи
      // опций — иначе форме пришлось бы угадывать их по имени файла.
      thumbs={thumbsFor(allProductImages(product))}
      currencySymbol={site.currencySymbol}
    />
  );
}
