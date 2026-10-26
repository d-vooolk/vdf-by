import type { Metadata } from "next";
import Link from "next/link";

import { FrameTypeList, type FrameTypeListRow } from "@/components/admin/FrameTypeList";
import { PlusIcon } from "@/components/icons";
import { formatPrice } from "@/lib/format";
import { getSite } from "@/lib/catalog";
import { buildFrameSku } from "@/lib/frame-sku";
import {
  defaultFrameCategory,
  frameCategories,
  listFrameTypeSummaries,
  type FrameTypeValues,
} from "@/lib/frame-types";

export const metadata: Metadata = { title: "Типы рамок" };

interface PageProps {
  searchParams: Promise<{ category?: string; q?: string; stock?: string }>;
}

export default async function FrameTypesPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const categories = frameCategories();
  const categoryId =
    categories.find((category) => category.id === params.category)?.id ??
    defaultFrameCategory(categories);
  const query = (params.q ?? "").trim().toUpperCase().slice(0, 10);
  const site = getSite();
  const money = (value: number | null) =>
    value === null ? "—" : formatPrice(value, site.currencySymbol);
  const describe = (values: FrameTypeValues) =>
    [
      `себест. ${money(values.costPrice)}`,
      `цена ${money(values.price)}`,
      `опт ${money(values.wholesalePrice)}`,
      `вес ${values.weight === null ? "—" : `${values.weight} кг`}`,
    ].join(" · ");

  const summaries = categoryId ? listFrameTypeSummaries(categoryId) : [];
  const rows: FrameTypeListRow[] = summaries.map((summary) => ({
    type: summary.type,
    name: summary.name,
    sku: buildFrameSku({ number: "номер", storage: summary.storageCode, type: summary.type }),
    summary: summary.saved ? describe(summary.saved) : "цены для типа не заданы",
    storageCode: summary.storageCode,
    storageMixed: summary.storageMixed,
    productCount: summary.productCount,
    uniform: summary.uniform,
    stockQty: summary.stockQty,
  }));
  const categoryQuery = `?category=${encodeURIComponent(categoryId)}`;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold text-brand-900">
            Типы рамок{" "}
            <span className="tnum text-base font-medium text-brand-400">{summaries.length}</span>
          </h1>
          <p className="mt-1 text-sm text-brand-500">
            Артикул товара собирается как «номер-складской номер-тип»: номер свой у каждого товара,
            складской номер и тип общие. Себестоимость, цена, оптовая цена, вес, остаток и наличие задаются
            для типа целиком и записываются во все товары с этим типом.
          </p>
        </div>
        {categoryId && (
          <Link href={`/admin/frame-types/new/${categoryQuery}`} className="btn-primary py-2 text-sm">
            <PlusIcon className="h-4 w-4" />
            Новый тип
          </Link>
        )}
      </div>

      {!categoryId ? (
        <p className="card p-10 text-center text-sm text-brand-400">
          Нет раздела рамок: нужен раздел без подразделов с подбором по машинам и словом «рамки» в
          названии.
        </p>
      ) : (
        <FrameTypeList
          rows={rows}
          categories={categories}
          categoryId={categoryId}
          initialQuery={query}
          initialStockOnly={params.stock === "1"}
        />
      )}
    </div>
  );
}
