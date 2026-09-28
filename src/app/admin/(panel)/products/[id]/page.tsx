import { notFound } from "next/navigation";

import { ProductForm } from "@/components/admin/ProductForm";
import { getProductCars } from "@/lib/cars";
import { getSite } from "@/lib/catalog";
import { thumbsFor, withCategoryThumbs } from "@/lib/admin-thumbs";
import { aiConfigured, DEFAULT_PROMPTS, getPrompts } from "@/lib/ai";
import { relinkValues } from "@/lib/currency";
import { isFrameCategory } from "@/lib/frame-category";
import { frameMembershipOf } from "@/lib/frame-membership";
import { currentRates } from "@/lib/linked-prices";
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
  const linked = product.priceSource || product.wholesaleSource || product.costSource;
  const current = linked ? relinkValues(product, await currentRates()) : product;
  const membership = frameMembershipOf(product.id);
  const frameType =
    membership && membership.categoryId === product.categoryId && isFrameCategory(membership.categoryId)
      ? membership
      : undefined;

  return (
    <ProductForm
      key={product.id}
      product={current}
      previousId={product.id}
      categories={withCategoryThumbs(listCategoriesBrief())}
      brands={listBrands()}
      cars={getProductCars(product.id)}
      // Ссылки на миниатюры считаем на сервере: и общая галерея, и галереи
      // опций — иначе форме пришлось бы угадывать их по имени файла.
      thumbs={thumbsFor(allProductImages(product))}
      currencySymbol={site.currencySymbol}
      siteName={site.name}
      ai={{ ready: aiConfigured(), prompts: getPrompts(), defaults: DEFAULT_PROMPTS }}
      frameType={frameType}
    />
  );
}
