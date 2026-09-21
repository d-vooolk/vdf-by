"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { deleteCategoryAction, saveCategoryAction } from "@/app/admin/actions";
import { ImagePicker } from "@/components/admin/ImagePicker";
import {
  Field,
  Problems,
  Section,
  SlugField,
} from "@/components/admin/form-parts";
import { SpinnerIcon, TrashIcon } from "@/components/icons";
import { pluralize } from "@/lib/format";
import type { Category } from "@/lib/schema";
import { toSlug } from "@/lib/slug.mjs";

/** Раздел каталога: название, адрес, тексты и картинка на плитке. */

interface CategoryFormProps {
  category: Category;
  previousId?: string;
  thumbs: Record<string, string>;
  productCount: number;
  /**
   * Все разделы: из них выбирается родитель и тот, куда уедут товары при
   * удалении. count — товаров в самом разделе, children — подразделов.
   */
  categories: Array<{
    id: string;
    name: string;
    slug: string;
    parentId: string | null;
    count: number;
    children: number;
  }>;
}

export function CategoryForm({
  category: initial,
  previousId,
  thumbs,
  productCount,
  categories,
}: CategoryFormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState<Category>(initial);
  const [problems, setProblems] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const creating = !previousId;
  const others = categories.filter(
    (entry) => entry.id !== previousId && entry.children === 0,
  );
  // Родителем может стать только раздел верхнего уровня, и не сам себе.
  const possibleParents = categories.filter(
    (entry) => !entry.parentId && entry.id !== previousId,
  );
  const childCount =
    categories.find((entry) => entry.id === previousId)?.children ?? 0;
  const hasOwnChildren = childCount > 0;

  // Сколько товаров лежит прямо в выбранном родителе. Пока они там, он не
  // может обзавестись подразделами — их надо куда-то деть.
  const parentProducts =
    categories.find((entry) => entry.id === draft.parentId)?.count ?? 0;
  const [adoptProducts, setAdoptProducts] = useState(true);
  const [moveTo, setMoveTo] = useState(others[0]?.id ?? "");
  // Товары есть, а переносить некуда — раздел последний. Удалять нельзя:
  // товары остались бы в базе без раздела, то есть нигде.
  const nowhereToMove = productCount > 0 && others.length === 0;

  // У подраздела адрес вложенный: /catalog/aksessuary/maski/. Префикс нужен,
  // чтобы в форме показывался настоящий адрес, а не укороченный.
  const parentSlug = categories.find(
    (entry) => entry.id === draft.parentId,
  )?.slug;
  const parentPrefix = parentSlug ? `/catalog/${parentSlug}/` : "/catalog/";

  const carFitmentBlocker = draft.parentId
    ? "Только для разделов верхнего уровня: у подраздела страницы подбора ушли бы на пятый уровень вложенности, а такие адреса поиск почти не обходит."
    : hasOwnChildren
      ? `У раздела ${pluralize(childCount, "подраздел", "подраздела", "подразделов")} — второй сегмент адреса уже занят ими, маркой машины он быть не может.`
      : null;
  const carFitmentAllowed = carFitmentBlocker === null;
  const carFitmentExample = `/catalog/${draft.slug || "razdel"}/bmw/3-seriya/e90/`;

  const patch = (changes: Partial<Category>) => {
    setDraft((current) => ({ ...current, ...changes }));
    setSaved(false);
  };

  const save = () => {
    setProblems([]);
    startTransition(async () => {
      const result = await saveCategoryAction(
        clean(draft),
        previousId,
        adoptProducts && parentProducts > 0,
      );
      if (!result.ok) {
        setProblems(result.problems);
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      setSaved(true);
      if (creating) router.push(`/admin/categories/${draft.id}/`);
      else router.refresh();
    });
  };

  const remove = () => {
    startTransition(async () => {
      const result = await deleteCategoryAction(
        draft.id,
        productCount > 0 ? moveTo : undefined,
      );
      if (result && !result.ok) {
        setProblems(result.problems);
        setConfirmDelete(false);
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    });
  };

  return (
    <div className="space-y-5 pb-24">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/admin/categories/" className="btn-ghost py-2 text-sm">
          ← К разделам
        </Link>
        <h1 className="text-xl font-semibold text-brand-900">
          {creating ? "Новый раздел" : draft.name || "Без названия"}
        </h1>
        {!creating && (
          // Адрес берём сохранённый, а не из черновика: несохранённый slug
          // ведёт на страницу, которой ещё нет. И с префиксом родителя —
          // у подраздела адрес вложенный.
          <Link
            href={`${parentPrefix}${initial.slug}/`}
            target="_blank"
            rel="noopener"
            className="text-xs text-brand-400 hover:text-brand-800"
          >
            Открыть на сайте ↗
          </Link>
        )}
      </div>

      <Problems items={problems} />

      {saved && (
        <p className="rounded-xl border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-800">
          Сохранено.
        </p>
      )}

      <Section title="Основное">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Название" required>
            <input
              value={draft.name}
              onChange={(event) => {
                const name = event.target.value;
                patch(
                  creating
                    ? { name, slug: toSlug(name), id: toSlug(name) }
                    : { name },
                );
              }}
              className="field"
              placeholder="Линзы"
            />
          </Field>

          <Field label="Название в меню" hint="Если в меню нужно короче">
            <input
              value={draft.menuName ?? ""}
              onChange={(event) => patch({ menuName: event.target.value })}
              className="field"
            />
          </Field>
        </div>

        <Field
          label="Порядок"
          hint="Чем меньше число, тем выше раздел в меню и на главной"
        >
          <input
            type="number"
            value={draft.order ?? 999}
            onChange={(event) => patch({ order: Number(event.target.value) })}
            className="field tnum w-32"
          />
        </Field>

        <Field
          label="Родительский раздел"
          hint={
            hasOwnChildren
              ? "У раздела есть свои подразделы — вложить его никуда нельзя"
              : "Пусто — раздел верхнего уровня. Вложенность одна: подраздел подраздела не бывает."
          }
        >
          <select
            value={draft.parentId ?? ""}
            onChange={(event) =>
              patch({
                parentId: event.target.value || undefined,
                ...(event.target.value ? { carFitment: undefined } : {}),
              })
            }
            disabled={hasOwnChildren}
            className="field w-full disabled:bg-brand-50 disabled:text-brand-400 sm:w-80"
          >
            <option value="">— верхний уровень —</option>
            {possibleParents.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name}
                {entry.count > 0 ? ` (${entry.count} тов.)` : ""}
              </option>
            ))}
          </select>
        </Field>

        {parentProducts > 0 && (
          // Товары лежат только в листьях, поэтому родитель обязан
          // опустеть. Единственный способ сделать это, не выходя из формы,
          // — забрать его товары сюда.
          <label className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <input
              type="checkbox"
              checked={adoptProducts}
              onChange={(event) => setAdoptProducts(event.target.checked)}
              className="mt-0.5"
            />
            <span>
              Перенести сюда{" "}
              {pluralize(parentProducts, "товар", "товара", "товаров")} из
              раздела «
              {categories.find((entry) => entry.id === draft.parentId)?.name}».
              <span className="mt-1 block text-xs text-amber-800">
                Товары лежат только в разделах без подразделов, поэтому
                родитель должен опустеть. Без переноса сохранить не выйдет —
                разве что сначала разложить товары по другим разделам.
              </span>
            </span>
          </label>
        )}
      </Section>

      <Section
        title="Связь с автомобилями"
        note="У раздела появляются вложенные страницы подбора, а у его товаров — поле «Подходит к автомобилям»."
      >
        <label
          className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-sm ${
            carFitmentAllowed
              ? "cursor-pointer border-brand-200 hover:bg-brand-50"
              : "border-brand-100 bg-brand-50 text-brand-400"
          }`}
        >
          <input
            type="checkbox"
            checked={draft.carFitment ?? false}
            disabled={!carFitmentAllowed}
            onChange={(event) =>
              patch({ carFitment: event.target.checked || undefined })
            }
            className="mt-0.5 h-4 w-4 rounded border-brand-200 text-brand-700 focus:ring-brand-600"
          />
          <span>
            <span className="font-medium text-brand-900">
              Товары этого раздела подбираются по автомобилю
            </span>
            <span className="mt-1 block text-xs">
              {carFitmentBlocker ??
                `Появятся страницы вида ${carFitmentExample}. В карточке товара
                 откроется выбор марки, модели и поколения.`}
            </span>
          </span>
        </label>

        {draft.carFitment && (
          <p className="text-xs leading-relaxed text-brand-400">
            Привязки товаров сохраняются даже со снятой галочкой: снимете —
            машины пропадут с витрины и из формы, вернёте — встанут на место.
          </p>
        )}
      </Section>

      <Section
        title="Адрес страницы"
        note={
          creating
            ? "Подставляется из названия. Поправьте сейчас — потом адрес лучше не трогать."
            : "Адрес поменять можно — со старого встанет переадресация. Код (id) нельзя: по нему товары привязаны к разделу."
        }
      >
        <div className="grid items-start gap-4 sm:grid-cols-2">
          <SlugField
            label="Адрес (slug)"
            value={draft.slug}
            fromName={toSlug(draft.name)}
            saved={creating ? undefined : initial.slug}
            preview={(slug) => `${parentPrefix}${slug || "…"}/`}
            onChange={(slug) => patch({ slug: toSlug(slug) })}
          />

          <Field
            label="Код (id)"
            required
            hint={
              creating
                ? "По нему товары привязаны к разделу"
                : "Менять нельзя: по нему товары привязаны к разделу"
            }
          >
            <input
              value={draft.id}
              onChange={(event) => patch({ id: toSlug(event.target.value) })}
              disabled={!creating}
              className="field disabled:bg-brand-50 disabled:text-brand-400"
            />
          </Field>
        </div>

        {hasOwnChildren && !creating && draft.slug !== initial.slug && (
          <p className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">
            Slug раздела входит в адрес каждого подраздела, так что переедут и
            они — {pluralize(childCount, "подраздел", "подраздела", "подразделов")}.
            Переадресация встанет со всех старых адресов.
          </p>
        )}
      </Section>

      <Section title="Тексты">
        <Field
          label="Короткое описание"
          hint="Первый абзац текста под сеткой товаров и описание для поиска"
        >
          <textarea
            value={draft.excerpt ?? ""}
            onChange={(event) => patch({ excerpt: event.target.value })}
            rows={2}
            className="field resize-y"
          />
        </Field>

        <Field label="Текст под сеткой товаров" hint="Пустая строка разбивает на абзацы">
          <textarea
            value={draft.description ?? ""}
            onChange={(event) => patch({ description: event.target.value })}
            rows={6}
            className="field resize-y"
          />
        </Field>
      </Section>

      <Section title="Картинка раздела">
        <ImagePicker
          value={draft.image ? [draft.image] : []}
          onChange={(images) => patch({ image: images[0] })}
          folder="categories"
          thumbs={thumbs}
          max={1}
          label="Одна картинка"
          hint="Показывается на плитке каталога и на главной"
        />
      </Section>

      <Section title="Поиск и SEO">
        <Field label="Заголовок для поиска" hint="До 60 символов">
          <input
            value={draft.seoTitle ?? ""}
            onChange={(event) => patch({ seoTitle: event.target.value })}
            className="field"
          />
        </Field>

        <Field label="Описание для поиска" hint="До 165 символов">
          <textarea
            value={draft.seoDescription ?? ""}
            onChange={(event) => patch({ seoDescription: event.target.value })}
            rows={2}
            className="field resize-y"
          />
        </Field>
      </Section>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-brand-100 bg-white/95 backdrop-blur">
        <div className="container-page flex flex-wrap items-center gap-3 py-3">
          {!creating &&
            (confirmDelete ? (
              <>
                {hasOwnChildren && (
                  // Поднять подразделы наверх — единственный вариант, не
                  // теряющий товары, но адреса у них при этом меняются.
                  // Сказать об этом надо до удаления, а не после.
                  <p className="text-sm text-amber-900">
                    {pluralize(childCount, "подраздел", "подраздела", "подразделов")}{" "}
                    станут разделами верхнего уровня, их адреса укоротятся
                  </p>
                )}
                {productCount > 0 && (
                  <label className="flex items-center gap-2 text-sm text-brand-600">
                    Перенести{" "}
                    <Link
                      href={`/admin/products/?category=${draft.id}`}
                      target="_blank"
                      rel="noopener"
                      className="underline underline-offset-2 hover:text-brand-900"
                    >
                      {pluralize(productCount, "товар", "товара", "товаров")}
                    </Link>{" "}
                    в
                    <select
                      value={moveTo}
                      onChange={(event) => setMoveTo(event.target.value)}
                      className="field w-auto py-1.5 text-sm"
                    >
                      {others.map((entry) => (
                        <option key={entry.id} value={entry.id}>
                          {entry.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <button
                  type="button"
                  onClick={remove}
                  disabled={pending || (productCount > 0 && !moveTo)}
                  className="btn-primary bg-red-700 py-2 text-sm hover:bg-red-800"
                >
                  {productCount > 0
                    ? "Перенести и удалить раздел"
                    : "Да, удалить раздел"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="btn-ghost py-2 text-sm"
                >
                  Отмена
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  disabled={nowhereToMove}
                  className="btn-ghost py-2 text-sm text-red-700 hover:bg-red-50 disabled:text-brand-300 disabled:hover:bg-transparent"
                >
                  <TrashIcon className="h-4 w-4" />
                  Удалить
                </button>
                {nowhereToMove && (
                  // Причину пишем рядом с кнопкой, а не в title: событий мыши
                  // disabled-кнопка не получает, и подсказку никто не увидит —
                  // со стороны она выглядит просто сломанной.
                  <p className="text-xs text-brand-400">
                    Это единственный раздел — товары из него некуда перенести
                  </p>
                )}
              </>
            ))}

          <button
            type="button"
            onClick={save}
            disabled={pending}
            className="btn-primary ml-auto py-2 text-sm"
          >
            {pending ? (
              <>
                <SpinnerIcon className="h-4 w-4 animate-spin" />
                Сохраняем…
              </>
            ) : creating ? (
              "Создать раздел"
            ) : (
              "Сохранить"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Пустые необязательные поля выбрасываем — схема у нас строгая. */
function clean(category: Category): Category {
  const trimmed = (value: string | undefined) => {
    const text = (value ?? "").trim();
    return text.length ? text : undefined;
  };

  return {
    ...category,
    name: category.name.trim(),
    menuName: trimmed(category.menuName),
    excerpt: trimmed(category.excerpt),
    description: trimmed(category.description),
    seoTitle: trimmed(category.seoTitle),
    seoDescription: trimmed(category.seoDescription),
    image: trimmed(category.image),
  };
}
