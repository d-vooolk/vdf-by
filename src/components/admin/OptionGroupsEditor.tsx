"use client";

import { useState } from "react";

import { ImagePicker } from "@/components/admin/ImagePicker";
import { NumberInput } from "@/components/admin/form-parts";
import { ChevronDownIcon, ChevronRightIcon, TrashIcon } from "@/components/icons";
import type { OptionGroup, OptionValue } from "@/lib/schema";
import { toSlug } from "@/lib/slug.mjs";

/**
 * Редактор опций товара — цоколь H7/H11/HB4 со своими ценами и галереями.
 *
 * Это самая нестандартная часть каталога, и именно из-за неё готовая CMS тут
 * не подошла бы: у значения опции есть собственная цена, артикул, наличие и
 * набор фотографий. Правила, по которым из всего этого получается цена на
 * странице, описаны в src/lib/variant.ts — здесь они продублированы
 * подсказками, чтобы не приходилось держать их в голове.
 *
 * Значения свёрнуты по умолчанию: у товара с десятью цоколями развёрнутый
 * список занял бы три экрана.
 */

interface OptionGroupsEditorProps {
  value: OptionGroup[];
  onChange: (value: OptionGroup[]) => void;
  folder: string;
  thumbs: Record<string, string>;
  currencySymbol: string;
  basePrice: number;
}

export function OptionGroupsEditor({
  value,
  onChange,
  folder,
  thumbs,
  currencySymbol,
  basePrice,
}: OptionGroupsEditorProps) {
  const updateGroup = (index: number, patch: Partial<OptionGroup>) =>
    onChange(
      value.map((group, i) => (i === index ? { ...group, ...patch } : group)),
    );

  const moveGroup = (from: number, to: number) => {
    if (to < 0 || to >= value.length) return;
    const next = [...value];
    const [group] = next.splice(from, 1);
    next.splice(to, 0, group);
    onChange(next);
  };

  return (
    <div className="space-y-4">
      {value.length === 0 && (
        <p className="rounded-xl bg-brand-50 px-4 py-3 text-sm text-brand-500">
          Опций нет — товар продаётся в одном исполнении по цене выше.
        </p>
      )}

      {value.map((group, groupIndex) => (
        <div key={groupIndex} className="rounded-card border border-brand-100">
          <div className="flex flex-wrap items-end gap-3 border-b border-brand-100 bg-brand-50 p-3">
            <label className="min-w-0 flex-1">
              <span className="label mb-1 text-xs">Название набора</span>
              <input
                value={group.name}
                onChange={(event) => {
                  const name = event.target.value;
                  updateGroup(groupIndex, {
                    name,
                    // Код набора нужен для ключа корзины. Пока значений нет,
                    // подставляем его сами; дальше трогать опасно.
                    ...(group.values.length === 0 ? { id: toSlug(name) } : {}),
                  });
                }}
                placeholder="Цоколь"
                className="field py-2 text-sm"
              />
            </label>

            <label className="min-w-0 flex-1">
              <span className="label mb-1 text-xs">Подсказка покупателю</span>
              <input
                value={group.hint ?? ""}
                onChange={(event) =>
                  updateGroup(groupIndex, { hint: event.target.value })
                }
                placeholder="Цоколь указан на старой лампе"
                className="field py-2 text-sm"
              />
            </label>

            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => moveGroup(groupIndex, groupIndex - 1)}
                disabled={groupIndex === 0}
                title="Выше"
                className="btn-ghost px-2 py-2 text-xs disabled:opacity-30"
              >
                ↑
              </button>
              <button
                type="button"
                onClick={() => moveGroup(groupIndex, groupIndex + 1)}
                disabled={groupIndex === value.length - 1}
                title="Ниже"
                className="btn-ghost px-2 py-2 text-xs disabled:opacity-30"
              >
                ↓
              </button>
              <button
                type="button"
                onClick={() =>
                  onChange(value.filter((_, i) => i !== groupIndex))
                }
                title="Удалить набор целиком"
                className="btn-ghost px-2 py-2 text-red-700"
              >
                <TrashIcon className="h-4 w-4" />
              </button>
            </div>
          </div>

          {groupIndex === 0 ? (
            <p className="border-b border-brand-100 px-3 py-2 text-xs text-brand-400">
              Первый набор задаёт цену: у его значений указывайте цену целиком.
            </p>
          ) : (
            <p className="border-b border-brand-100 px-3 py-2 text-xs text-brand-400">
              Во втором и следующих наборах указывайте надбавку — она
              прибавляется к цене из первого набора.
            </p>
          )}

          <ValuesEditor
            values={group.values}
            onChange={(values) => updateGroup(groupIndex, { values })}
            folder={`${folder}/${group.id || "option"}`}
            thumbs={thumbs}
            currencySymbol={currencySymbol}
            basePrice={basePrice}
            isFirstGroup={groupIndex === 0}
          />
        </div>
      ))}

      <button
        type="button"
        onClick={() =>
          onChange([
            ...value,
            {
              id: value.length === 0 ? "socket" : `option-${value.length + 1}`,
              name: "",
              values: [],
            },
          ])
        }
        className="btn-secondary py-2 text-sm"
      >
        + Набор опций
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Значения одного набора                                              */
/* ------------------------------------------------------------------ */

interface ValuesEditorProps {
  values: OptionValue[];
  onChange: (values: OptionValue[]) => void;
  folder: string;
  thumbs: Record<string, string>;
  currencySymbol: string;
  basePrice: number;
  isFirstGroup: boolean;
}

function ValuesEditor({
  values,
  onChange,
  folder,
  thumbs,
  currencySymbol,
  basePrice,
  isFirstGroup,
}: ValuesEditorProps) {
  const [expanded, setExpanded] = useState<number | null>(null);

  const update = (index: number, patch: Partial<OptionValue>) =>
    onChange(
      values.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    );

  const move = (from: number, to: number) => {
    if (to < 0 || to >= values.length) return;
    const next = [...values];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onChange(next);
    setExpanded(null);
  };

  return (
    <div className="divide-y divide-brand-100">
      {values.map((item, index) => {
        const open = expanded === index;
        const price =
          item.price ?? (isFirstGroup ? basePrice : undefined);

        return (
          <div key={index}>
            {/* --------------------- Свёрнутая строка -------------------- */}
            <div className="flex flex-wrap items-center gap-2 p-3">
              <button
                type="button"
                onClick={() => setExpanded(open ? null : index)}
                aria-expanded={open}
                className="btn-ghost px-1.5 py-1.5"
                title={open ? "Свернуть" : "Развернуть"}
              >
                {open ? (
                  <ChevronDownIcon className="h-4 w-4" />
                ) : (
                  <ChevronRightIcon className="h-4 w-4" />
                )}
              </button>

              <input
                value={item.label}
                onChange={(event) => {
                  const label = event.target.value;
                  update(index, {
                    label,
                    // Код значения входит в ключ корзины. Подставляем его,
                    // пока значение новое и код с ним совпадает.
                    ...(!item.id || item.id === toSlug(item.label)
                      ? { id: toSlug(label) }
                      : {}),
                  });
                }}
                placeholder="H7"
                className="field w-28 py-1.5 text-sm"
              />

              <label className="flex items-center gap-1.5">
                <span className="text-xs text-brand-400">
                  {isFirstGroup ? "цена" : "надбавка"}
                </span>
                {isFirstGroup ? (
                  <NumberInput
                    value={item.price ?? null}
                    onChange={(price) => update(index, { price: price ?? undefined })}
                    placeholder={String(basePrice)}
                    className="field tnum w-24 py-1.5 text-sm"
                  />
                ) : (
                  <NumberInput
                    value={item.priceDelta ?? null}
                    onChange={(priceDelta) =>
                      update(index, { priceDelta: priceDelta ?? undefined })
                    }
                    placeholder="0"
                    className="field tnum w-24 py-1.5 text-sm"
                  />
                )}
                <span className="text-xs text-brand-300">{currencySymbol}</span>
              </label>

              <label
                className="flex cursor-pointer items-center gap-1.5"
                title="Выключено — этот вариант нельзя заказать"
              >
                <input
                  type="checkbox"
                  checked={item.inStock !== false}
                  onChange={(event) =>
                    update(index, {
                      inStock: event.target.checked ? undefined : false,
                    })
                  }
                  className="h-4 w-4 rounded border-brand-200 text-brand-700 focus:ring-brand-600"
                />
                <span className="text-xs text-brand-500">в наличии</span>
              </label>

              {item.images?.length ? (
                <span className="badge bg-brand-50 text-brand-500">
                  {item.images.length} фото
                </span>
              ) : null}

              <div className="ml-auto flex gap-1">
                <button
                  type="button"
                  onClick={() => move(index, index - 1)}
                  disabled={index === 0}
                  title="Выше"
                  className="btn-ghost px-1.5 py-1.5 text-xs disabled:opacity-30"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => move(index, index + 1)}
                  disabled={index === values.length - 1}
                  title="Ниже"
                  className="btn-ghost px-1.5 py-1.5 text-xs disabled:opacity-30"
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onChange(values.filter((_, i) => i !== index));
                    setExpanded(null);
                  }}
                  title="Удалить значение"
                  className="btn-ghost px-1.5 py-1.5 text-red-700"
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* -------------------- Развёрнутые детали ------------------- */}
            {open && (
              <div className="space-y-4 border-t border-brand-100 bg-brand-50/60 p-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  <label className="block">
                    <span className="label mb-1 text-xs">Код значения</span>
                    <input
                      value={item.id}
                      onChange={(event) =>
                        update(index, { id: toSlug(event.target.value) })
                      }
                      className="field py-2 text-sm"
                    />
                    <span className="mt-1 block text-xs text-brand-400">
                      Входит в ключ корзины — после запуска не меняйте
                    </span>
                  </label>

                  <label className="block">
                    <span className="label mb-1 text-xs">Артикул варианта</span>
                    <input
                      value={item.sku ?? ""}
                      onChange={(event) =>
                        update(index, { sku: event.target.value || undefined })
                      }
                      className="field py-2 text-sm"
                    />
                  </label>

                  <label className="block">
                    <span className="label mb-1 text-xs">
                      Старая цена, {currencySymbol}
                    </span>
                    <NumberInput
                      value={item.oldPrice ?? null}
                      onChange={(oldPrice) =>
                        update(index, { oldPrice: oldPrice ?? undefined })
                      }
                      className="field tnum py-2 text-sm"
                    />
                  </label>
                </div>

                <ImagePicker
                  value={item.images ?? []}
                  onChange={(images) =>
                    update(index, { images: images.length ? images : undefined })
                  }
                  folder={folder}
                  thumbs={thumbs}
                  label="Своя галерея"
                  hint="Если пусто — покажется общая галерея товара"
                />

                {isFirstGroup && price !== undefined && (
                  <p className="text-xs text-brand-400">
                    Итоговая цена варианта:{" "}
                    <b className="tnum text-brand-600">
                      {price} {currencySymbol}
                    </b>{" "}
                    плюс надбавки из остальных наборов.
                  </p>
                )}
              </div>
            )}
          </div>
        );
      })}

      <div className="p-3">
        <button
          type="button"
          onClick={() => {
            onChange([...values, { id: "", label: "" }]);
            setExpanded(values.length);
          }}
          className="btn-secondary py-1.5 text-sm"
        >
          + Значение
        </button>
      </div>
    </div>
  );
}
