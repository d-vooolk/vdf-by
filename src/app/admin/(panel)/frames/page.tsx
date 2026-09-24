import type { Metadata } from "next";

import { FrameImporter } from "@/components/admin/FrameImporter";
import { aiConfigured } from "@/lib/ai";
import { frameSummary, listFrames, STATUS_LABELS, type FrameEntry } from "@/lib/frame-import";
import { listCategoriesBrief } from "@/lib/store";

export const metadata: Metadata = { title: "Импорт рамок" };

export default async function FramesPage() {
  const categories = listCategoriesBrief()
    .filter((category) => category.carFitment && category.children === 0)
    .map((category) => ({ id: category.id, name: category.name }));
  const defaultCategoryId =
    categories.find((category) => /рамк/i.test(category.name))?.id ?? categories[0]?.id ?? "";

  const frames = listFrames();
  const groups = new Map<string, FrameEntry[]>();
  for (const frame of frames) {
    const list = groups.get(frame.frameType) ?? [];
    list.push(frame);
    groups.set(frame.frameType, list);
  }
  const types = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  const unmatchedCount = frames.filter((frame) => frame.status !== "new" && !frame.matched).length;
  const reviewCount = frames.filter((frame) => frame.review.length).length;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-brand-900">Импорт переходных рамок</h1>
        <p className="mt-1 text-sm text-brand-500">
          Временный раздел: собирает рамки с vdf-light.ru, группирует по типу (три последние
          цифры артикула) и создаёт из них товары.
        </p>
      </div>

      <FrameImporter
        initial={frameSummary()}
        categories={categories}
        defaultCategoryId={defaultCategoryId}
        aiReady={aiConfigured()}
      />

      {types.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-semibold text-brand-900">
            Типы рамок <span className="tnum text-brand-400">{types.length}</span>
            {unmatchedCount > 0 && (
              <span className="ml-2 text-sm font-normal text-amber-700">
                без машины из справочника: {unmatchedCount}
              </span>
            )}
            {reviewCount > 0 && (
              <span className="ml-2 text-sm font-normal text-amber-700">
                проверить привязку: {reviewCount}
              </span>
            )}
          </h2>
          <div className="card divide-y divide-brand-100">
            {types.map(([type, list]) => (
              <details key={type || "none"} className="group">
                <summary className="flex cursor-pointer items-center gap-3 px-4 py-2.5 text-sm hover:bg-brand-50">
                  <span className="tnum w-14 font-semibold text-brand-900">{type || "—"}</span>
                  <span className="min-w-0 flex-1 truncate text-brand-600">
                    {list.map((frame) => frame.name.replace(/^Рамки для замены линз в фарах\s*/i, "")).join(" · ")}
                  </span>
                  <span className="tnum shrink-0 text-brand-400">{list.length}</span>
                </summary>
                <ul className="space-y-2 bg-brand-50/60 px-4 py-3 text-sm">
                  {list.map((frame) => (
                    <li key={frame.url}>
                      <a
                        href={frame.url}
                        target="_blank"
                        rel="noreferrer"
                        className="font-medium text-brand-900 underline"
                      >
                        {frame.article}
                      </a>{" "}
                      <span className="text-brand-600">{frame.name}</span>{" "}
                      <span className="text-xs text-brand-400">· {STATUS_LABELS[frame.status]}</span>
                      {frame.productId && (
                        <>
                          {" "}
                          <a
                            href={`/admin/products/${frame.productId}/`}
                            className="text-xs text-brand-600 underline"
                          >
                            товар
                          </a>
                        </>
                      )}
                      {frame.cars.length > 0 && (
                        <p className="text-xs text-brand-500">Машины: {frame.cars.join("; ")}</p>
                      )}
                      {frame.unmatched.length > 0 && (
                        <p className="text-xs text-amber-700">
                          Нет в справочнике: {frame.unmatched.join("; ")}
                        </p>
                      )}
                      {frame.review.length > 0 && (
                        <p className="text-xs text-amber-700">
                          Проверить привязку: {frame.review.join("; ")}
                        </p>
                      )}
                      {frame.error && <p className="text-xs text-red-700">{frame.error}</p>}
                    </li>
                  ))}
                </ul>
              </details>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
