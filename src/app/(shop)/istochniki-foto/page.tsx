import type { Metadata } from "next";

import { Breadcrumbs } from "@/components/Breadcrumbs";
import { listCreditedPhotos } from "@/lib/car-photos";
import { getSite } from "@/lib/catalog";
import { buildMetadata } from "@/lib/seo";

export function generateMetadata(): Metadata {
  const site = getSite();
  return buildMetadata({
    title: "Источники фотографий",
    description: `Авторы и лицензии фотографий автомобилей, использованных на сайте ${site.name}.`,
    path: "/istochniki-foto/",
    noIndex: true,
  });
}

export default function PhotoCreditsPage() {
  const photos = listCreditedPhotos();

  return (
    <div className="container-page">
      <Breadcrumbs items={[{ label: "Источники фотографий" }]} />

      <div className="max-w-3xl">
        <h1 className="text-3xl font-semibold text-brand-900 sm:text-4xl">Источники фотографий</h1>

        <div className="prose-shop mt-6">
          <p>
            На изображениях товаров использованы фотографии автомобилей из Wikimedia Commons и других
            источников на условиях свободных лицензий. Фотографии обрезаны, могут быть отражены и
            дополнены изображением товара, подписью и логотипом магазина.
          </p>
        </div>

        {photos.length === 0 ? (
          <p className="mt-6 text-sm text-brand-400">Список пока пуст.</p>
        ) : (
          <ul className="mt-6 divide-y divide-brand-100 text-sm">
            {photos.map((photo) => (
              <li key={photo.generationId} className="py-3">
                <p className="font-medium text-brand-900">{photo.car}</p>
                <p className="mt-0.5 text-brand-500">
                  <a href={photo.sourceUrl} target="_blank" rel="noopener nofollow" className="underline">
                    {photo.title || "Фотография"}
                  </a>
                  {photo.author && <>, автор: {photo.author}</>}
                  {photo.license && (
                    <>
                      , лицензия{" "}
                      {photo.licenseUrl ? (
                        <a href={photo.licenseUrl} target="_blank" rel="noopener nofollow" className="underline">
                          {photo.license}
                        </a>
                      ) : (
                        photo.license
                      )}
                    </>
                  )}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
