"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { ConsentCheckbox } from "@/components/ConsentCheckbox";
import { CartLines } from "@/components/CartLines";
import {
  AlertIcon,
  CartIcon,
  CheckIcon,
  SpinnerIcon,
  TruckIcon,
} from "@/components/icons";
import { trackOrder } from "@/lib/analytics";
import { formatPrice, pluralize } from "@/lib/format";
import type { DeliveryMethod } from "@/lib/schema";
import { useAccount } from "@/store/account";
import { cartTotal, useCart, useHydrated } from "@/store/cart";

/**
 * Корзина и оформление заказа на одной странице.
 *
 * Онлайн-оплаты нет: заказ уходит менеджеру в Telegram, тот перезванивается и
 * подтверждает наличие. Поэтому и шаг один — лишний экран между корзиной и
 * отправкой только теряет клиентов.
 */

const FORM_ID = "order-form";

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
  const [failure, setFailure] = useState("");
  const [priceChanges, setPriceChanges] = useState<
    Array<{ title: string; from: number; to: number }>
  >([]);

  const subtotal = cartTotal(items);
  const method = deliveryMethods.find((entry) => entry.id === methodId);

  const deliveryCost = useMemo(() => {
    if (!method) return 0;
    if (method.freeFrom != null && subtotal >= method.freeFrom) return 0;
    return method.price;
  }, [method, subtotal]);

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
      .then((retail: Record<string, { price: number; inStock: boolean }> | null) => {
        if (cancelled || !retail) return;
        const prices = { ...retail };
        for (const [key, price] of Object.entries(wholesale ?? {})) {
          if (prices[key]) prices[key] = { ...prices[key], price };
        }
        const changes = reprice(prices);
        if (changes.length) setPriceChanges(changes);
      })
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
    if (method?.requiresAddress && form.address.trim().length < 5) {
      next.address = "Укажите адрес: улица, дом, квартира";
    }
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      next.email = "Проверьте адрес почты";
    }
    if (!form.consent) {
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
      `Доставка: ${method?.name ?? "—"}${deliveryCost ? ` (${formatPrice(deliveryCost, currencySymbol)})` : " (бесплатно)"}`,
      `Итого: ${formatPrice(total, currencySymbol)}`,
      "",
      `Имя: ${form.name}`,
      `Телефон: ${form.phone}`,
      form.email ? `Email: ${form.email}` : "",
      form.address ? `Адрес: ${form.address}` : "",
      form.comment ? `Комментарий: ${form.comment}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  }, [items, method, deliveryCost, total, form, currencySymbol]);

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
        throw new Error(`сервер ответил ${response.status}`);
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

      clear();
      router.push("/order/success/");
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
      total={total}
      methodName={method?.name}
      currencySymbol={currencySymbol}
      payment={payment}
      sending={status === "sending"}
    />
  );

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start lg:gap-10">
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
                const cost = free ? 0 : entry.price;
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
                          {cost === 0
                            ? "бесплатно"
                            : formatPrice(cost, currencySymbol)}
                        </span>
                      </span>
                      {entry.note && (
                        <span className="mt-1 block text-xs leading-relaxed text-brand-500">
                          {entry.note}
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
                  placeholder="г. Минск, ул. Притыцкого 29, кв. 15"
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

            <ConsentCheckbox
              id="consent"
              checked={form.consent}
              onChange={(consent) => setForm({ ...form, consent })}
              error={errors.consent}
            />

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

/* ------------------------------------------------------------------ */
/* Сводка заказа                                                       */
/* ------------------------------------------------------------------ */

interface OrderSummaryProps {
  subtotal: number;
  deliveryCost: number;
  total: number;
  methodName?: string;
  currencySymbol: string;
  payment: string[];
  sending: boolean;
}

function OrderSummary({
  subtotal,
  deliveryCost,
  total,
  methodName,
  currencySymbol,
  payment,
  sending,
}: OrderSummaryProps) {
  return (
    <div className="card p-5">
      <h2 className="mb-4 text-base font-bold text-brand-900">Ваш заказ</h2>

      <dl className="space-y-2.5 text-sm">
        <div className="flex justify-between">
          <dt className="text-brand-500">Товары</dt>
          <dd className="tnum font-medium text-brand-900">
            {formatPrice(subtotal, currencySymbol)}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-brand-500">{methodName ?? "Доставка"}</dt>
          <dd className="tnum shrink-0 font-medium text-brand-900">
            {deliveryCost === 0
              ? "бесплатно"
              : formatPrice(deliveryCost, currencySymbol)}
          </dd>
        </div>
        <div className="flex items-baseline justify-between border-t border-brand-100 pt-2.5">
          <dt className="text-base font-bold text-brand-900">Итого</dt>
          <dd className="tnum text-xl font-semibold text-brand-900">
            {formatPrice(total, currencySymbol)}
          </dd>
        </div>
      </dl>

      <button
        type="submit"
        form={FORM_ID}
        disabled={sending}
        className="btn-primary mt-5 w-full"
      >
        {sending ? (
          <>
            <SpinnerIcon className="h-5 w-5 animate-spin" />
            Отправляем…
          </>
        ) : (
          "Оформить заказ"
        )}
      </button>

      <p className="mt-3 flex gap-2 rounded-xl bg-brand-50 p-3 text-xs leading-relaxed text-brand-500">
        <TruckIcon className="mt-0.5 h-4 w-4 shrink-0 text-brand-700" />
        Менеджер перезвонит, подтвердит наличие и согласует время доставки.
        Онлайн-оплаты нет.
      </p>

      {payment.length > 0 && (
        <div className="mt-4">
          <p className="mb-1.5 text-xs font-semibold text-brand-900">Оплата</p>
          <ul className="space-y-1 text-xs text-brand-500">
            {payment.map((option) => (
              <li key={option} className="flex gap-1.5">
                <CheckIcon className="mt-0.5 h-3 w-3 shrink-0 text-green-600" />
                {option}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
