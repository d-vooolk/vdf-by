import { UnusedMediaGrid } from "@/components/admin/UnusedMediaGrid";
import { trackUnusedImages, UNUSED_KEEP_DAYS } from "@/lib/image-cleanup";
import { unusedImages } from "@/lib/images";

const DAY_MS = 24 * 60 * 60 * 1000;

export const metadata = { title: "Неиспользуемые фото" };

function loadUnusedPhotos() {
  const now = Date.now();
  const unusedSince = trackUnusedImages(now);
  const { images, freshSkipped } = unusedImages(now);

  const items = images.map((image) => ({
    path: image.path,
    thumb: image.sources.webp?.[0]?.url ?? image.fallback,
    w: image.w,
    h: image.h,
    bytes: image.bytes,
    createdAt: image.createdAt,
    daysLeft: Math.max(
      1,
      Math.ceil(((unusedSince.get(image.path) ?? now) + UNUSED_KEEP_DAYS * DAY_MS - now) / DAY_MS),
    ),
  }));
  return { items, freshSkipped };
}

export default function UnusedPhotosPage() {
  const { items, freshSkipped } = loadUnusedPhotos();

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-brand-900">
          Неиспользуемые фото{" "}
          <span className="tnum text-base font-medium text-brand-400">{items.length}</span>
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-brand-500">
          Фото, которых нет ни в одном товаре, категории, настройках сайта и справочнике
          автомобилей, в том числе те, что когда-то использовались, а потом были убраны.
          Фото, которое не используется {UNUSED_KEEP_DAYS} дней подряд, удаляется автоматически
          ночью; если за это время поставить его в товар, отсчёт сбросится.
          {freshSkipped > 0 && (
            <>
              {" "}
              Загруженные за последние сутки не показываются ({freshSkipped} шт.): они могут
              ждать, пока товар сохранят.
            </>
          )}
        </p>
      </div>
      <UnusedMediaGrid items={items} />
    </div>
  );
}
