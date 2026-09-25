"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState, useTransition } from "react";

import {
  deleteProductAction,
  generateSkuAction,
  getUsdRateAction,
  saveProductAction,
} from "@/app/admin/actions";
import { FaqTool, RewriteTool, type AiSettings } from "@/components/admin/AiTools";
import { ImportFromUrl, type ImportTarget } from "@/components/admin/ImportFromUrl";
import { CarFitmentEditor } from "@/components/admin/CarFitmentEditor";
import { CategoryPicker, type CategoryChoice } from "@/components/admin/CategoryPicker";
import { cleanFaq, FaqEditor } from "@/components/admin/FaqEditor";
import { ImagePicker, UploadTrackerContext } from "@/components/admin/ImagePicker";
import { OptionGroupsEditor } from "@/components/admin/OptionGroupsEditor";
import { VideoPicker } from "@/components/admin/VideoPicker";
import {
  Field,
  NumberInput,
  Problems,
  Section,
  SlugField,
  Suggest,
} from "@/components/admin/form-parts";
import { SpinnerIcon, TrashIcon } from "@/components/icons";
import type { ProductCar } from "@/lib/car-types";
import { formatPrice, pluralize } from "@/lib/format";
import type { UsdRate } from "@/lib/rates";
import type { Product, Spec } from "@/lib/schema";
import { DESCRIPTION_LIMIT, productSnippet, TITLE_LIMIT } from "@/lib/snippet";
import { toSlug } from "@/lib/slug.mjs";
import { stockedByQty } from "@/lib/variant";

/**
 * Карточка товара.
 *
 * Форма отправляет не FormData, а готовый объект товара: внутри опции с
 * вложенными значениями, у каждого своя цена и своя галерея. Разложить такое
 * по плоским полям формы и собрать обратно можно, но это ровно тот код, в
 * котором заводятся ошибки вида «пропала галерея у второго цоколя».
 *
 * Проверяет объект всё равно zod на сервере (src/lib/store.ts) — здесь только
 * подсказки, чтобы не отправлять заведомо неполное.
 */

interface ProductFormProps {
  /** Существующий товар или заготовка нового. */
  product: Product;
  /** Список уже в порядке дерева: родитель, следом его подразделы. */
  categories: Array<CategoryChoice & { carFitment: boolean }>;
  /** Бренды, которые уже есть в каталоге — для подсказки в поле бренда. */
  brands: string[];
  /**
   * Машины, к которым товар уже привязан. Живут отдельной таблицей, а не
   * полем товара: связь многие-ко-многим, и по ней строятся страницы
   * подбора.
   */
  cars: ProductCar[];
  /** Пусто при создании: у нового товара ещё нет прежнего кода. */
  previousId?: string;
  /** Готовые ссылки на миниатюры уже выбранных фото. */
  thumbs: Record<string, string>;
  currencySymbol: string;
  usdRate?: UsdRate | null;
  savedCostPrice?: number | null;
  copiedFrom?: string;
  ai: AiSettings;
}

const UNITS = ["комплект", "шт."];

export function ProductForm({
  product: initial,
  categories,
  brands,
  cars: initialCars,
  previousId,
  thumbs,
  currencySymbol,
  usdRate = null,
  savedCostPrice = null,
  copiedFrom,
  ai,
}: ProductFormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState<Product>(initial);
  const [importedThumbs, setImportedThumbs] = useState<Record<string, string>>({});
  const [cars, setCars] = useState<ProductCar[]>(initialCars);
  const [problems, setProblems] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [skuPending, setSkuPending] = useState(false);
  const [uploads, setUploads] = useState(0);
  const trackUpload = useCallback(
    (delta: number) => setUploads((count) => count + delta),
    [],
  );

  const creating = !previousId;

  const patch = (changes: Partial<Product>) => {
    setDraft((current) => ({ ...current, ...changes }));
    setSaved(false);
  };

  /**
   * Папка для новых фото: по разделу и коду товара. Так в public/img
   * складывается понятная структура, а не свалка из тысячи файлов.
   */
  const folder = `${draft.categoryId || "misc"}/${draft.id || "new"}`;

  const category = categories.find((entry) => entry.id === draft.categoryId);
  const carFitment = category?.carFitment ?? false;
  const categoryName = category?.name ?? draft.categoryId;
  const snippet = productSnippet({
    product: draft,
    categoryName: category?.name,
    currencySymbol,
  });

  const titleIsAuto =
    draft.seoTitle === undefined || draft.seoTitle.trim() === snippet.generatedTitle;
  const descriptionIsAuto =
    draft.seoDescription === undefined ||
    draft.seoDescription.trim() === snippet.generatedDescription;

  const aiProduct = {
    title: draft.title,
    description: draft.description ?? "",
    categoryName: category?.name,
    brand: draft.brand,
    specs: draft.specs,
    options: draft.optionGroups.map(
      (group) => `${group.name}: ${group.values.map((value) => value.label).join(", ")}`,
    ),
    faq: draft.faq ?? [],
  };

  const titleChanges = (title: string): Partial<Product> =>
    creating ? { title, slug: toSlug(title), id: toSlug(title) } : { title };

  type ImportSnapshot = Pick<
    Product,
    "title" | "slug" | "id" | "specs" | "description" | "faq" | "images"
  >;
  const importTarget: ImportTarget<ImportSnapshot> = {
    context: {
      categoryName: category?.name,
      brand: draft.brand,
      options: aiProduct.options,
      faq: aiProduct.faq,
    },
    folder,
    snapshot: () => ({
      title: draft.title,
      slug: draft.slug,
      id: draft.id,
      specs: draft.specs,
      description: draft.description,
      faq: draft.faq,
      images: draft.images,
    }),
    restore: (snapshot) => patch(snapshot),
    onTitle: (title) => patch(titleChanges(title)),
    onSpecs: (specs) => patch({ specs }),
    onDescription: (description) => patch({ description }),
    onImages: (images) => {
      setImportedThumbs((current) => ({
        ...current,
        ...Object.fromEntries(images.map((image) => [image.path, image.thumb])),
      }));
      setDraft((current) => ({
        ...current,
        images: [
          ...current.images,
          ...images.map((image) => image.path).filter((path) => !current.images.includes(path)),
        ],
      }));
      setSaved(false);
    },
    onFaq: (items) => {
      setDraft((current) => ({
        ...current,
        faq: [
          ...(current.faq ?? []).filter((item) => item.q.trim() || item.a.trim()),
          ...items,
        ],
      }));
      setSaved(false);
    },
  };

  const save = () => {
    setProblems([]);
    const payload = clean(draft);
    if (titleIsAuto) payload.seoTitle = undefined;
    if (descriptionIsAuto) payload.seoDescription = undefined;
    startTransition(async () => {
      const result = await saveProductAction(
        payload,
        previousId,
        cars.map((car) => car.generationId),
      );
      if (!result.ok) {
        setProblems(result.problems);
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      setSaved(true);
      // Наверх — там и сообщение об успехе, и начало карточки. Кнопка
      // «Сохранить» висит внизу, и без этого человек остаётся смотреть на
      // подвал формы, не понимая, сохранилось ли.
      window.scrollTo({ top: 0, behavior: "smooth" });
      if (creating) {
        router.push(`/admin/products/${draft.id}/`);
      } else {
        router.refresh();
      }
    });
  };

  /**
   * Новый артикул — с сервера: свободный номер видно только по всей базе.
   * Не в startTransition: тот же pending выключал бы кнопку «Сохранить».
   */
  const regenerateSku = async () => {
    setSkuPending(true);
    try {
      const result = await generateSkuAction();
      patch({ sku: result.sku });
    } finally {
      setSkuPending(false);
    }
  };

  const remove = () => {
    startTransition(async () => {
      const result = await deleteProductAction(draft.id);
      // Успешное удаление уводит на список и сюда не возвращается.
      if (result && !result.ok) setProblems(result.problems);
    });
  };

  return (
    <UploadTrackerContext.Provider value={trackUpload}>
    <div className="space-y-5 pb-24">
      {/* --------------------------- Шапка --------------------------- */}
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/admin/products/" className="btn-ghost py-2 text-sm">
          ← К списку
        </Link>
        <h1 className="text-xl font-semibold text-brand-900">
          {copiedFrom
            ? `Копия товара «${copiedFrom}»`
            : creating
              ? "Новый товар"
              : draft.title || "Без названия"}
        </h1>
        {!creating && (
          // Сохранённый адрес, а не из черновика: правка slug'а в форме ещё
          // ничего не создала, и ссылка вела бы на 404.
          <Link
            href={`/product/${initial.slug}/`}
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
          Сохранено. Страница на сайте уже обновилась.
        </p>
      )}

      <Section
        title="Сгенерировать по ссылке"
        note="Вставьте ссылку на товар с другого сайта: название возьмётся как есть, описание перепишется, характеристики перенесутся, вопросы-ответы составятся по новому описанию. Остальное заполните сами."
      >
        <ImportFromUrl ready={ai.ready} target={importTarget} />
      </Section>

      {/* -------------------------- Основное -------------------------- */}
      <Section title="Основное">
        <Field label="Название" required>
          <input
            value={draft.title}
            onChange={(event) => {
              // Адрес и код подставляем сами, пока товар новый и их не трогали
              // руками. У существующего товара менять их нельзя.
              patch(titleChanges(event.target.value));
            }}
            className="field"
            placeholder="Линзы Hella 3R G5 Bi-Xenon"
          />
        </Field>

        <div>
          <span className="label">
            Раздел<span className="text-red-600"> *</span>
          </span>
          <CategoryPicker
            categories={categories}
            value={draft.categoryId}
            onChange={(categoryId) => patch({ categoryId })}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Бренд"
            hint="Попадает в фильтр каталога. Начните вводить — предложим из уже заведённых"
          >
            <Suggest
              value={draft.brand ?? ""}
              onChange={(brand) => patch({ brand })}
              options={brands}
              placeholder="Hella"
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <CostField
            value={draft.costPrice ?? null}
            usd={draft.costUsd ?? null}
            onChange={(costPrice, costUsd) => patch({ costPrice, costUsd })}
            currencySymbol={currencySymbol}
            initialRate={usdRate}
            savedValue={savedCostPrice}
          />

          <div className="sm:col-span-2">
            <Margin
              price={draft.price}
              cost={draft.costPrice ?? null}
              currencySymbol={currencySymbol}
              hasOptions={draft.optionGroups.length > 0}
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field
            label={`Цена розницы, ${currencySymbol}`}
            hint="Пусто — на сайте «Цену уточняйте». Если есть опции со своими ценами — запасная"
          >
            <NumberInput
              value={draft.price > 0 ? draft.price : null}
              onChange={(price) => patch({ price: price ?? 0 })}
              placeholder="не указана"
            />
          </Field>

          <Field
            label={`Оптовая цена, ${currencySymbol}`}
            hint="Видят только подтверждённые оптовики. У вариантов опций разница с этой ценой — как в рознице"
          >
            <NumberInput
              value={draft.wholesalePrice ?? null}
              onChange={(wholesalePrice) => patch({ wholesalePrice })}
              placeholder="нет"
            />
          </Field>

          <Field label={`Старая цена, ${currencySymbol}`} hint="Покажется зачёркнутой">
            <NumberInput
              value={draft.oldPrice ?? null}
              onChange={(oldPrice) => patch({ oldPrice })}
              placeholder="нет"
            />
          </Field>

          <Field label="Единица" hint="Выводится как «цена за …»">
            <select
              value={draft.unit ?? ""}
              onChange={(event) => patch({ unit: event.target.value })}
              className="field"
            >
              <option value="">не указана</option>
              {UNITS.map((unit) => (
                <option key={unit} value={unit}>
                  {unit}
                </option>
              ))}
              {draft.unit && !UNITS.includes(draft.unit) && (
                <option value={draft.unit}>{draft.unit}</option>
              )}
            </select>
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* Кнопка стоит под полем, а не внутри Field: Field — это
              <label>, а в нём может быть только одно поле ввода, иначе
              непонятно, к чему относится подпись, и щелчок по ней попадает
              не туда. Точно так же сделано в SlugField. */}
          <div>
            <Field
              label="Артикул"
              hint="Шесть цифр, у каждого товара свои. Подставляется сам"
            >
              <input
                value={draft.sku ?? ""}
                onChange={(event) => patch({ sku: event.target.value })}
                className="field tnum"
                inputMode="numeric"
              />
            </Field>

            <button
              type="button"
              onClick={regenerateSku}
              disabled={skuPending}
              className="btn-secondary mt-2 py-1.5 text-xs"
            >
              {skuPending ? (
                <>
                  <SpinnerIcon className="h-4 w-4 animate-spin" />
                  Генерируем…
                </>
              ) : draft.sku ? (
                "Перегенерировать"
              ) : (
                "Сгенерировать"
              )}
            </button>
          </div>

          <Field
            label="Складской номер"
            hint="Где лежит на складе. Только для вас — на сайте не показывается"
          >
            <input
              value={draft.storageCode ?? ""}
              onChange={(event) => patch({ storageCode: event.target.value })}
              className="field"
              placeholder="А-12-3"
            />
          </Field>

          <Field label="Плашка на карточке" hint="«Хит», «Новинка», «Распродажа»">
            <input
              value={draft.badge ?? ""}
              onChange={(event) => patch({ badge: event.target.value })}
              className="field"
            />
          </Field>

          <Field
            label="Остаток на складе"
            hint="Виден на сайте. Больше нуля — в наличии, пусто или 0 — нет в наличии и кнопки заказа нет"
          >
            <NumberInput
              integer
              value={draft.stockQty ?? null}
              onChange={(stockQty) => patch({ stockQty, inStock: stockedByQty(stockQty) })}
              placeholder="нет в наличии"
            />
          </Field>
        </div>

        <div className="flex flex-wrap gap-5">
          <Checkbox
            checked={Boolean(draft.featured)}
            onChange={(value) => patch({ featured: value })}
            label="Показывать на главной"
            hint="Блок «Выбирают чаще всего»"
          />
        </div>
      </Section>

      {/* ------------------------ Адрес и код ------------------------ */}
      <Section
        title="Адрес страницы"
        note={
          creating
            ? "Подставляются из названия. Поправьте сейчас — потом адрес лучше не трогать."
            : "Адрес поменять можно — со старого встанет переадресация. Код (id) нельзя: он входит в ключ корзины."
        }
      >
        <div className="grid items-start gap-4 sm:grid-cols-2">
          <SlugField
            label="Адрес (slug)"
            value={draft.slug}
            fromName={toSlug(draft.title)}
            saved={creating ? undefined : initial.slug}
            preview={(slug) => `/product/${slug || "…"}/`}
            onChange={(slug) => patch({ slug: toSlug(slug) })}
          />

          <Field
            label="Код (id)"
            required
            hint={
              creating
                ? "Внутренний, покупателю не виден"
                : "Менять нельзя: код лежит в корзинах покупателей и в заказах"
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
      </Section>

      {/* --------------------------- Тексты -------------------------- */}
      <Section
        title="Описание"
        note="Пустая строка разбивает текст на абзацы. Весь текст виден поисковикам и участвует в поиске по сайту, а первый абзац вдобавок идёт в описание страницы для выдачи — начните с одной-двух фраз о главном."
      >
        <Field label="Описание">
          <textarea
            value={draft.description ?? ""}
            onChange={(event) => patch({ description: event.target.value })}
            rows={10}
            className="field resize-y"
          />
        </Field>

        <RewriteTool
          settings={ai}
          product={aiProduct}
          onRewrite={(description) => patch({ description })}
        />
      </Section>

      {/* ---------------------------- Фото --------------------------- */}
      <Section
        title="Фото и видео"
        note="Первая — главная: она стоит на карточке в каталоге. Если у опции есть свои фото, на странице товара покажутся они."
      >
        <ImagePicker
          value={draft.images}
          onChange={(images) => patch({ images })}
          folder={folder}
          thumbs={{ ...thumbs, ...importedThumbs }}
          label="Общая галерея"
        />

        <VideoPicker
          value={draft.videos ?? []}
          onChange={(videos) => patch({ videos })}
          folder={folder}
        />
      </Section>

      {/* ---------------------- Характеристики ----------------------- */}
      <Section title="Характеристики" note="Таблица на странице товара.">
        <SpecsEditor
          value={draft.specs}
          onChange={(specs) => patch({ specs })}
        />
      </Section>

      {/* ---------------------------- Опции -------------------------- */}
      <Section
        title="Опции"
        note="Цоколь, цветовая температура, сторона. У каждого значения может быть своя цена, свой артикул, своё наличие и своя галерея."
      >
        <OptionGroupsEditor
          value={draft.optionGroups}
          onChange={(optionGroups) => patch({ optionGroups })}
          folder={folder}
          thumbs={thumbs}
          currencySymbol={currencySymbol}
          basePrice={draft.price}
        />
      </Section>

      {/* ------------------------ Автомобили ------------------------- */}
      {carFitment ? (
        <Section
          title="Подходит к автомобилям"
          note="Товар появится на страницах подбора этих машин, а на его странице встанут ссылки на них. Необязательно: без привязок товар живёт в каталоге как обычно."
        >
          <CarFitmentEditor
            value={cars}
            onChange={(next) => {
              setCars(next);
              setSaved(false);
            }}
          />
        </Section>
      ) : (
        cars.length > 0 && (
          <Section title="Подходит к автомобилям">
            <p className="text-sm text-brand-500">
              Раздел «{categoryName}» не подбирается по автомобилю. Машины у
              этого товара сохранены —{" "}
              {pluralize(cars.length, "привязка", "привязки", "привязок")}, — но
              на витрине их нет и править их здесь нельзя. Включите у раздела
              подбор по автомобилю, и они вернутся.
            </p>
          </Section>
        )
      )}

      {/* ------------------------ Вопросы-ответы --------------------- */}
      <Section
        title="Вопросы и ответы"
        note="Не для всех товаров, а для тех, про которые реально спрашивают. Вопрос — словами клиента, ответ — первой фразой по делу. Блок показывается на странице товара и уходит в разметку для поисковиков."
      >
        <FaqEditor
          value={draft.faq ?? []}
          onChange={(faq) => patch({ faq })}
        />

        <FaqTool
          settings={ai}
          product={aiProduct}
          onGenerate={(items) =>
            patch({
              faq: [
                ...(draft.faq ?? []).filter((item) => item.q.trim() || item.a.trim()),
                ...items,
              ],
            })
          }
        />
      </Section>

      {/* --------------------------- Поиск --------------------------- */}
      <Section
        title="Поиск и SEO"
        note="Пока текст не правили руками, он собирается сам из названия, цены и описания и обновляется вместе с ними. Если заголовок с ценой длиннее лимита, цена убирается."
      >
        <div>
          <Field
            label="Заголовок для поиска"
            hint={`${snippet.title.length} / ${TITLE_LIMIT}${titleIsAuto ? " · собран автоматически" : ""}`}
          >
            <input
              value={titleIsAuto ? snippet.generatedTitle : (draft.seoTitle ?? "")}
              onChange={(event) => patch({ seoTitle: event.target.value })}
              className="field"
            />
          </Field>
          {!titleIsAuto && (
            <button
              type="button"
              onClick={() => patch({ seoTitle: undefined })}
              className="btn-ghost mt-1 py-1 text-xs"
            >
              Вернуть автоматический
            </button>
          )}
        </div>

        <div>
          <Field
            label="Описание для поиска"
            hint={`${snippet.description.length} / ${DESCRIPTION_LIMIT}${descriptionIsAuto ? " · собрано автоматически" : ""}`}
          >
            <textarea
              value={
                descriptionIsAuto ? snippet.generatedDescription : (draft.seoDescription ?? "")
              }
              onChange={(event) => patch({ seoDescription: event.target.value })}
              rows={3}
              className="field resize-y"
            />
          </Field>
          {!descriptionIsAuto && (
            <button
              type="button"
              onClick={() => patch({ seoDescription: undefined })}
              className="btn-ghost mt-1 py-1 text-xs"
            >
              Вернуть автоматическое
            </button>
          )}
        </div>

        <div className="rounded-xl border border-brand-100 bg-brand-50/60 p-4">
          <p className="mb-2 text-xs font-medium text-brand-400">
            Так страница может выглядеть в выдаче
            {titleIsAuto && descriptionIsAuto ? " — собрано автоматически" : ""}
          </p>
          <p className="text-xs text-brand-500">
            /product/{draft.slug || "…"}/
          </p>
          <p
            className={`mt-0.5 text-base leading-snug ${
              snippet.title.length > TITLE_LIMIT ? "text-red-700" : "text-[#1a0dab]"
            }`}
          >
            {snippet.title}
          </p>
          <p
            className={`mt-1 text-sm ${
              snippet.description.length > DESCRIPTION_LIMIT
                ? "text-red-700"
                : "text-brand-600"
            }`}
          >
            {snippet.description}
          </p>
          {(snippet.title.length > TITLE_LIMIT ||
            snippet.description.length > DESCRIPTION_LIMIT) && (
            <p className="mt-2 text-xs text-red-700">
              Красным — длиннее, чем покажет поисковик: хвост обрежется.
            </p>
          )}
        </div>
      </Section>

      {/* ------------------------ Панель снизу ----------------------- */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-brand-100 bg-white/95 backdrop-blur">
        <div className="container-page flex items-center gap-3 py-3">
          {!creating && (
            <>
              {confirmDelete ? (
                <>
                  <button
                    type="button"
                    onClick={remove}
                    disabled={pending}
                    className="btn-primary bg-red-700 py-2 text-sm hover:bg-red-800"
                  >
                    Да, удалить навсегда
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
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="btn-ghost py-2 text-sm text-red-700 hover:bg-red-50"
                >
                  <TrashIcon className="h-4 w-4" />
                  Удалить
                </button>
              )}
            </>
          )}

          <button
            type="button"
            onClick={save}
            disabled={pending || uploads > 0}
            className="btn-primary ml-auto py-2 text-sm"
          >
            {uploads > 0 ? (
              <>
                <SpinnerIcon className="h-4 w-4 animate-spin" />
                Загружаются фото…
              </>
            ) : pending ? (
              <>
                <SpinnerIcon className="h-4 w-4 animate-spin" />
                Сохраняем…
              </>
            ) : creating ? (
              "Создать товар"
            ) : (
              "Сохранить"
            )}
          </button>
        </div>
      </div>
    </div>
    </UploadTrackerContext.Provider>
  );
}

function CostField({
  value,
  usd,
  onChange,
  currencySymbol,
  initialRate,
  savedValue,
}: {
  value: number | null;
  usd: number | null;
  onChange: (value: number | null, usd: number | null) => void;
  currencySymbol: string;
  initialRate: UsdRate | null;
  savedValue: number | null;
}) {
  const [inUsd, setInUsd] = useState(usd !== null);
  const [rate, setRate] = useState<UsdRate | null>(initialRate);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  const convert = (amount: number | null, by: UsdRate) =>
    amount === null ? null : Math.round(amount * by.rate * 100) / 100;

  const switchToUsd = async () => {
    setInUsd(true);
    setFailed(false);
    let current = rate;
    if (!current) {
      setLoading(true);
      current = await getUsdRateAction().catch(() => null);
      setLoading(false);
      if (!current) {
        setFailed(true);
        return;
      }
      setRate(current);
    }
    if (usd === null && value !== null) {
      onChange(value, Math.round((value / current.rate) * 100) / 100);
    }
  };

  const switchToByn = () => {
    setInUsd(false);
    onChange(value, null);
  };

  const rateDate = rate?.date.split("-").reverse().join(".");
  const changed =
    inUsd && savedValue !== null && value !== null && Math.abs(savedValue - value) >= 0.01;

  let note = "Только для вас — на сайте не показывается";
  if (inUsd && rate) {
    note = `= ${value === null ? "—" : formatPrice(value, currencySymbol)} по курсу НБРБ ${rate.rate.toFixed(4)} на ${rateDate}`;
    if (changed && savedValue !== null) {
      note += `. При прошлом сохранении было ${formatPrice(savedValue, currencySymbol)}`;
    }
  } else if (inUsd && failed) {
    note = usd !== null
      ? `Не удалось получить курс НБРБ — показана сумма на момент сохранения. Источник: $${usd}`
      : "Не удалось получить курс НБРБ — введите сумму в рублях";
  } else if (inUsd && loading) {
    note = "Загружаем курс НБРБ…";
  }

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="label mb-0">Себестоимость</span>
        <span className="flex overflow-hidden rounded-lg border border-brand-200 text-xs font-medium">
          <button
            type="button"
            onClick={switchToByn}
            className={`px-2 py-0.5 ${inUsd ? "text-brand-500" : "bg-brand-700 text-white"}`}
          >
            {currencySymbol}
          </button>
          <button
            type="button"
            onClick={switchToUsd}
            className={`px-2 py-0.5 ${inUsd ? "bg-brand-700 text-white" : "text-brand-500"}`}
          >
            $
          </button>
        </span>
      </div>

      {inUsd && rate ? (
        <NumberInput
          value={usd}
          onChange={(amount) => onChange(convert(amount, rate), amount)}
          placeholder="сумма в $"
        />
      ) : (
        <NumberInput
          value={value}
          onChange={(amount) => onChange(amount, null)}
          placeholder="не задана"
        />
      )}

      <span className={`mt-1 block text-xs ${changed ? "text-amber-700" : "text-brand-400"}`}>
        {note}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Характеристики                                                      */
/* ------------------------------------------------------------------ */

function SpecsEditor({
  value,
  onChange,
}: {
  value: Spec[];
  onChange: (value: Spec[]) => void;
}) {
  const update = (index: number, patch: Partial<Spec>) =>
    onChange(value.map((spec, i) => (i === index ? { ...spec, ...patch } : spec)));

  return (
    <div className="space-y-2">
      {value.map((spec, index) => (
        <div key={index} className="flex gap-2">
          <input
            value={spec.name}
            onChange={(event) => update(index, { name: event.target.value })}
            placeholder="Мощность"
            className="field w-1/3 py-2 text-sm"
          />
          <input
            value={spec.value}
            onChange={(event) => update(index, { value: event.target.value })}
            placeholder="55 Вт"
            className="field flex-1 py-2 text-sm"
          />
          <button
            type="button"
            onClick={() => onChange(value.filter((_, i) => i !== index))}
            title="Убрать строку"
            className="btn-ghost px-2 py-2 text-red-700"
          >
            <TrashIcon className="h-4 w-4" />
          </button>
        </div>
      ))}

      <button
        type="button"
        onClick={() => onChange([...value, { name: "", value: "" }])}
        className="btn-secondary py-2 text-sm"
      >
        + Строка характеристики
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function formatPercent(value: number): string {
  return `${value.toFixed(1).replace(".", ",")}%`;
}

function Margin({
  price,
  cost,
  currencySymbol,
  hasOptions,
}: {
  price: number;
  cost: number | null;
  currencySymbol: string;
  hasOptions: boolean;
}) {
  if (cost === null || price <= 0) {
    return (
      <p className="flex h-full items-center text-xs text-brand-400">
        Заполните себестоимость и цену — рядом посчитается прибыль и маржа.
      </p>
    );
  }

  const profit = price - cost;
  const margin = price > 0 ? (profit / price) * 100 : 0;
  const markup = cost > 0 ? (profit / cost) * 100 : null;
  const good = profit > 0;

  return (
    <div
      className={`flex h-full flex-col justify-center rounded-xl border px-4 py-3 ${
        good
          ? "border-green-200 bg-green-50 text-green-900"
          : "border-red-200 bg-red-50 text-red-900"
      }`}
    >
      <p className="text-sm font-semibold">
        {good ? "Прибыль" : "Убыток"} {formatPrice(Math.abs(profit), currencySymbol)}
        <span className="ml-2 font-normal opacity-80">
          маржа {formatPercent(margin)}
          {markup !== null && ` · наценка ${formatPercent(markup)}`}
        </span>
      </p>
      <p className="mt-1 text-xs opacity-70">
        {hasOptions
          ? "Считается от базовой цены. У опций свои цены — там маржа другая."
          : "Разница между ценой продажи и себестоимостью."}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Checkbox({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 h-4 w-4 rounded border-brand-200 text-brand-700 focus:ring-brand-600"
      />
      <span>
        <span className="block text-sm font-medium text-brand-900">{label}</span>
        {hint && <span className="block text-xs text-brand-400">{hint}</span>}
      </span>
    </label>
  );
}

/* ------------------------------------------------------------------ */

/**
 * Убирает пустые необязательные поля перед отправкой.
 *
 * Схема у нас строгая: пустая строка в seoTitle — это не «не заполнено», а
 * заполненное пустотой, и на странице появился бы пустой тег. Заодно
 * выбрасываем недописанные строки характеристик.
 */
function clean(product: Product): Product {
  const trimmed = (value: string | undefined | null) => {
    const text = (value ?? "").trim();
    return text.length ? text : undefined;
  };

  return {
    ...product,
    title: product.title.trim(),
    brand: trimmed(product.brand),
    unit: trimmed(product.unit),
    sku: trimmed(product.sku),
    badge: trimmed(product.badge),
    description: trimmed(product.description),
    seoTitle: trimmed(product.seoTitle),
    seoDescription: trimmed(product.seoDescription),
    oldPrice: product.oldPrice ? product.oldPrice : null,
    // null и undefined схема принимает одинаково, но в JSON товара лишний
    // ключ со значением null оставлять незачем.
    stockQty: product.stockQty ?? undefined,
    costPrice: product.costPrice ?? undefined,
    costUsd: product.costUsd ?? undefined,
    storageCode: trimmed(product.storageCode),
    featured: product.featured ? true : undefined,
    videos: product.videos?.length ? product.videos : undefined,
    specs: product.specs.filter((spec) => spec.name.trim() && spec.value.trim()),
    faq: cleanFaq(product.faq),
  };
}
