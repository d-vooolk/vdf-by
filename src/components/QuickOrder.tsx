"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { CheckIcon, CloseIcon, SpinnerIcon } from "@/components/icons";
import { trackOrder } from "@/lib/analytics";

/**
 * Быстрый заказ со страницы товара: имя и телефон, больше ничего.
 *
 * Отдельно от корзины и намеренно короче её. Покупатель, который уже выбрал
 * линзу и хочет её получить, не должен проходить через корзину, выбор
 * способа доставки и поле адреса — на этом пути теряется больше заказов,
 * чем приносит точность данных. Всё остальное менеджер выясняет в звонке,
 * который всё равно будет: онлайн-оплаты на сайте нет.
 *
 * Заявка уходит в тот же /api/order, что и корзина, с пометкой quick —
 * сервер по ней не требует адрес и дописывает в сообщение «уточните
 * доставку». Значит, быстрый заказ так же попадает в админку и в Telegram,
 * а не в отдельный канал, который однажды забудут проверить.
 */

interface QuickOrderProps {
  orderEndpoint: string;
  /** Способ получения по умолчанию — из настроек магазина. */
  deliveryId: string;
  item: {
    key: string;
    productId: string;
    slug: string;
    title: string;
    options: string;
    sku: string | null;
    price: number;
  };
  qty: number;
  currency: string;
  phone: string;
  phoneHref: string;
  disabled?: boolean;
}

function digits(value: string): string {
  return value.replace(/\D/g, "");
}

export function QuickOrder({
  orderEndpoint,
  deliveryId,
  item,
  qty,
  currency,
  phone,
  phoneHref,
  disabled = false,
}: QuickOrderProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [tel, setTel] = useState("");
  const [website, setWebsite] = useState(""); // ловушка для ботов
  const [errors, setErrors] = useState<{ name?: string; tel?: string }>({});
  const [status, setStatus] = useState<"idle" | "sending" | "done" | "failed">(
    "idle",
  );
  const [failure, setFailure] = useState("");

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (website) return;

    const next: { name?: string; tel?: string } = {};
    if (name.trim().length < 2) next.name = "Как к вам обращаться?";
    const phoneDigits = digits(tel);
    if (phoneDigits.length < 9) next.tel = "Введите номер — перезвоним по нему";
    else if (phoneDigits.length > 13) next.tel = "Слишком длинный номер";
    setErrors(next);
    if (Object.keys(next).length) return;

    setStatus("sending");
    setFailure("");

    try {
      const response = await fetch(orderEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quick: true,
          customer: {
            name: name.trim(),
            phone: tel.trim(),
            phoneDigits,
            comment: "Быстрый заказ со страницы товара",
          },
          delivery: { id: deliveryId, address: "" },
          items: [
            {
              key: item.key,
              productId: item.productId,
              title: item.title,
              options: item.options,
              sku: item.sku,
              price: item.price,
              qty,
              sum: item.price * qty,
              url: `/product/${item.slug}/`,
            },
          ],
          subtotal: item.price * qty,
          total: item.price * qty,
          currency,
        }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error ?? `сервер ответил ${response.status}`);
      }

      const accepted = (await response.json().catch(() => null)) as {
        id?: number;
      } | null;

      trackOrder({
        id: accepted?.id ?? 0,
        total: item.price * qty,
        currency,
        source: "quick",
        items: [
          {
            id: item.sku ?? item.productId,
            name: item.title,
            price: item.price,
            qty,
          },
        ],
      });

      setStatus("done");
    } catch (error) {
      setStatus("failed");
      setFailure(
        error instanceof Error ? error.message : "не удалось отправить заявку",
      );
    }
  };

  const close = () => {
    setOpen(false);
    // Форму сбрасываем при закрытии, а не при открытии: иначе человек,
    // случайно промахнувшийся мимо кнопки, теряет уже введённый номер.
    if (status === "done") {
      setName("");
      setTel("");
      setStatus("idle");
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={disabled}
        className="btn-accent w-full"
      >
        Купить в один клик
      </button>

      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-[80] flex items-end justify-center bg-brand-900/60 p-0 sm:items-center sm:p-4"
            onClick={close}
            role="dialog"
            aria-modal="true"
            aria-label="Быстрый заказ"
          >
            <div
              className="w-full max-w-md rounded-t-card bg-white p-5 shadow-pop sm:rounded-card sm:p-6"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="mb-4 flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-bold text-brand-900">
                    {status === "done" ? "Заявка принята" : "Быстрый заказ"}
                  </h2>
                  <p className="mt-1 text-sm text-brand-500">
                    {status === "done"
                      ? "Менеджер перезвонит, подтвердит наличие и согласует доставку."
                      : "Оставьте имя и телефон — перезвоним и всё оформим сами."}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={close}
                  className="-mt-1 -mr-1 rounded-xl p-2 text-brand-400 hover:bg-brand-50"
                  aria-label="Закрыть"
                >
                  <CloseIcon className="h-5 w-5" />
                </button>
              </div>

              {status === "done" ? (
                <div className="flex items-center gap-3 rounded-card bg-green-50 p-4">
                  <CheckIcon className="h-6 w-6 shrink-0 text-green-600" />
                  <p className="text-sm text-green-900">
                    {item.title}
                    {item.options ? ` (${item.options})` : ""} — {qty} шт.
                  </p>
                </div>
              ) : (
                <form onSubmit={submit} noValidate>
                  <p className="mb-4 rounded-card bg-brand-50 p-3 text-sm text-brand-600">
                    {item.title}
                    {item.options ? (
                      <span className="block text-xs text-brand-400">
                        {item.options}
                      </span>
                    ) : null}
                  </p>

                  <div className="space-y-4">
                    <div>
                      <label htmlFor="quick-name" className="label">
                        Имя <span className="text-red-600">*</span>
                      </label>
                      <input
                        id="quick-name"
                        autoComplete="name"
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        className={`field ${errors.name ? "field-error" : ""}`}
                        placeholder="Иван"
                      />
                      {errors.name && (
                        <p className="mt-1.5 text-xs text-red-600">
                          {errors.name}
                        </p>
                      )}
                    </div>

                    <div>
                      <label htmlFor="quick-phone" className="label">
                        Телефон <span className="text-red-600">*</span>
                      </label>
                      <input
                        id="quick-phone"
                        type="tel"
                        inputMode="tel"
                        autoComplete="tel"
                        value={tel}
                        onChange={(event) => setTel(event.target.value)}
                        className={`field tnum ${errors.tel ? "field-error" : ""}`}
                        placeholder="+375 29 123-45-67"
                      />
                      {errors.tel && (
                        <p className="mt-1.5 text-xs text-red-600">
                          {errors.tel}
                        </p>
                      )}
                    </div>

                    <div className="hidden" aria-hidden="true">
                      <label htmlFor="quick-website">Сайт</label>
                      <input
                        id="quick-website"
                        tabIndex={-1}
                        autoComplete="off"
                        value={website}
                        onChange={(event) => setWebsite(event.target.value)}
                      />
                    </div>
                  </div>

                  {status === "failed" && (
                    <p className="mt-4 rounded-card border border-red-300 bg-red-50 p-3 text-sm text-red-800">
                      Не отправилось: {failure}. Позвоните, пожалуйста, по
                      номеру{" "}
                      <a
                        href={`tel:${phoneHref}`}
                        className="font-semibold underline"
                      >
                        {phone}
                      </a>
                      .
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={status === "sending"}
                    className="btn-primary mt-5 w-full"
                  >
                    {status === "sending" ? (
                      <>
                        <SpinnerIcon className="h-5 w-5 animate-spin" />
                        Отправляем…
                      </>
                    ) : (
                      "Оформить заказ"
                    )}
                  </button>

                  <p className="mt-3 text-center text-xs text-brand-400">
                    Онлайн-оплаты нет. Оплата при получении.
                  </p>
                </form>
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
