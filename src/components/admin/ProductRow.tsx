"use client";

import Link from "next/link";
import { Fragment, useState, useTransition } from "react";

import { saveProductRowAction, type ProductRowChanges } from "@/app/admin/product-actions";
import { PrintLabelButton } from "@/components/admin/PrintLabelButton";
import { CheckIcon } from "@/components/icons";
import type { ProductsView } from "@/lib/admin-prefs";
import { FOREIGN_CURRENCIES, type MoneySource } from "@/lib/currency";
import { type ProductBrief } from "@/lib/product-store";
import type { SideStock } from "@/lib/variant";

/**
 * Строка списка товаров.
 *
 * Правится прямо здесь — цена и складской остаток. Это два числа, которые
 * меняются чаще всего и по одной причине: пришла поставка или сменился
 * прайс поставщика. Открывать ради них карточку, листать её до нужного
 * поля и жать «Сохранить» — четыре лишних действия на каждую позицию, а
 * позиций за раз правят десяток.
 */

type RowField = Exclude<keyof ProductRowChanges, "sideStock">;
type Side = keyof SideStock;

const SIDES: Side[] = ["right", "left"];

const SIDE_LABELS: Record<Side, string> = {
  right: "П",
  left: "Л",
};

const VIEW_FIELDS: Record<ProductsView, RowField[]> = {
  standard: ["stockQty"],
  wholesale: ["costPrice", "price", "wholesalePrice", "stockQty"],
  warehouse: ["storageCode", "stockQty"],
};

const FIELD_LABELS: Record<RowField, string> = {
  costPrice: "себест.",
  price: "розница",
  wholesalePrice: "опт",
  storageCode: "склад. №",
  stockQty: "кол-во",
};

interface ProductRowProps {
  product: ProductBrief;
  categoryName: string;
  thumb: string | null;
  selected: boolean;
  onSelect: (id: string, selected: boolean) => void;
  view: ProductsView;
  currencySymbol: string;
  frameLocked: boolean;
}

function storedValue(product: ProductBrief, field: RowField): string {
  if (field === "storageCode") return product.storageCode;
  const value = field === "price" ? (product.price > 0 ? product.price : null) : product[field];
  return value === null ? "" : String(value);
}

function parseField(field: RowField, text: string): number | string | null | undefined {
  const trimmed = text.trim();
  if (field === "storageCode") return trimmed || null;
  if (trimmed === "") return null;
  const value = Number(trimmed.replace(",", "."));
  if (!Number.isFinite(value) || value < 0) return undefined;
  if (field === "stockQty" && !Number.isInteger(value)) return undefined;
  return value;
}

function linkedNote(source: MoneySource | null): string {
  return source
    ? ` Сейчас по курсу из ${source.amount} ${FOREIGN_CURRENCIES[source.currency]} — правка здесь отвяжет от курса.`
    : "";
}

export function ProductRow({
  product,
  categoryName,
  thumb,
  selected,
  onSelect,
  view,
  currencySymbol,
  frameLocked,
}: ProductRowProps) {
  const fields = VIEW_FIELDS[view];
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  /**
   * Значение держится строкой. Числом его хранить нельзя: поле с number 0
   * показывает «0», и набранная поверх сотня превращается в «0100».
   */
  const [texts, setTexts] = useState<Partial<Record<RowField, string>>>({});
  const [sideTexts, setSideTexts] = useState<Partial<Record<Side, string>>>({});

  // Значение могло приехать новым с сервера — например, страница
  // перерисовалась после удаления соседних позиций. Правим состояние прямо
  // в рендере, а не в эффекте: эффект сделал бы это вторым проходом, и
  // между ними поле успело бы моргнуть старым числом.
  const [known, setKnown] = useState(product);
  if (product !== known) {
    setKnown(product);
    setTexts({});
    setSideTexts({});
  }

  const textOf = (field: RowField) => texts[field] ?? storedValue(product, field);
  const sideStock = fields.includes("stockQty") ? product.sideStock : null;
  const sideTextOf = (side: Side) => sideTexts[side] ?? String(sideStock?.[side] ?? 0);

  const disabledReason = (field: RowField): string => {
    if (field === "stockQty") {
      if (sideStock) return "Количество по сторонам";
      return product.optionStock ? "Количество считается по опциям — правится в карточке товара" : "";
    }
    return frameLocked ? "Задаётся в типе рамки" : "";
  };

  const titleOf = (field: RowField): string => {
    const disabled = disabledReason(field);
    if (disabled) return disabled;
    switch (field) {
      case "costPrice":
        return `Себестоимость — только для вас.${linkedNote(product.costSource)}`;
      case "price":
        return `Цена розницы. Пусто — «Цену уточняйте».${linkedNote(product.priceSource)}`;
      case "wholesalePrice":
        return `Оптовая цена — видят подтверждённые оптовики.${linkedNote(product.wholesaleSource)}`;
      case "storageCode":
        return "Складской номер — где товар лежит. Входит в артикул";
      case "stockQty":
        return "Остаток на складе — виден на сайте, 0 или пусто — нет в наличии";
    }
  };

  const editable = fields.filter((field) => !disabledReason(field));
  const parsed = editable.map((field) => ({ field, value: parseField(field, textOf(field)) }));
  const invalid = parsed.filter(({ value }) => value === undefined).map(({ field }) => field);
  const changes: ProductRowChanges = {};
  for (const { field, value } of parsed) {
    if (value === undefined) continue;
    if (parseField(field, storedValue(product, field)) === value) continue;
    Object.assign(changes, { [field]: value });
  }
  const parsedSides = sideStock
    ? SIDES.map((side) => ({ side, value: parseField("stockQty", sideTextOf(side)) }))
    : [];
  const invalidSides = parsedSides.filter(({ value }) => value === undefined).map(({ side }) => side);
  if (sideStock && !invalidSides.length) {
    const next = Object.fromEntries(
      parsedSides.map(({ side, value }) => [side, typeof value === "number" ? value : 0]),
    ) as unknown as SideStock;
    if (next.right !== sideStock.right || next.left !== sideStock.left) changes.sideStock = next;
  }
  const changed = Object.keys(changes).length > 0;
  const invalidLabels = [
    ...invalid.map((field) => FIELD_LABELS[field]),
    ...invalidSides.map((side) => SIDE_LABELS[side]),
  ];

  const commit = () => {
    if (invalidLabels.length) {
      setError(`Проверьте поля: ${invalidLabels.join(", ")}`);
      return;
    }
    if (!changed) return;
    startTransition(async () => {
      setError("");
      const result = await saveProductRowAction(product.id, changes);
      if (!result.ok) setError(result.problems.join(" "));
    });
  };

  const reset = (field: RowField) =>
    setTexts((current) => {
      const next = { ...current };
      delete next[field];
      return next;
    });

  return (
    // flex-wrap: на телефоне поля цены и остатка не влезают в строку рядом с
    // названием и уезжают под него, а не пропадают совсем — править остатки
    // с телефона на складе удобнее, чем с ноутбука.
    <div
      className={`flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5 transition-colors sm:px-4 ${
        pending ? "opacity-60" : ""
      } ${selected ? "bg-brand-50" : ""}`}
    >
      <input
        type="checkbox"
        checked={selected}
        onChange={(event) => onSelect(product.id, event.target.checked)}
        aria-label={`Выбрать «${product.title}»`}
        className="h-4 w-4 shrink-0 rounded border-brand-300 text-brand-700 focus:ring-brand-600"
      />

      <div className="photo-bed h-12 w-12 shrink-0 overflow-hidden rounded-lg">
        {thumb ? (
          // Обычный img: это админка, размытые заглушки и srcset тут не нужны.
          <img
            src={thumb}
            alt=""
            width={48}
            height={48}
            loading="lazy"
            className="h-full w-full object-contain"
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-[10px] text-brand-300">
            нет фото
          </span>
        )}
      </div>

      <div className="min-w-[12rem] flex-1">
        <Link
          href={`/admin/products/${product.id}/`}
          prefetch={false}
          className="block truncate text-sm font-semibold text-brand-900 hover:text-brand-700"
        >
          {product.title}
        </Link>
        <p className="truncate text-xs text-brand-400">
          {categoryName}
          {product.inStock ? "" : " · нет в наличии"}
        </p>
        {error && <p className="mt-0.5 text-xs text-red-600">{error}</p>}
      </div>

      {view === "warehouse" && (
        <span
          title="Артикул"
          className="tnum shrink-0 rounded-md bg-brand-100 px-2 py-1 text-xs font-medium text-brand-600"
        >
          {product.sku || "без артикула"}
        </span>
      )}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          commit();
        }}
        className="flex shrink-0 flex-wrap items-end gap-2"
      >
        {fields.map((field) => {
          if (field === "stockQty" && sideStock) {
            const pairs = Math.min(
              ...parsedSides.map(({ side, value }) =>
                typeof value === "number" ? value : value === null ? 0 : sideStock[side],
              ),
            );
            return (
              <Fragment key={field}>
                {SIDES.map((side) => (
                  <label
                    key={side}
                    className="block"
                    title={`Остаток ${side === "right" ? "правых" : "левых"} на складе. Пары считаются сами`}
                  >
                    <span className="block text-[10px] leading-tight text-brand-400">
                      {SIDE_LABELS[side]}
                    </span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={sideTextOf(side)}
                      placeholder="0"
                      onChange={(event) =>
                        setSideTexts((current) => ({ ...current, [side]: event.target.value }))
                      }
                      onKeyDown={(event) => {
                        if (event.key === "Escape") {
                          setSideTexts((current) => {
                            const next = { ...current };
                            delete next[side];
                            return next;
                          });
                        }
                      }}
                      aria-invalid={invalidSides.includes(side) || undefined}
                      className="field tnum w-12 py-1.5 text-right text-sm aria-invalid:border-red-400"
                    />
                  </label>
                ))}
                <span
                  className="tnum self-center pt-3 text-xs text-brand-400"
                  title="Полных пар — меньшее из правых и левых"
                >
                  пар {pairs}
                </span>
              </Fragment>
            );
          }
          const disabled = Boolean(disabledReason(field));
          const text = disabled ? storedValue(product, field) : textOf(field);
          const suffix =
            field === "stockQty" ? "шт." : field === "storageCode" ? "" : currencySymbol;
          return (
            <Fragment key={field}>
              <label className="block" title={titleOf(field)}>
                <span className="block text-[10px] leading-tight text-brand-400">
                  {FIELD_LABELS[field]}
                </span>
                <span className="relative block">
                  <input
                    type="text"
                    inputMode={field === "storageCode" ? "text" : "decimal"}
                    value={text}
                    placeholder="—"
                    disabled={disabled}
                    onChange={(event) =>
                      setTexts((current) => ({
                        ...current,
                        [field]: event.target.value,
                      }))
                    }
                    onKeyDown={(event) => {
                      if (event.key === "Escape") reset(field);
                    }}
                    aria-invalid={invalid.includes(field) || undefined}
                    className={`field tnum py-1.5 text-sm disabled:bg-brand-50 disabled:text-brand-400 aria-invalid:border-red-400 ${
                      field === "storageCode" ? "w-24" : "w-24 pr-9 text-right"
                    }`}
                  />
                  {suffix && (
                    <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-xs text-brand-300">
                      {suffix}
                    </span>
                  )}
                </span>
              </label>
              {field === "storageCode" && product.storageCode && (
                <PrintLabelButton
                  target={{ productId: product.id }}
                  layout="storage"
                  className="px-2 py-1.5"
                />
              )}
            </Fragment>
          );
        })}
        <button
          type="submit"
          disabled={(!changed && !invalidLabels.length) || pending}
          title="Сохранить"
          aria-label="Сохранить изменения строки"
          className="btn-primary px-2 py-1.5 disabled:opacity-30"
        >
          <CheckIcon className="h-4 w-4" />
        </button>
      </form>

      <PrintLabelButton target={{ productId: product.id }} className="self-end px-2 py-1.5" />
    </div>
  );
}
