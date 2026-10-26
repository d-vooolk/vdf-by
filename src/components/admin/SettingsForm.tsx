"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { saveSiteAction } from "@/app/admin/settings-actions";
import { EditableCard, EditableField, type SaveResult } from "@/components/admin/Editable";
import { NumberInput, Section } from "@/components/admin/form-parts";
import { deliveryArea, type DeliveryArea } from "@/lib/delivery";
import { MM_COURIER_TARIFF } from "@/lib/delivery-quote";
import type { DeliveryMethod, Site, WeightTariff } from "@/lib/schema";

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

type Feature = { title: string; text: string };

type TextKey =
  | "name"
  | "legalName"
  | "tagline"
  | "description"
  | "phone"
  | "phoneHref"
  | "email"
  | "workHours"
  | "telegram"
  | "whatsapp"
  | "instagram"
  | "warranty";

const EMPTY_METHOD: DeliveryMethod = { id: "", name: "", price: 0, requiresAddress: true };
const EMPTY_FEATURE: Feature = { title: "", text: "" };

function ListEditor<T>({
  items,
  empty,
  addLabel,
  view,
  editor,
  onChange,
  canDelete = () => true,
  deleteConfirm,
}: {
  items: T[];
  empty: T;
  addLabel: string;
  view: (item: T) => React.ReactNode;
  editor: (draft: T, change: (next: T) => void) => React.ReactNode;
  onChange: (items: T[]) => Promise<SaveResult>;
  canDelete?: (items: T[]) => boolean;
  deleteConfirm: (item: T) => string;
}) {
  const [adding, setAdding] = useState(false);
  return (
    <div className="space-y-2">
      {items.map((item, index) => (
        <EditableCard
          key={`${index}-${JSON.stringify(item)}`}
          value={item}
          view={view}
          editor={editor}
          onSave={(next) => onChange(items.map((entry, i) => (i === index ? next : entry)))}
          onDelete={canDelete(items) ? () => onChange(items.filter((_, i) => i !== index)) : undefined}
          deleteConfirm={deleteConfirm(item)}
        />
      ))}
      {adding ? (
        <EditableCard
          value={empty}
          startEditing
          view={() => null}
          editor={editor}
          onSave={async (next) => {
            const problems = await onChange([...items, next]);
            if (!problems.length) setAdding(false);
            return problems;
          }}
          onCancelNew={() => setAdding(false)}
        />
      ) : (
        <button type="button" onClick={() => setAdding(true)} className="btn-secondary py-2 text-sm">
          {addLabel}
        </button>
      )}
    </div>
  );
}

export function SettingsForm({ site: initial, part }: { site: Site; part: SettingsPart }) {
  const router = useRouter();
  const [site, setSite] = useState<Site>(initial);

  const commit = async (changes: Partial<Site>): Promise<SaveResult> => {
    const next = { ...site, ...changes };
    const result = await saveSiteAction(next);
    if (!result.ok) return result.problems;
    setSite(next);
    router.refresh();
    return [];
  };

  const text = (
    key: TextKey,
    label: string,
    options: { hint?: string; placeholder?: string; multiline?: boolean; mono?: boolean; type?: "text" | "email" } = {},
  ) => (
    <EditableField
      label={label}
      value={site[key] ?? ""}
      onSave={(value) => commit({ [key]: value } as Partial<Site>)}
      {...options}
    />
  );

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-semibold text-brand-900">{PART_TITLES[part]}</h1>

      {part === "shop" && (
        <Section title="Магазин">
          <div>
            {text("name", "Название")}
            {text("legalName", "Юридическое название", { hint: "Для разметки и подвала" })}
            {text("tagline", "Короткий слоган", { hint: "Идёт в заголовок вкладки" })}
            {text("description", "Описание сайта", { hint: "Показывается в результатах поиска", multiline: true })}
          </div>
        </Section>
      )}

      {part === "contacts" && (
        <Section title="Контакты">
          <div>
            {text("phone", "Телефон", { hint: "Как показывать: +375 29 123-45-67", mono: true })}
            {text("phoneHref", "Телефон для ссылки", { hint: "Только цифры и плюс: +375291234567", mono: true })}
            {text("email", "Почта", { type: "email" })}
            {text("workHours", "Часы работы", { hint: "Пн–Пт 10:00–19:00, Сб 10:00–16:00" })}
            {/* Мессенджеры и соцсети. Отсюда их берут все блоки связи сразу:
                панель справа на каждой странице, кнопки на карточках товаров и
                подвал. Пустое поле — канала на сайте просто не будет.
                Формат вольный: ссылка, @имя или номер телефона — привести к
                рабочему адресу умеет src/lib/contacts.ts. */}
            {text("telegram", "Telegram", {
              hint: "Ссылка или @имя: https://t.me/autosvetby",
              placeholder: "https://t.me/autosvetby",
            })}
            {text("whatsapp", "WhatsApp", { hint: "Номер телефона или ссылка wa.me", placeholder: "+375291234567" })}
            {text("instagram", "Instagram", {
              hint: "Ссылка или @имя",
              placeholder: "https://instagram.com/autosvetby",
            })}
            <EditableField
              label="Улица и дом"
              value={site.address.street}
              onSave={(street) => commit({ address: { ...site.address, street } })}
            />
            <EditableField
              label="Город"
              value={site.address.city}
              onSave={(city) => commit({ address: { ...site.address, city } })}
            />
          </div>
        </Section>
      )}

      {part === "delivery" && (
        <>
          <Section
            title="Доставка"
            note="Эти способы покупатель видит в корзине. Стоимость берётся отсюда, а не из браузера — подменить её в запросе нельзя."
          >
            <ListEditor
              items={site.delivery.methods}
              empty={EMPTY_METHOD}
              addLabel="+ Способ доставки"
              view={(method) => <DeliveryView method={method} currencySymbol={site.currencySymbol} />}
              editor={(draft, change) => (
                <DeliveryFields method={draft} onChange={change} currencySymbol={site.currencySymbol} />
              )}
              onChange={(methods) => commit({ delivery: { methods } })}
              canDelete={(methods) => methods.length > 1}
              deleteConfirm={(method) => `Удалить способ «${method.name || "без названия"}»?`}
            />
          </Section>

          <Section title="Оплата" note="Список под кнопкой оформления заказа.">
            <ListEditor
              items={site.payment}
              empty=""
              addLabel="+ Способ оплаты"
              view={(payment) => <p className="text-sm text-brand-900">{payment || "без названия"}</p>}
              editor={(draft, change) => (
                <input
                  value={draft}
                  onChange={(event) => change(event.target.value)}
                  placeholder="Наличными при получении"
                  autoFocus
                  className="field py-2 text-sm"
                />
              )}
              onChange={(payment) => commit({ payment })}
              deleteConfirm={(payment) => `Удалить «${payment}»?`}
            />

            <div>
              {text("warranty", "Гарантия", { hint: "Одна фраза для страницы доставки" })}
              <EditableField
                label="Возврат в течение, дней"
                hint="Попадает и на страницу доставки, и в разметку товара для Google. Должно совпадать с тем, что вы реально обещаете. 0 — не заявлять возврат"
                value={String(site.returnDays ?? 0)}
                inputMode="numeric"
                mono
                onSave={(value) => {
                  const returnDays = Number.parseInt(value.trim() || "0", 10);
                  return Number.isFinite(returnDays) && returnDays >= 0
                    ? commit({ returnDays })
                    : Promise.resolve(["Укажите целое число дней"]);
                }}
              />
            </div>
          </Section>
        </>
      )}

      {part === "features" && (
        <Section title="Преимущества" note="Блок на главной: заголовок и одна-две фразы к нему.">
          <ListEditor
            items={site.features}
            empty={EMPTY_FEATURE}
            addLabel="+ Преимущество"
            view={(feature) => (
              <div>
                <p className="text-sm font-semibold text-brand-900">{feature.title || "без заголовка"}</p>
                {feature.text && <p className="mt-0.5 text-sm text-brand-600">{feature.text}</p>}
              </div>
            )}
            editor={(draft, change) => (
              <div className="grid gap-2 sm:grid-cols-[1fr_2fr]">
                <input
                  value={draft.title}
                  onChange={(event) => change({ ...draft, title: event.target.value })}
                  placeholder="Своя установка"
                  autoFocus
                  className="field py-2 text-sm"
                />
                <input
                  value={draft.text}
                  onChange={(event) => change({ ...draft, text: event.target.value })}
                  placeholder="Поставим линзы в тот же день"
                  className="field py-2 text-sm"
                />
              </div>
            )}
            onChange={(features) => commit({ features })}
            deleteConfirm={(feature) => `Удалить «${feature.title}»?`}
          />
        </Section>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Способы доставки                                                    */
/* ------------------------------------------------------------------ */

function money(value: number, currencySymbol: string): string {
  return `${value.toLocaleString("ru-RU")} ${currencySymbol}`;
}

function term(method: DeliveryMethod): string {
  const { daysMin, daysMax } = method;
  if (daysMin === undefined && daysMax === undefined) return "";
  if (daysMin === 0 && !daysMax) return "в день заказа";
  if (daysMin !== undefined && daysMax !== undefined && daysMax !== daysMin) return `${daysMin}–${daysMax} дн.`;
  return `${daysMax ?? daysMin} дн.`;
}

function DeliveryView({ method, currencySymbol }: { method: DeliveryMethod; currencySymbol: string }) {
  const area = method.requiresAddress
    ? deliveryArea(method) === "country"
      ? "по всей Беларуси"
      : "по городу"
    : "самовывоз";
  const tariff = method.weightTariff;
  const facts = [
    tariff
      ? `по весу, от ${money(Math.min(...tariff.intercity.map((band) => band.price)), currencySymbol)} (до ${Math.max(...tariff.intercity.map((band) => band.upTo))} кг)`
      : method.price
        ? money(method.price, currencySymbol)
        : "бесплатно",
    method.freeFrom ? `бесплатно от ${money(method.freeFrom, currencySymbol)}` : "",
    term(method),
    area,
  ].filter(Boolean);
  return (
    <div className="space-y-1">
      <p className="text-sm font-semibold text-brand-900">
        {method.name || "без названия"}{" "}
        <span className="tnum text-xs font-normal text-brand-400">{method.id}</span>
      </p>
      <p className="tnum text-sm text-brand-600">{facts.join(" · ")}</p>
      {method.note && <p className="text-xs text-brand-500">{method.note}</p>}
    </div>
  );
}

function DeliveryFields({
  method,
  onChange,
  currencySymbol,
}: {
  method: DeliveryMethod;
  onChange: (method: DeliveryMethod) => void;
  currencySymbol: string;
}) {
  const update = (patch: Partial<DeliveryMethod>) => onChange({ ...method, ...patch });

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="label mb-1 text-xs">Название</span>
          <input
            value={method.name}
            onChange={(event) => update({ name: event.target.value })}
            className="field py-2 text-sm"
            placeholder="Доставка по Минску"
          />
        </label>
        <label className="block">
          <span className="label mb-1 text-xs">Код</span>
          <input
            value={method.id}
            onChange={(event) => update({ id: event.target.value })}
            className="field py-2 text-sm"
            placeholder="minsk"
          />
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="label mb-1 text-xs">Стоимость, {currencySymbol}</span>
          <NumberInput
            value={method.price}
            onChange={(price) => update({ price: price ?? 0 })}
            placeholder="0"
            className="field tnum py-2 text-sm"
          />
        </label>
        <label className="block">
          <span className="label mb-1 text-xs">Бесплатно от, {currencySymbol}</span>
          <NumberInput
            value={method.freeFrom ?? null}
            onChange={(freeFrom) => update({ freeFrom })}
            placeholder="не бывает"
            className="field tnum py-2 text-sm"
          />
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="label mb-1 text-xs">Срок от, дней</span>
          <NumberInput
            integer
            value={method.daysMin ?? null}
            onChange={(daysMin) => update({ daysMin: daysMin ?? undefined })}
            placeholder="0 — в день заказа"
            className="field tnum py-2 text-sm"
          />
        </label>
        <label className="block">
          <span className="label mb-1 text-xs">Срок до, дней</span>
          <NumberInput
            integer
            value={method.daysMax ?? null}
            onChange={(daysMax) => update({ daysMax: daysMax ?? undefined })}
            placeholder="не указан"
            className="field tnum py-2 text-sm"
          />
        </label>
      </div>

      <label className="block">
        <span className="label mb-1 text-xs">Пояснение</span>
        <input
          value={method.note ?? ""}
          onChange={(event) => update({ note: event.target.value })}
          className="field py-2 text-sm"
          placeholder="Привезём в течение дня"
        />
      </label>

      {method.requiresAddress && (
        <label className="block">
          <span className="label mb-1 text-xs">Куда возит</span>
          <select
            value={deliveryArea(method)}
            onChange={(event) => update({ area: event.target.value as DeliveryArea })}
            className="field py-2 text-sm"
          >
            <option value="city">Только по городу</option>
            <option value="country">По всей Беларуси</option>
          </select>
          <span className="mt-1 block text-xs text-brand-400">
            В разметку товаров для Google и в фид попадает только доставка по всей стране.
          </span>
        </label>
      )}

      <WeightTariffFields
        tariff={method.weightTariff}
        onChange={(weightTariff) => update({ weightTariff })}
        currencySymbol={currencySymbol}
      />

      <label className="flex cursor-pointer items-center gap-2">
        <input
          type="checkbox"
          checked={method.requiresAddress}
          onChange={(event) => update({ requiresAddress: event.target.checked })}
          className="h-4 w-4 rounded border-brand-200 text-brand-700 focus:ring-brand-600"
        />
        <span className="text-sm text-brand-600">
          Спрашивать адрес
          <span className="block text-xs text-brand-400">Для самовывоза выключите</span>
        </span>
      </label>
    </div>
  );
}

function BandsEditor({
  title,
  bands,
  onChange,
  currencySymbol,
}: {
  title: string;
  bands: WeightTariff["inCity"];
  onChange: (bands: WeightTariff["inCity"]) => void;
  currencySymbol: string;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-brand-500">{title}</p>
      {bands.map((band, index) => (
        <div key={index} className="flex items-center gap-2 text-sm">
          <span className="text-brand-500">до</span>
          <NumberInput
            value={band.upTo}
            onChange={(upTo) => onChange(bands.map((item, i) => (i === index ? { ...item, upTo: upTo ?? 0 } : item)))}
            className="field tnum w-20 py-1.5 text-sm"
          />
          <span className="text-brand-500">кг —</span>
          <NumberInput
            value={band.price}
            onChange={(price) => onChange(bands.map((item, i) => (i === index ? { ...item, price: price ?? 0 } : item)))}
            className="field tnum w-24 py-1.5 text-sm"
          />
          <span className="text-brand-500">{currencySymbol}</span>
          <button
            type="button"
            onClick={() => onChange(bands.filter((_, i) => i !== index))}
            disabled={bands.length <= 1}
            className="btn-ghost px-2 py-1 text-xs text-brand-400 hover:text-red-700"
          >
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...bands, { upTo: (bands.at(-1)?.upTo ?? 0) + 10, price: bands.at(-1)?.price ?? 0 }])}
        className="btn-ghost px-2 py-1 text-xs"
      >
        + ступень
      </button>
    </div>
  );
}

function WeightTariffFields({
  tariff,
  onChange,
  currencySymbol,
}: {
  tariff: WeightTariff | undefined;
  onChange: (tariff: WeightTariff | undefined) => void;
  currencySymbol: string;
}) {
  return (
    <div className="space-y-3 rounded-xl border border-brand-100 p-3">
      <label className="flex cursor-pointer items-center gap-2">
        <input
          type="checkbox"
          checked={Boolean(tariff)}
          onChange={(event) => onChange(event.target.checked ? MM_COURIER_TARIFF : undefined)}
          className="h-4 w-4 rounded border-brand-200"
        />
        <span className="text-sm text-brand-700">
          Считать стоимость по весу заказа
          <span className="block text-xs text-brand-400">
            Как калькулятор M&M Express: вес товаров, город получателя, ступени тарифа. Цена выше остаётся для разметки и
            фидов.
          </span>
        </span>
      </label>

      {tariff && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block">
              <span className="label mb-1 text-xs">Город отправки</span>
              <input
                value={tariff.homeCity}
                onChange={(event) => onChange({ ...tariff, homeCity: event.target.value })}
                className="field py-2 text-sm"
              />
            </label>
            <label className="block">
              <span className="label mb-1 text-xs">Надбавка за стекло, %</span>
              <NumberInput
                value={tariff.glassPercent}
                onChange={(glassPercent) => onChange({ ...tariff, glassPercent: glassPercent ?? 0 })}
                className="field tnum py-2 text-sm"
              />
            </label>
            <label className="block">
              <span className="label mb-1 text-xs">Вес товара без веса, кг</span>
              <NumberInput
                value={tariff.defaultItemWeight}
                onChange={(defaultItemWeight) => onChange({ ...tariff, defaultItemWeight: defaultItemWeight || 1 })}
                className="field tnum py-2 text-sm"
              />
            </label>
          </div>
          <label className="block">
            <span className="label mb-1 text-xs">Разделы со стеклом (коды через запятую)</span>
            <input
              value={tariff.glassCategoryIds.join(", ")}
              onChange={(event) =>
                onChange({
                  ...tariff,
                  glassCategoryIds: event.target.value.split(",").map((item) => item.trim()).filter(Boolean),
                })
              }
              className="field py-2 text-sm"
              placeholder="glasses"
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <BandsEditor
              title={`По городу отправки (${tariff.homeCity})`}
              bands={tariff.inCity}
              onChange={(inCity) => onChange({ ...tariff, inCity })}
              currencySymbol={currencySymbol}
            />
            <BandsEditor
              title="Между городами"
              bands={tariff.intercity}
              onChange={(intercity) => onChange({ ...tariff, intercity })}
              currencySymbol={currencySymbol}
            />
          </div>
          <button type="button" onClick={() => onChange(MM_COURIER_TARIFF)} className="btn-ghost px-2 py-1 text-xs">
            Заполнить тарифами M&M (дверь–дверь, с 15.10.2026)
          </button>
        </>
      )}
    </div>
  );
}
