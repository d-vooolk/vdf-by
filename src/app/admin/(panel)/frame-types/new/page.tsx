import type { Metadata } from "next";
import Link from "next/link";

import { FrameTypeInfoForm } from "@/components/admin/FrameTypeInfoForm";
import { getProductCars } from "@/lib/cars";
import { isFrameType, normalizeFrameType } from "@/lib/frame-sku";
import {
  DEFAULT_TITLE_TEMPLATE,
  defaultFrameCategory,
  frameCategories,
  getFrameType,
  plannedFrameCars,
  type FrameTypeGroup,
} from "@/lib/frame-types";
import { specsToText } from "@/lib/spec-text";

export const metadata: Metadata = { title: "Новый тип рамки" };

interface PageProps {
  searchParams: Promise<{ category?: string; from?: string }>;
}

export default async function NewFrameTypePage({ searchParams }: PageProps) {
  const { category, from } = await searchParams;
  const categories = frameCategories();
  const categoryId =
    categories.find((entry) => entry.id === category)?.id ?? defaultFrameCategory(categories);
  const fromType = normalizeFrameType(from ?? "");
  const source = categoryId && isFrameType(fromType) ? getFrameType(categoryId, fromType) : null;

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
          {source ? `Копия типа ${source.type}` : "Новый тип рамки"}
          {source?.name && <span className="font-normal text-brand-500"> · {source.name}</span>}
        </h1>
      </div>

      {source ? (
        <CopyFrameType categoryId={categoryId} source={source} />
      ) : categoryId ? (
        <FrameTypeInfoForm
          categoryId={categoryId}
          previousType={null}
          initial={{
            type: "",
            suffix: "",
            name: "",
            storageCode: "",
            brief: "",
            specsText: "Страна производитель: Россия",
            titleTemplate: DEFAULT_TITLE_TEMPLATE,
          }}
          sampleNumber="AA4B7"
          count={0}
        />
      ) : (
        <p className="card p-10 text-center text-sm text-brand-400">Раздел рамок не найден.</p>
      )}
      {!source && (
        <p className="text-sm text-brand-500">
          После создания откроется страница типа: там задаются цены и остаток, выбираются машины, под
          которые создадутся карточки, и загружается фото рамки для картинок с автомобилем.
        </p>
      )}
    </div>
  );
}

function CopyFrameType({ categoryId, source }: { categoryId: string; source: FrameTypeGroup }) {
  const carCount = new Set([
    ...source.products.flatMap((product) => getProductCars(product.id).map((car) => car.generationId)),
    ...plannedFrameCars(categoryId, source.type).map((car) => car.generationId),
  ]).size;

  return (
    <>
      <p className="card p-4 text-sm text-brand-600">
        В копию перейдут дополнение, складской номер, шаблон названия, описание для нейросети,
        характеристики, цены, остаток, фото рамки и оформление картинок, а также машины типа (
        <span className="tnum">{carCount}</span>) — они будут выбраны в блоке «Создать карточки для
        машин». Товары не копируются. Номер рамки и название типа у копии должны быть другими.
      </p>
      <FrameTypeInfoForm
        categoryId={categoryId}
        previousType={null}
        copyFrom={source.type}
        initial={{
          type: source.type,
          suffix: source.suffix,
          name: source.name,
          storageCode: source.storageCode,
          brief: source.brief,
          specsText: specsToText(source.specs),
          titleTemplate: source.titleTemplate,
        }}
        sampleNumber="AA4B7"
        count={0}
      />
    </>
  );
}
