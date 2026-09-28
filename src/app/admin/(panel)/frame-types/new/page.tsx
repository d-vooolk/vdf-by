import type { Metadata } from "next";
import Link from "next/link";

import { FrameTypeInfoForm } from "@/components/admin/FrameTypeInfoForm";
import { defaultFrameCategory, frameCategories } from "@/lib/frame-types";

export const metadata: Metadata = { title: "Новый тип рамки" };

interface PageProps {
  searchParams: Promise<{ category?: string }>;
}

export default async function NewFrameTypePage({ searchParams }: PageProps) {
  const { category } = await searchParams;
  const categories = frameCategories();
  const categoryId =
    categories.find((entry) => entry.id === category)?.id ?? defaultFrameCategory(categories);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href={`/admin/frame-types/?category=${encodeURIComponent(categoryId)}`}
          className="btn-ghost py-2 text-sm"
        >
          ← Все типы
        </Link>
        <h1 className="text-xl font-semibold text-brand-900">Новый тип рамки</h1>
      </div>

      {categoryId ? (
        <FrameTypeInfoForm
          categoryId={categoryId}
          previousType={null}
          initial={{ type: "", suffix: "", name: "", storageCode: "" }}
          sampleNumber="482913"
          count={0}
        />
      ) : (
        <p className="card p-10 text-center text-sm text-brand-400">Раздел рамок не найден.</p>
      )}
      <p className="text-sm text-brand-500">
        После создания откроется страница типа: там задаются цены и остаток, добавляются товары и
        генерируются фото.
      </p>
    </div>
  );
}
