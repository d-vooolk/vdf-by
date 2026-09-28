import Link from "next/link";
import { notFound } from "next/navigation";

import { FrameTypeComposer } from "@/components/admin/FrameTypeComposer";
import { FrameTypeForm } from "@/components/admin/FrameTypeForm";
import { FrameTypeInfoForm } from "@/components/admin/FrameTypeInfoForm";
import { FrameTypeProducts } from "@/components/admin/FrameTypeProducts";
import { getProductCars } from "@/lib/cars";
import { getSite } from "@/lib/catalog";
import { formatPrice } from "@/lib/format";
import { isFrameType, normalizeFrameType, splitFrameSku } from "@/lib/frame-sku";
import {
  defaultFrameCategory,
  frameCategories,
  frameTypeProductsOutside,
  getFrameType,
  initialFrameValues,
} from "@/lib/frame-types";

interface PageProps {
  params: Promise<{ type: string }>;
  searchParams: Promise<{ category?: string }>;
}

export async function generateMetadata({ params }: PageProps) {
  const { type } = await params;
  return { title: `Тип рамки ${normalizeFrameType(decodeURIComponent(type))}` };
}

export default async function FrameTypePage({ params, searchParams }: PageProps) {
  const type = normalizeFrameType(decodeURIComponent((await params).type));
  if (!isFrameType(type)) notFound();
  const { category } = await searchParams;
  const categories = frameCategories();
  const categoryId =
    categories.find((entry) => entry.id === category)?.id ?? defaultFrameCategory(categories);
  const group = getFrameType(categoryId, type);
  if (!group) notFound();

  const site = getSite();
  const money = (value: number | null) =>
    value === null || value <= 0 ? "—" : formatPrice(value, site.currencySymbol);

  const rows = group.products.map((product) => ({
    id: product.id,
    title: product.title,
    sku: product.sku,
    price: money(product.price),
    stockQty: product.stockQty,
    cars: getProductCars(product.id),
  }));
  const sampleGenerationId = rows
    .flatMap((row) => row.cars)
    .sort((a, b) => (b.yearFrom ?? 0) - (a.yearFrom ?? 0))[0]?.generationId;
  const sampleNumber =
    group.products
      .map((product) => splitFrameSku(product.sku).number)
      .find((number) => /^\d{6}$/.test(number)) ?? "482913";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href={`/admin/frame-types/?category=${encodeURIComponent(categoryId)}`}
          className="btn-ghost py-2 text-sm"
        >
          ← Все типы
        </Link>
        <h1 className="text-xl font-semibold text-brand-900">
          Тип рамки {type}
          {group.name && <span className="font-normal text-brand-500"> · {group.name}</span>}
        </h1>
      </div>

      <FrameTypeInfoForm
        key={`info-${type}-${group.suffix}-${group.name}-${group.storageCode}`}
        categoryId={categoryId}
        previousType={type}
        initial={{ type, suffix: group.suffix, name: group.name, storageCode: group.storageCode }}
        sampleNumber={sampleNumber}
        count={group.products.length}
        storageMixed={group.storageMixed}
      />

      <FrameTypeForm
        key={`${categoryId}-${type}`}
        categoryId={categoryId}
        type={type}
        initial={initialFrameValues(group)}
        count={group.products.length}
        currencySymbol={site.currencySymbol}
      />

      <FrameTypeProducts
        categoryId={categoryId}
        type={type}
        products={rows}
        candidates={frameTypeProductsOutside(categoryId, type)}
      />

      <FrameTypeComposer
        key={`composer-${type}`}
        categoryId={categoryId}
        type={type}
        products={group.products.map((product) => ({ id: product.id, title: product.title }))}
        sampleGenerationId={sampleGenerationId}
        hasFrameImage={group.hasFrameImage}
        settings={group.composer}
      />
    </div>
  );
}
