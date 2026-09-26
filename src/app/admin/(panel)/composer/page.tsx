import Link from "next/link";

import { ImageComposer } from "@/components/admin/ImageComposer";

export const metadata = { title: "Генератор картинок" };

export default function ComposerPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-brand-900">Генератор картинок</h1>
        <p className="mt-1 max-w-3xl text-sm text-brand-500">
          Фото товара сверху, фото автомобиля снизу, по линии между ними — для какой машины товар и
          водяной знак магазина. Фото автомобиля выбирается один раз на поколение и дальше
          подставляется само. Авторы фото с Wikimedia перечислены на странице{" "}
          <Link href="/istochniki-foto/" target="_blank" className="underline">
            «Источники фотографий»
          </Link>
          .
        </p>
      </div>
      <ImageComposer />
    </div>
  );
}
