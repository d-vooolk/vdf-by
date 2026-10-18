"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { ConsentCheckbox, SavedConsentNote } from "@/components/ConsentCheckbox";
import { OrderCelebration } from "@/components/OrderCelebration";
import { CartLines } from "@/components/CartLines";
import { AlertIcon, CartIcon, CheckIcon } from "@/components/icons";
import { trackOrder } from "@/lib/analytics";
import { formatPrice, pluralize } from "@/lib/format";
import { deliveryPrice, parcelOf } from "@/lib/delivery-quote";
import type { DeliveryMethod } from "@/lib/schema";
import { useAccount } from "@/store/account";
import {
  cartTotal,
  useCart,
  useHydrated,
  type StockCut,
} from "@/store/cart";
import { FORM_ID, OrderSummary } from "./OrderSummary";

/**
 * Корзина и оформление заказа на одной странице.
 *
 * Онлайн-оплаты нет: заказ уходит менеджеру в Telegram, тот перезванивается и
 * подтверждает наличие. Поэтому и шаг один — лишний экран между корзиной и
 * отправкой только теряет клиентов.
 */


interface CartCheckoutProps {
  currencySymbol: string;
  currency: string;
  deliveryMethods: DeliveryMethod[];
  payment: string[];
  orderEndpoint: string;
  phone: string;
  phoneHref: string;
  telegram: string;
}

interface FormState {
  name: string;
  phone: string;
  email: string;
  consent: boolean;
  city: string;
  address: string;
  comment: string;
  /** Ловушка для ботов: люди это поле не видят и не заполняют. */
  website: string;
}

const EMPTY_FORM: FormState = {
  name: "",
  phone: "",
  email: "",
  consent: false,
  city: "",
  address: "",
  comment: "",
  website: "",
};

/** Оставляет только цифры — в таком виде номер уходит менеджеру. */
function digits(value: string): string {
  return value.replace(/\D/g, "");
}

export function CartCheckout({
  currencySymbol,
  currency,
  deliveryMethods,
  payment,
  orderEndpoint,
  phone,
  phoneHref,
  telegram,
}: CartCheckoutProps) {
  const router = useRouter();
  const hydrated = useHydrated();
  const items = useCart((state) => state.items);
  const reprice = useCart((state) => state.reprice);
  const clear = useCart((state) => state.clear);
  const accountStatus = useAccount((state) => state.status);
  const wholesale = useAccount((state) => state.wholesale);
  const customer = useAccount((state) => state.customer);
  const loadAccount = useAccount((state) => state.load);
  const signedIn = accountStatus === "customer";

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [prefilled, setPrefilled] = useState(false);
  if (customer && !prefilled) {
    setPrefilled(true);
    setForm((current) => ({
      ...current,
      name: current.name || customer.name,
      phone: current.phone || customer.phone,
      address: current.address || customer.address,
    }));
  }
  const [methodId, setMethodId] = useState(deliveryMethods[0]?.id ?? "");
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>(
    {},
  );
  const [status, setStatus] = useState<"idle" | "sending" | "failed">("idle");
  const [celebration, setCelebration] = useState<{ id: number | null; total: number } | null>(null);
  const [failure, setFailure] = useState("");
  const [priceChanges, setPriceChanges] = useState<
    Array<{ title: string; from: number; to: number }>
  >([]);
  const [stockCuts, setStockCuts] = useState<StockCut[]>([]);
  const [parcelInfo, setParcelInfo] = useState<Record<string, { weight?: number; category?: string }>>({});

  const subtotal = cartTotal(items);
  const method = deliveryMethods.find((entry) => entry.id === methodId);

  const parcelFor = useCallback(
    (entry: DeliveryMethod) =>
      entry.weightTariff
        ? parcelOf(
            items.map((line) => ({
              weight: parcelInfo[line.key]?.weight ?? null,
              categoryId: parcelInfo[line.key]?.category ?? "",
              qty: line.qty,
            })),
            entry.weightTariff,
          )
        : null,
    [items, parcelInfo],
  );
  const parcel = method ? parcelFor(method) : null;
  const quoted = method ? deliveryPrice(method, subtotal, parcel, form.city) : 0;
  const deliveryPending = Boolean(method?.weightTariff) && quoted === null;
  const deliveryCost = quoted ?? 0;

  const total = subtotal + deliveryCost;

  /**
   * Корзина живёт в localStorage и может лежать там неделями. Сверяем цены с
   * актуальными из /variants.json (файл собирается вместе с сайтом) — иначе
   * клиент увидит одну сумму, а менеджер посчитает другую.
   */
  useEffect(() => {
    void loadAccount();
  }, [loadAccount]);

  useEffect(() => {
    if (!hydrated || accountStatus === "unknown" || accountStatus === "loading") return;
    let cancelled = false;
    fetch("/variants.json")
      .then((response) => (response.ok ? response.json() : null))
      .then(
        (
          retail: Record<
            string,
            { price: number; inStock: boolean; stock?: number; weight?: number; category?: string }
          > | null,
        ) => {
        if (cancelled || !retail) return;
        setParcelInfo(
          Object.fromEntries(
            Object.entries(retail).map(([key, entry]) => [key, { weight: entry.weight, category: entry.category }]),
          ),
        );
        const prices = { ...retail };
        for (const [key, price] of Object.entries(wholesale ?? {})) {
          if (prices[key]) prices[key] = { ...prices[key], price };
        }
        const changes = reprice(prices);
        if (changes.priceChanges.length) setPriceChanges(changes.priceChanges);
        if (changes.stockCuts.length) setStockCuts(changes.stockCuts);
        },
      )
      // Файл не загрузился — работаем по сохранённым ценам. Менеджер всё
      // равно подтверждает заказ звонком.
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // Сверяем один раз при заходе на страницу: за время правки количества
    // цены в собранном файле измениться не могут.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, accountStatus]);

  const validate = (): boolean => {
    const next: Partial<Record<keyof FormState, string>> = {};

    if (form.name.trim().length < 2) {
      next.name = "Как к вам обращаться?";
    }
    const phoneDigits = digits(form.phone);
    if (phoneDigits.length < 9) {
      next.phone = "Введите номер телефона — по нему подтвердим заказ";
    } else if (phoneDigits.length > 13) {
      next.phone = "Слишком длинный номер, проверьте";
    }
    if (method?.weightTariff && form.city.trim().length < 2) {
      next.city = "Укажите город — от него зависит стоимость доставки";
    }
    if (method?.requiresAddress && form.address.trim().length < 5) {
      next.address = "Укажите адрес: улица, дом, квартира";
    }
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      next.email = "Проверьте адрес почты";
    }
    if (!form.consent && !signedIn) {
      next.consent = "Без согласия мы не сможем принять заказ";
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  };

  /** Текст заказа — и для отправки, и для ручной пересылки, если сервис лежит. */
  const orderText = useMemo(() => {
    const lines = items.map(
      (line) =>
        `• ${line.title}${line.optionLabel ? ` (${line.optionLabel})` : ""} — ${line.qty} шт. × ${formatPrice(line.price, currencySymbol)}`,
    );
    return [
      "Заказ с сайта:",
      ...lines,
      "",
      `Доставка: ${method?.name ?? "—"}${deliveryPending ? " (стоимость уточним)" : deliveryCost ? ` (${formatPrice(deliveryCost, currencySymbol)})` : " (бесплатно)"}`,
      `Итого: ${formatPrice(total, currencySymbol)}`,
      "",
      `Имя: ${form.name}`,
      `Телефон: ${form.phone}`,
      form.email ? `Email: ${form.email}` : "",
      form.city ? `Город: ${form.city}` : "",
      form.address ? `Адрес: ${form.address}` : "",
      form.comment ? `Комментарий: ${form.comment}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  }, [items, method, deliveryCost, deliveryPending, total, form, currencySymbol]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (form.website) return; // скрытое поле заполнил бот
    if (!validate()) return;

    setStatus("sending");
    setFailure("");

    try {
      const response = await fetch(orderEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer: {
            name: form.name.trim(),
            phone: form.phone.trim(),
            phoneDigits: digits(form.phone),
            email: form.email.trim(),
            comment: form.comment.trim(),
          },
          consent: form.consent,
          delivery: {
            id: method?.id ?? "",
            name: method?.name ?? "",
            city: form.city.trim(),
            address: form.address.trim(),
            cost: deliveryCost,
          },
          items: items.map((line) => ({
            key: line.key,
            productId: line.productId,
            title: line.title,
            options: line.optionLabel,
            sku: line.sku ?? null,
            price: line.price,
            qty: line.qty,
            sum: line.price * line.qty,
            url: `/product/${line.slug}/`,
          })),
          subtotal,
          deliveryCost,
          total,
          currency,
          text: orderText,
        }),
      });

      if (!response.ok) {
        if (signedIn) void loadAccount(true);
        const rejected = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(rejected?.error ?? `сервер ответил ${response.status}`);
      }

      const accepted = (await response.json().catch(() => null)) as {
        id?: number;
      } | null;

      trackOrder({
        id: accepted?.id ?? 0,
        total,
        currency,
        source: "cart",
        items: items.map((line) => ({
          id: line.sku ?? line.productId,
          name: line.title,
          price: line.price,
          qty: line.qty,
        })),
      });

      router.prefetch("/order/success/");
      setCelebration({ id: accepted?.id ?? null, total });
    } catch (error) {
      // Заказ не потерян: ниже показываем готовый текст, который можно
      // переслать в Telegram или продиктовать по телефону.
      setStatus("failed");
      setFailure(
        error instanceof Error ? error.message : "не удалось отправить заказ",
      );
    }
  };

  /* ---------------------------- Рендер ---------------------------- */

  // До монтирования корзина всегда пуста: HTML сгенерирован на сборке.
  // Скелет вместо мгновенной надписи «пусто», которая тут же сменится.
  if (!hydrated) {
    return (
      <div className="card animate-pulse p-12">
        <div className="mx-auto h-4 w-48 rounded bg-brand-100" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="card p-10 text-center sm:p-14">
        <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50">
          <CartIcon className="h-7 w-7 text-brand-300" />
        </span>
        <h2 className="text-lg font-bold text-brand-900">Корзина пуста</h2>
        <p className="mx-auto mt-2 max-w-sm text-sm text-brand-500">
          Выберите линзы, лампы или стёкла в каталоге — и они появятся здесь.
        </p>
        <Link href="/catalog/" className="btn-primary mt-6">
          Перейти в каталог
        </Link>
      </div>
    );
  }

  const summary = (
    <OrderSummary
      subtotal={subtotal}
      deliveryCost={deliveryCost}
      deliveryPending={deliveryPending}
      total={total}
      methodName={method?.name}
      currencySymbol={currencySymbol}
      payment={payment}
      sending={status === "sending"}
    />
  );

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start lg:gap-10">
      {celebration && (
        <OrderCelebration
          orderId={celebration.id}
          total={celebration.total}
          currencySymbol={currencySymbol}
          onDone={() => {
            clear();
            router.push("/order/success/");
          }}
        />
      )}
      <div className="min-w-0">
        {priceChanges.length > 0 && (
          <div
            className="mb-5 flex gap-3 rounded-card border border-amber-300 bg-amber-50 p-4"
            role="status"
          >
            <AlertIcon className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div className="text-sm">
              <p className="font-semibold text-amber-900">
                Цены обновились, пока корзина ждала
              </p>
              <ul className="mt-1.5 space-y-0.5 text-amber-800">
                {priceChanges.map((change) => (
                  <li key={change.title} className="tnum">
                    {change.title}: {formatPrice(change.from, currencySymbol)} →{" "}
                    {formatPrice(change.to, currencySymbol)}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {stockCuts.length > 0 && (
          <div
            className="mb-5 flex gap-3 rounded-card border border-amber-300 bg-amber-50 p-4"
            role="status"
          >
            <AlertIcon className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div className="text-sm">
              <p className="font-semibold text-amber-900">
                Часть товара разобрали, пока корзина ждала
              </p>
              <ul className="mt-1.5 space-y-0.5 text-amber-800">
                {stockCuts.map((cut) => (
                  <li key={cut.title} className="tnum">
                    {cut.title}:{" "}
                    {cut.stock > 0
                      ? `осталось ${cut.stock} шт., количество уменьшили`
                      : "закончился, убрали из корзины"}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        <h2 className="mb-4 text-lg font-bold text-brand-900">
          {pluralize(items.length, "позиция", "позиции", "позиций")} в корзине
        </h2>

        <CartLines items={items} currencySymbol={currencySymbol} />

        {/* --------------------------- Форма --------------------------- */}
        <form id={FORM_ID} onSubmit={handleSubmit} className="mt-8" noValidate>
          <h2 className="mb-4 text-lg font-bold text-brand-900">
            Оформление заказа
          </h2>

          <fieldset className="card mb-5 p-4">
            <legend className="px-1 text-sm font-semibold text-brand-900">
              Способ получения
            </legend>
            <div className="space-y-2.5">
              {deliveryMethods.map((entry) => {
                const freeFrom = entry.freeFrom ?? null;
                const free = freeFrom !== null && subtotal >= freeFrom;
                const entryParcel = parcelFor(entry);
                const cost = deliveryPrice(entry, subtotal, entryParcel, form.city);
                return (
                  <label
                    key={entry.id}
                    className={`flex cursor-pointer gap-3 rounded-xl border p-3.5 transition-colors ${
                      entry.id === methodId
                        ? "border-brand-600 bg-brand-50"
                        : "border-brand-100 hover:border-brand-200"
                    }`}
                  >
                    <input
                      type="radio"
                      name="delivery"
                      value={entry.id}
                      checked={entry.id === methodId}
                      onChange={() => setMethodId(entry.id)}
                      className="mt-1 h-4 w-4 shrink-0 border-brand-200 text-brand-700 focus:ring-brand-600"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-baseline justify-between gap-2">
                        <span className="text-sm font-semibold text-brand-900">
                          {entry.name}
                        </span>
                        <span className="tnum text-sm font-semibold text-brand-900">
                          {cost === null
                            ? form.city.trim()
                              ? "уточним"
                              : "по весу"
                            : cost === 0
                              ? "бесплатно"
                              : formatPrice(cost, currencySymbol)}
                        </span>
                      </span>
                      {entry.note && (
                        <span className="mt-1 block text-xs leading-relaxed text-brand-500">
                          {entry.note}
                        </span>
                      )}
                      {entryParcel && (
                        <span className="mt-1 block text-xs leading-relaxed text-brand-500">
                          Вес заказа ≈ {entryParcel.weight.toLocaleString("ru-RU")} кг
                          {entryParcel.glass ? " · стекло, +" + entry.weightTariff?.glassPercent + "% к тарифу" : ""}
                          {!form.city.trim() ? " · укажите город ниже" : ""}
                        </span>
                      )}
                      {free && entry.price > 0 && freeFrom !== null && (
                        <span className="mt-1 flex items-center gap-1 text-xs font-medium text-green-700">
                          <CheckIcon className="h-3.5 w-3.5" />
                          Бесплатно — заказ выше{" "}
                          {formatPrice(freeFrom, currencySymbol)}
                        </span>
                      )}
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          <div className="card space-y-4 p-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="name" className="label">
                  Имя <span className="text-red-600">*</span>
                </label>
                <input
                  id="name"
                  name="name"
                  autoComplete="name"
                  value={form.name}
                  onChange={(event) =>
                    setForm({ ...form, name: event.target.value })
                  }
                  className={`field ${errors.name ? "field-error" : ""}`}
                  aria-invalid={Boolean(errors.name)}
                  aria-describedby={errors.name ? "name-error" : undefined}
                  placeholder="Иван"
                />
                {errors.name && (
                  <p id="name-error" className="mt-1.5 text-xs text-red-600">
                    {errors.name}
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="phone" className="label">
                  Телефон <span className="text-red-600">*</span>
                </label>
                <input
                  id="phone"
                  name="phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  value={form.phone}
                  onChange={(event) =>
                    setForm({ ...form, phone: event.target.value })
                  }
                  className={`field tnum ${errors.phone ? "field-error" : ""}`}
                  aria-invalid={Boolean(errors.phone)}
                  aria-describedby={errors.phone ? "phone-error" : undefined}
                  placeholder="+375 29 123-45-67"
                />
                {errors.phone && (
                  <p id="phone-error" className="mt-1.5 text-xs text-red-600">
                    {errors.phone}
                  </p>
                )}
              </div>
            </div>

            <div>
              <label htmlFor="email" className="label">
                Email <span className="font-normal text-brand-400">— необязательно</span>
              </label>
              <input
                id="email"
                name="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                value={form.email}
                onChange={(event) => setForm({ ...form, email: event.target.value })}
                className={`field ${errors.email ? "field-error" : ""}`}
                aria-invalid={Boolean(errors.email)}
                aria-describedby={errors.email ? "email-error" : undefined}
                placeholder="ivan@example.com"
              />
              {errors.email && (
                <p id="email-error" className="mt-1.5 text-xs text-red-600">
                  {errors.email}
                </p>
              )}
            </div>

            {method?.weightTariff && (
              <div>
                <label htmlFor="city" className="label">
                  Город <span className="text-red-600">*</span>
                </label>
                <input
                  id="city"
                  name="city"
                  autoComplete="address-level2"
                  value={form.city}
                  onChange={(event) => setForm({ ...form, city: event.target.value })}
                  className={`field ${errors.city ? "field-error" : ""}`}
                  aria-invalid={Boolean(errors.city)}
                  aria-describedby={errors.city ? "city-error" : undefined}
                  placeholder="Гродно"
                />
                {errors.city && (
                  <p id="city-error" className="mt-1.5 text-xs text-red-600">
                    {errors.city}
                  </p>
                )}
              </div>
            )}

            {method?.requiresAddress && (
              <div>
                <label htmlFor="address" className="label">
                  Адрес доставки <span className="text-red-600">*</span>
                </label>
                <input
                  id="address"
                  name="address"
                  autoComplete="street-address"
                  value={form.address}
                  onChange={(event) =>
                    setForm({ ...form, address: event.target.value })
                  }
                  className={`field ${errors.address ? "field-error" : ""}`}
                  aria-invalid={Boolean(errors.address)}
                  aria-describedby={errors.address ? "address-error" : undefined}
                  placeholder={method?.weightTariff ? "ул. Советская 10, кв. 5" : "г. Минск, ул. Притыцкого 29, кв. 15"}
                />
                {errors.address && (
                  <p id="address-error" className="mt-1.5 text-xs text-red-600">
                    {errors.address}
                  </p>
                )}
              </div>
            )}

            <div>
              <label htmlFor="comment" className="label">
                Комментарий
              </label>
              <textarea
                id="comment"
                name="comment"
                rows={3}
                value={form.comment}
                onChange={(event) =>
                  setForm({ ...form, comment: event.target.value })
                }
                className="field resize-y"
                placeholder="Модель авто, удобное время звонка, вопросы по совместимости"
              />
              <p className="mt-1.5 text-xs text-brand-400">
                Напишите модель и год автомобиля — проверим совместимость до
                отправки.
              </p>
            </div>

            {signedIn ? (
              <SavedConsentNote />
            ) : (
              <ConsentCheckbox
                id="consent"
                checked={form.consent}
                onChange={(consent) => setForm({ ...form, consent })}
                error={errors.consent}
              />
            )}

            {/* Ловушка для ботов: скрыта и от людей, и от скринридеров. */}
            <div className="hidden" aria-hidden="true">
              <label htmlFor="website">Сайт</label>
              <input
                id="website"
                name="website"
                tabIndex={-1}
                autoComplete="off"
                value={form.website}
                onChange={(event) =>
                  setForm({ ...form, website: event.target.value })
                }
              />
            </div>
          </div>
        </form>

        {status === "failed" && (
          <div className="mt-5 rounded-card border border-red-300 bg-red-50 p-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-red-900">
              <AlertIcon className="h-4 w-4" />
              Заказ не отправился
            </p>
            <p className="mt-1.5 text-sm text-red-800">
              Причина: {failure}. Ничего не потеряно — скопируйте заказ и
              пришлите нам, либо позвоните по номеру{" "}
              <a href={`tel:${phoneHref}`} className="font-semibold underline">
                {phone}
              </a>
              .
            </p>
            <textarea
              readOnly
              value={orderText}
              rows={6}
              className="field mt-3 bg-white text-xs"
              onFocus={(event) => event.currentTarget.select()}
            />
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => navigator.clipboard?.writeText(orderText)}
                className="btn-secondary"
              >
                Скопировать заказ
              </button>
              {telegram && (
                <a
                  href={telegram}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="btn-primary"
                >
                  Открыть Telegram
                </a>
              )}
            </div>
          </div>
        )}

        {/* Сводка и кнопка на узких экранах — сразу под формой. */}
        <div className="mt-6 lg:hidden">{summary}</div>
      </div>

      {/* Сводка и кнопка на широких экранах — липкая колонка справа.
          Кнопка вне тега form, поэтому связана с ней через form="…". */}
      <div className="hidden lg:sticky lg:top-36 lg:block">{summary}</div>
    </div>
  );
}
