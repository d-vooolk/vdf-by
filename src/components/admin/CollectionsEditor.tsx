"use client";

import { TrashIcon } from "@/components/icons";
import type { CategoryCollection } from "@/lib/schema";
import { toSlug } from "@/lib/slug.mjs";

interface CollectionsEditorProps {
  value: CategoryCollection[];
  onChange: (value: CategoryCollection[]) => void;
  baseUrl: string;
}

export function CollectionsEditor({ value, onChange, baseUrl }: CollectionsEditorProps) {
  const update = (index: number, patch: Partial<CategoryCollection>) =>
    onChange(value.map((item, i) => (i === index ? { ...item, ...patch } : item)));

  return (
    <div className="space-y-4">
      {value.length === 0 && (
        <p className="rounded-xl bg-brand-50 px-4 py-3 text-sm text-brand-500">
          Подборок нет. Подборка — отдельная страница раздела с товарами, отобранными по словам: размер, бренд,
          напряжение.
        </p>
      )}

      {value.map((item, index) => (
        <div key={index} className="space-y-3 rounded-card border border-brand-100 p-4">
          <div className="flex flex-wrap items-end gap-3">
            <label className="min-w-56 flex-1">
              <span className="label">Заголовок страницы (H1)</span>
              <input
                value={item.name}
                onChange={(event) => {
                  const name = event.target.value;
                  update(index, { name, ...(!item.slug || item.slug === toSlug(item.name) ? { slug: toSlug(name) } : {}) });
                }}
                placeholder="Би-LED линзы 3.0″"
                className="field py-2 text-sm"
              />
            </label>
            <label className="w-40">
              <span className="label">Подпись на кнопке</span>
              <input
                value={item.label ?? ""}
                onChange={(event) => update(index, { label: event.target.value })}
                placeholder="3.0″"
                className="field py-2 text-sm"
              />
            </label>
            <label className="w-44">
              <span className="label">Адрес</span>
              <input
                value={item.slug}
                onChange={(event) => update(index, { slug: toSlug(event.target.value) })}
                className="field py-2 font-mono text-xs"
              />
            </label>
            <button
              type="button"
              onClick={() => onChange(value.filter((_, i) => i !== index))}
              title="Удалить подборку"
              className="btn-ghost px-2 py-2 text-red-700"
            >
              <TrashIcon className="h-4 w-4" />
            </button>
          </div>
          <p className="font-mono text-xs text-brand-400">
            {baseUrl}
            {item.slug || "…"}/
          </p>
          <label className="block">
            <span className="label">Слова для отбора — через запятую</span>
            <input
              value={item.match.join(", ")}
              onChange={(event) => update(index, { match: event.target.value.split(",").map((word) => word.trim()) })}
              placeholder="3.0, 3″"
              className="field py-2 text-sm"
            />
            <span className="mt-1 block text-xs text-brand-400">
              Товар попадает в подборку, если хоть одно слово есть в его названии, бренде или характеристиках
            </span>
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="label">Заголовок для поиска</span>
              <input
                value={item.seoTitle ?? ""}
                onChange={(event) => update(index, { seoTitle: event.target.value })}
                className="field py-2 text-sm"
              />
            </label>
            <label className="block">
              <span className="label">Описание для поиска</span>
              <input
                value={item.seoDescription ?? ""}
                onChange={(event) => update(index, { seoDescription: event.target.value })}
                className="field py-2 text-sm"
              />
            </label>
          </div>
          <label className="block">
            <span className="label">Первый абзац</span>
            <textarea
              value={item.excerpt ?? ""}
              onChange={(event) => update(index, { excerpt: event.target.value })}
              rows={2}
              className="field resize-y text-sm"
            />
          </label>
          <label className="block">
            <span className="label">Текст под товарами — абзацы через пустую строку</span>
            <textarea
              value={item.description ?? ""}
              onChange={(event) => update(index, { description: event.target.value })}
              rows={5}
              className="field resize-y text-sm"
            />
          </label>
        </div>
      ))}

      <button
        type="button"
        onClick={() => onChange([...value, { slug: "", name: "", match: [] }])}
        className="btn-secondary py-2 text-sm"
      >
        + Подборка
      </button>
    </div>
  );
}

export function cleanCollections(value: CategoryCollection[] | undefined): CategoryCollection[] | undefined {
  const text = (input: string | undefined) => {
    const trimmed = (input ?? "").trim();
    return trimmed.length ? trimmed : undefined;
  };
  const cleaned = (value ?? [])
    .map((item) => ({
      slug: item.slug.trim(),
      name: item.name.trim(),
      label: text(item.label),
      match: item.match.map((word) => word.trim()).filter(Boolean),
      excerpt: text(item.excerpt),
      description: text(item.description),
      seoTitle: text(item.seoTitle),
      seoDescription: text(item.seoDescription),
    }))
    .filter((item) => item.name || item.slug || item.match.length);
  return cleaned.length ? cleaned : undefined;
}
