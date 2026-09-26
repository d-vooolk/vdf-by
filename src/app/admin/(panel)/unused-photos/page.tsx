import { UnusedMediaGrid } from "@/components/admin/UnusedMediaGrid";
import { unusedImages } from "@/lib/images";

export const metadata = { title: "Неиспользуемые фото" };

export default function UnusedPhotosPage() {
  const { images, freshSkipped } = unusedImages();

  const items = images.map((image) => ({
    path: image.path,
    thumb: image.sources.webp?.[0]?.url ?? image.fallback,
    w: image.w,
    h: image.h,
    bytes: image.bytes,
    createdAt: image.createdAt,
  }));

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
