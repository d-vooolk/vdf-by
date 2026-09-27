"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { saveSiteAction } from "@/app/admin/actions";
import {
  Field,
  NumberInput,
  Problems,
  Section,
} from "@/components/admin/form-parts";
import { SpinnerIcon, TrashIcon } from "@/components/icons";
import { deliveryArea, type DeliveryArea } from "@/lib/delivery";
import type { DeliveryMethod, Site } from "@/lib/schema";

/**
 * Настройки магазина: контакты, доставка, оплата, тексты «о нас».
 *
 * Всё это стоит в шапке и подвале каждой страницы, поэтому после сохранения
 * пересобирается весь сайт — перечислять затронутые адреса поимённо здесь
 * бессмысленно (см. revalidateSite в src/lib/revalidate.ts).
 *
 * Адрес приёма заказов, координаты и локаль в форму не вынесены намеренно:
 * меняются они раз в жизни, а перепутать их легко. Если понадобится — они
 * лежат в той же записи настроек.
 */

export type SettingsPart = "shop" | "contacts" | "delivery" | "features";

const PART_TITLES: Record<SettingsPart, string> = {
  shop: "Магазин",
  contacts: "Контакты",
  delivery: "Доставка и оплата",
  features: "Преимущества",
};

export function SettingsForm({ site: initial, part }: { site: Site; part: SettingsPart }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState<Site>(initial);
  const [problems, setProblems] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);

  const patch = (changes: Partial<Site>) => {
    setDraft((current) => ({ ...current, ...changes }));
    setSaved(false);
  };

  const save = () => {
    setProblems([]);
    startTransition(async () => {
      const result = await saveSiteAction(draft);
      if (!result.ok) {
        setProblems(result.problems);
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      setSaved(true);
      router.refresh();
    });
  };

  return (
    <div className="space-y-5 pb-24">
      <h1 className="text-xl font-semibold text-brand-900">{PART_TITLES[part]}</h1>

      <Problems items={problems} />

      {saved && (
        <p className="rounded-xl border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-800">
          Сохранено. Сайт обновлён целиком — телефон и меню стоят на каждой
          странице.
        </p>
      )}

      {/* --------------------------- Магазин --------------------------- */}
      {part === "shop" && (
        <Section title="Магазин">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Название" required>
              <input
                value={draft.name}
                onChange={(event) => patch({ name: event.target.value })}
                className="field"
              />
            </Field>
            <Field label="Юридическое название" required hint="Для разметки и подвала">
              <input
                value={draft.legalName}
                onChange={(event) => patch({ legalName: event.target.value })}
                className="field"
              />
            </Field>
          </div>

          <Field label="Короткий слоган" required hint="Идёт в заголовок вкладки">
            <input
              value={draft.tagline}
              onChange={(event) => patch({ tagline: event.target.value })}
              className="field"
            />
          </Field>

          <Field label="Описание сайта" required hint="Показывается в результатах поиска">
            <textarea
              value={draft.description}
              onChange={(event) => patch({ description: event.target.value })}
              rows={3}
              className="field resize-y"
            />
          </Field>
        </Section>
      )}

      {/* --------------------------- Контакты -------------------------- */}
      {part === "contacts" && (
        <Section title="Контакты">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Телефон" required hint="Как показывать: +375 29 123-45-67">
              <input
                value={draft.phone}
                onChange={(event) => patch({ phone: event.target.value })}
                className="field tnum"
              />
            </Field>
            <Field label="Телефон для ссылки" required hint="Только цифры и плюс: +375291234567">
              <input
                value={draft.phoneHref}
                onChange={(event) => patch({ phoneHref: event.target.value })}
                className="field tnum"
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Почта" required>
              <input
                type="email"
                value={draft.email}
                onChange={(event) => patch({ email: event.target.value })}
                className="field"
              />
            </Field>
            <Field label="Часы работы" hint="Пн–Пт 10:00–19:00, Сб 10:00–16:00">
              <input
                value={draft.workHours}
                onChange={(event) => patch({ workHours: event.target.value })}
                className="field"
              />
            </Field>
          </div>

          {/* Мессенджеры и соцсети. Отсюда их берут все блоки связи сразу:
              панель справа на каждой странице, кнопки на карточках товаров и
              подвал. Пустое поле — канала на сайте просто не будет.
              Формат вольный: ссылка, @имя или номер телефона — привести к
              рабочему адресу умеет src/lib/contacts.ts. */}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Telegram" hint="Ссылка или @имя: https://t.me/autosvetby">
              <input
                value={draft.telegram}
                onChange={(event) => patch({ telegram: event.target.value })}
                className="field"
                placeholder="https://t.me/autosvetby"
              />
            </Field>
            <Field label="Viber" hint="Номер телефона — ссылку соберём сами">
              <input
                value={draft.viber}
                onChange={(event) => patch({ viber: event.target.value })}
                className="field"
                placeholder="+375291234567"
              />
            </Field>
            <Field label="WhatsApp" hint="Номер телефона или ссылка wa.me">
              <input
                value={draft.whatsapp}
                onChange={(event) => patch({ whatsapp: event.target.value })}
                className="field"
                placeholder="+375291234567"
              />
            </Field>
            <Field label="Instagram" hint="Ссылка или @имя">
              <input
                value={draft.instagram}
                onChange={(event) => patch({ instagram: event.target.value })}
                className="field"
                placeholder="https://instagram.com/autosvetby"
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Улица и дом" >
              <input
                value={draft.address.street}
                onChange={(event) =>
                  patch({ address: { ...draft.address, street: event.target.value } })
                }
                className="field"
              />
            </Field>
            <Field label="Город">
              <input
                value={draft.address.city}
                onChange={(event) =>
                  patch({ address: { ...draft.address, city: event.target.value } })
                }
                className="field"
              />
            </Field>
          </div>
        </Section>
      )}

      {/* --------------------------- Доставка -------------------------- */}
      {part === "delivery" && (
        <>
          <Section
            title="Доставка"
            note="Эти способы покупатель видит в корзине. Стоимость берётся отсюда, а не из браузера — подменить её в запросе нельзя."
          >
            <DeliveryEditor
              value={draft.delivery.methods}
              onChange={(methods) => patch({ delivery: { methods } })}
              currencySymbol={draft.currencySymbol}
            />
          </Section>

          {/* ---------------------------- Оплата --------------------------- */}
          <Section title="Оплата" note="Список под кнопкой оформления заказа.">
            <StringListEditor
              value={draft.payment}
              onChange={(payment) => patch({ payment })}
              placeholder="Наличными при получении"
              addLabel="+ Способ оплаты"
            />

            <Field label="Гарантия" hint="Одна фраза для страницы доставки">
              <input
                value={draft.warranty}
                onChange={(event) => patch({ warranty: event.target.value })}
                className="field"
              />
            </Field>

            <Field
              label="Возврат в течение, дней"
              hint="Попадает и на страницу доставки, и в разметку товара для Google. Должно совпадать с тем, что вы реально обещаете. 0 — не заявлять возврат"
            >
              <NumberInput
                integer
                value={draft.returnDays}
                onChange={(returnDays) => patch({ returnDays: returnDays ?? 0 })}
                placeholder="14"
                className="field tnum w-32"
              />
            </Field>
          </Section>
        </>
      )}

      {/* -------------------------- Преимущества ----------------------- */}
      {part === "features" && (
        <Section
          title="Преимущества"
          note="Блок на главной: заголовок и одна-две фразы к нему."
        >
          <FeaturesEditor
            value={draft.features}
            onChange={(features) => patch({ features })}
          />
        </Section>
      )}

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-brand-100 bg-white/95 backdrop-blur">
        <div className="container-page flex items-center py-3">
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
            ) : (
              "Сохранить настройки"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Способы доставки                                                    */
/* ------------------------------------------------------------------ */

function DeliveryEditor({
  value,
  onChange,
  currencySymbol,
}: {
  value: DeliveryMethod[];
  onChange: (value: DeliveryMethod[]) => void;
  currencySymbol: string;
}) {
  const update = (index: number, patch: Partial<DeliveryMethod>) =>
    onChange(value.map((item, i) => (i === index ? { ...item, ...patch } : item)));

  return (
    <div className="space-y-3">
      {value.map((method, index) => (
        <div key={index} className="rounded-card border border-brand-100 p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="label mb-1 text-xs">Название</span>
              <input
                value={method.name}
                onChange={(event) => update(index, { name: event.target.value })}
                className="field py-2 text-sm"
                placeholder="Доставка по Минску"
              />
            </label>

            <label className="block">
              <span className="label mb-1 text-xs">Код</span>
              <input
                value={method.id}
                onChange={(event) => update(index, { id: event.target.value })}
                className="field py-2 text-sm"
                placeholder="minsk"
              />
            </label>
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="label mb-1 text-xs">
                Стоимость, {currencySymbol}
              </span>
              <NumberInput
                value={method.price}
                onChange={(price) => update(index, { price: price ?? 0 })}
                placeholder="0"
                className="field tnum py-2 text-sm"
              />
            </label>

            <label className="block">
              <span className="label mb-1 text-xs">
                Бесплатно от, {currencySymbol}
              </span>
              <NumberInput
                value={method.freeFrom ?? null}
                onChange={(freeFrom) => update(index, { freeFrom })}
                placeholder="не бывает"
                className="field tnum py-2 text-sm"
              />
            </label>
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="label mb-1 text-xs">Срок от, дней</span>
              <NumberInput
                integer
                value={method.daysMin ?? null}
                onChange={(daysMin) => update(index, { daysMin: daysMin ?? undefined })}
                placeholder="0 — в день заказа"
                className="field tnum py-2 text-sm"
              />
            </label>

            <label className="block">
              <span className="label mb-1 text-xs">Срок до, дней</span>
              <NumberInput
                integer
                value={method.daysMax ?? null}
                onChange={(daysMax) => update(index, { daysMax: daysMax ?? undefined })}
                placeholder="не указан"
                className="field tnum py-2 text-sm"
              />
            </label>
          </div>

          <label className="mt-3 block">
            <span className="label mb-1 text-xs">Пояснение</span>
            <input
              value={method.note ?? ""}
              onChange={(event) => update(index, { note: event.target.value })}
              className="field py-2 text-sm"
              placeholder="Привезём в течение дня"
            />
          </label>

          {method.requiresAddress && (
            <label className="mt-3 block">
              <span className="label mb-1 text-xs">Куда возит</span>
              <select
                value={deliveryArea(method)}
                onChange={(event) =>
                  update(index, { area: event.target.value as DeliveryArea })
                }
                className="field py-2 text-sm"
              >
                <option value="city">Только по городу</option>
                <option value="country">По всей Беларуси</option>
              </select>
              <span className="mt-1 block text-xs text-brand-400">
                В разметку товаров для Google и в фид попадает только доставка
                по всей стране.
              </span>
            </label>
          )}

          <div className="mt-3 flex items-center justify-between">
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={method.requiresAddress}
                onChange={(event) =>
                  update(index, { requiresAddress: event.target.checked })
                }
                className="h-4 w-4 rounded border-brand-200 text-brand-700 focus:ring-brand-600"
              />
              <span className="text-sm text-brand-600">
                Спрашивать адрес
                <span className="block text-xs text-brand-400">
                  Для самовывоза выключите
                </span>
              </span>
            </label>

            <button
              type="button"
              onClick={() => onChange(value.filter((_, i) => i !== index))}
              disabled={value.length <= 1}
              title={
                value.length <= 1
                  ? "Хотя бы один способ должен остаться"
                  : "Удалить способ"
              }
              className="btn-ghost px-2 py-2 text-red-700 disabled:text-brand-300"
            >
              <TrashIcon className="h-4 w-4" />
            </button>
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={() =>
          onChange([
            ...value,
            { id: "", name: "", price: 0, requiresAddress: true },
          ])
        }
        className="btn-secondary py-2 text-sm"
      >
        + Способ доставки
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function StringListEditor({
  value,
  onChange,
  placeholder,
  addLabel,
}: {
  value: string[];
  onChange: (value: string[]) => void;
  placeholder: string;
  addLabel: string;
}) {
  return (
    <div className="space-y-2">
      {value.map((item, index) => (
        <div key={index} className="flex gap-2">
          <input
            value={item}
            onChange={(event) =>
              onChange(
                value.map((entry, i) => (i === index ? event.target.value : entry)),
              )
            }
            placeholder={placeholder}
            className="field flex-1 py-2 text-sm"
          />
          <button
            type="button"
            onClick={() => onChange(value.filter((_, i) => i !== index))}
            className="btn-ghost px-2 py-2 text-red-700"
          >
            <TrashIcon className="h-4 w-4" />
          </button>
        </div>
      ))}

      <button
        type="button"
        onClick={() => onChange([...value, ""])}
        className="btn-secondary py-2 text-sm"
      >
        {addLabel}
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function FeaturesEditor({
  value,
  onChange,
}: {
  value: Array<{ title: string; text: string }>;
  onChange: (value: Array<{ title: string; text: string }>) => void;
}) {
  const update = (index: number, patch: Partial<{ title: string; text: string }>) =>
    onChange(value.map((item, i) => (i === index ? { ...item, ...patch } : item)));

  return (
    <div className="space-y-2">
      {value.map((feature, index) => (
        <div key={index} className="flex gap-2">
          <input
            value={feature.title}
            onChange={(event) => update(index, { title: event.target.value })}
            placeholder="Своя установка"
            className="field w-1/3 py-2 text-sm"
          />
          <input
            value={feature.text}
            onChange={(event) => update(index, { text: event.target.value })}
            placeholder="Поставим линзы в тот же день"
            className="field flex-1 py-2 text-sm"
          />
          <button
            type="button"
            onClick={() => onChange(value.filter((_, i) => i !== index))}
            className="btn-ghost px-2 py-2 text-red-700"
          >
            <TrashIcon className="h-4 w-4" />
          </button>
        </div>
      ))}

      <button
        type="button"
        onClick={() => onChange([...value, { title: "", text: "" }])}
        className="btn-secondary py-2 text-sm"
      >
        + Преимущество
      </button>
    </div>
  );
}
