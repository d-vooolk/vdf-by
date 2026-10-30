import { getSite } from "@/lib/catalog";
import { clientIp } from "@/lib/client-ip";
import { isLimited, recordHit } from "@/lib/rate-limit";
import { revalidateStockMoves } from "@/lib/stock-revalidate";
import { deliveryPrice, parcelOf } from "@/lib/delivery-quote";
import { formatPhone } from "@/lib/phone";
import { envNumber } from "@/lib/env.mjs";
import { createOrder, markTelegramSent, type OrderItem } from "@/lib/orders";
import { getActingCustomer, getCustomer, getSellerMode } from "@/lib/customer-auth";
import { fillCustomerAddress, getCustomerById, isWholesale, type Customer } from "@/lib/customers";
import { SELLER_MODES } from "@/lib/seller-mode";
import { describeShortage, stockShortages, variantPrice } from "@/lib/prices";
import { sendTelegram } from "@/lib/telegram";
import { buildWholesaleList, type WholesaleList } from "@/lib/wholesale";

/**
 * Приём заказа с витрины.
 *
 * Раньше это был отдельный сервис на порту 8787 (server/order-service.mjs):
 * сайт был статикой, и принять POST ему было нечем. Теперь приложение живое,
 * и отдельный процесс не нужен — вместе с ним ушли и проксирование в nginx,
 * и второй systemd-юнит, и файл прайса, который тот сервис перечитывал с
 * диска, чтобы узнать актуальные цены.
 *
 * Порядок действий важен и сохранён: заявка сначала пишется в базу, потом
 * уходит в Telegram. Если мессенджер недоступен, заказ всё равно сохранён и
 * виден в админке.
 *
 * Бот Telegram подключается в админке: «Настройки» → «Telegram». Переменные
 * TELEGRAM_BOT_TOKEN и TELEGRAM_CHAT_ID остались запасным вариантом, пока
 * настройки там не сохраняли.
 *
 * Переменные окружения:
 *   ORDER_RATE_LIMIT     заявок с одного адреса за 10 минут, по умолчанию 5
 */

// POST-обработчик и так динамический, но объявляем явно: случайное
// кеширование приёма заказов — не та ошибка, которую хочется искать потом.
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 32 * 1024;
const MAX_ITEMS = 50;
const RATE_WINDOW_MS = 10 * 60 * 1000;
const ABUSE_LIMIT = 40;

const rateLimit = envNumber("ORDER_RATE_LIMIT", 5);

/* ------------------------------------------------------------------ */
/* Ограничение частоты                                                 */
/* ------------------------------------------------------------------ */

/**
 * Два независимых счётчика, и это принципиально.
 *
 * accepted — сколько заказов с адреса принято. Здесь лимит жёсткий: пять
 * заказов за десять минут с одного человека — уже странно.
 *
 * attempts — сколько запросов вообще пришло, включая отклонённые. Лимит
 * гораздо выше, потому что отказ по валидации — это обычно живой человек,
 * который опечатался в телефоне. Если считать такие попытки вместе с
 * принятыми заказами, клиент с тремя опечатками получит блокировку на
 * десять минут и просто уйдёт.
 */

/* ------------------------------------------------------------------ */
/* Проверка заявки                                                     */
/* ------------------------------------------------------------------ */

function clean(value: unknown, limit: number): string {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

interface ValidatedOrder {
  name: string;
  phone: string;
  phoneDigits: string;
  email: string;
  consentAt: number;
  comment: string;
  deliveryId: string;
  deliveryName: string;
  address: string;
  addressRequired: boolean;
  deliveryCost: number;
  items: OrderItem[];
  subtotal: number;
  total: number;
  currency: string;
  notes: string[];
}

/**
 * Возвращает { order } или { error }.
 *
 * Суммы пересчитываются по серверному прайсу: цене из запроса мы не верим.
 * Расхождение не отклоняет заказ, а попадает в сообщение менеджеру и в
 * карточку заказа — так менеджер видит, что что-то не сходится, а покупатель
 * с честной корзиной не получает отказ на ровном месте.
 */
function validate(
  payload: unknown,
  wholesale: WholesaleList | null,
  account: Customer | null,
): { order?: ValidatedOrder; error?: string } {
  if (typeof payload !== "object" || payload === null) {
    return { error: "Пустой запрос" };
  }

  const body = payload as Record<string, unknown>;
  const customer = (body.customer ?? {}) as Record<string, unknown>;

  const name = clean(customer.name, 120) || account?.name.slice(0, 120) || "";
  const phone = clean(customer.phone, 40) || (account ? formatPhone(account.phone) : "");
  const phoneDigits =
    clean(customer.phoneDigits, 20).replace(/\D/g, "") || (account?.phone ?? "");

  const email = clean(customer.email, 120);

  if (name.length < 2) return { error: "Не указано имя" };
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "Некорректный email" };
  }
  if (body.consent !== true && !account) {
    return { error: "Нет согласия на обработку персональных данных" };
  }
  if (phoneDigits.length < 9 || phoneDigits.length > 13) {
    return { error: "Некорректный телефон" };
  }

  if (!Array.isArray(body.items) || body.items.length === 0) {
    return { error: "Пустая корзина" };
  }
  if (body.items.length > MAX_ITEMS) {
    return { error: "Слишком много позиций" };
  }

  const notes: string[] = [];
  let serverTotal = 0;

  const unknown = (body.items as unknown[])
    .map((raw) => (raw ?? {}) as Record<string, unknown>)
    .filter((line) => !variantPrice(clean(line.key, 200)))
    .map((line) => clean(line.title, 200) || "позиция");
  if (unknown.length) {
    return { error: `Этих позиций больше нет в каталоге: ${unknown.join(", ")}. Обновите корзину` };
  }

  const items: OrderItem[] = (body.items as unknown[]).map((raw) => {
    const line = (raw ?? {}) as Record<string, unknown>;
    const key = clean(line.key, 200);
    const qty = Math.max(1, Math.min(99, Math.floor(Number(line.qty) || 1)));
    const claimed = Number(line.price) || 0;
    const title = clean(line.title, 200);

    const retail = variantPrice(key);
    const special = wholesale?.[key];
    const actual = retail && special ? { ...retail, price: special } : retail;
    const price = actual?.price ?? 0;

    if (actual && Math.abs(actual.price - claimed) > 0.001) {
      notes.push(`«${title}»: в заявке ${claimed}, в прайсе ${actual.price}`);
    }
    if (actual && !actual.inStock) {
      notes.push(`«${title}» помечен как отсутствующий`);
    }
    if (actual && actual.price <= 0) {
      notes.push(`у «${title}» не указана цена — назвать её клиенту`);
    }

    serverTotal += price * qty;

    return {
      key,
      title,
      options: clean(line.options, 200),
      sku: clean(line.sku, 60) || null,
      qty,
      price,
      sum: Math.round(price * qty * 100) / 100,
      url: clean(line.url, 300),
    };
  });

  const shortages = stockShortages(items);
  if (shortages.length) {
    return { error: `Столько нет в наличии: ${shortages.map(describeShortage).join("; ")}` };
  }

  const delivery = (body.delivery ?? {}) as Record<string, unknown>;
  const deliveryId = clean(delivery.id, 40);

  /**
   * Быстрый заказ со страницы товара: только имя и телефон.
   *
   * Способ получения и адрес там не спрашиваются намеренно — весь смысл
   * формы в том, что она из двух полей. Менеджер всё равно перезванивает и
   * согласовывает доставку, поэтому адрес выясняется в том же разговоре, а
   * не в форме, которую из-за третьего поля половина не дозаполняет.
   */
  const quick = body.quick === true;

  // Стоимость доставки берём свою, из настроек, а не из запроса — по той же
  // причине, по которой не верим ценам товаров.
  const method = getSite().delivery.methods.find(
    (entry) => entry.id === deliveryId,
  );
  if (!method) return { error: "Не выбран способ доставки" };

  const city = clean(delivery.city, 80);
  const parcel = method.weightTariff
    ? parcelOf(
        items.map((item) => ({
          weight: variantPrice(item.key)?.weight ?? null,
          categoryId: variantPrice(item.key)?.category ?? "",
          qty: item.qty,
        })),
        method.weightTariff,
      )
    : null;
  if (method.weightTariff && !city && !quick) return { error: "Не указан город доставки" };
  const quoted = deliveryPrice(method, serverTotal, parcel, city);
  const deliveryCost = quoted ?? 0;
  if (parcel && quoted === null) {
    notes.push(`вес заказа ${parcel.weight} кг — стоимость доставки «${method.name}» посчитать вручную`);
  }

  const quickFromGuest = quick && !account;
  const staffPurchase = quick && account?.staff === true;
  const street = clean(delivery.address, 300);
  const address =
    (city && street ? `${city}, ${street}` : street) ||
    (quick && method.requiresAddress ? (account?.address.slice(0, 300) ?? "") : "");

  if (method.requiresAddress && !quickFromGuest && !staffPurchase && address.length < 5) {
    return { error: "Не указан адрес доставки" };
  }
  if (quickFromGuest) notes.push("быстрый заказ со страницы товара — уточните доставку");

  const subtotal = Math.round(serverTotal * 100) / 100;
  const total = Math.round((serverTotal + deliveryCost) * 100) / 100;

  // Итог, который видел покупатель на экране. Если он разошёлся с нашим —
  // менеджер должен об этом знать до звонка, а не узнать при выдаче.
  const claimedTotal = Number(body.total) || 0;
  if (claimedTotal > 0 && Math.abs(claimedTotal - total) > 0.01) {
    notes.push(
      `итог на сайте был ${claimedTotal}, пересчитанный — ${total}`,
    );
  }

  return {
    order: {
      name,
      phone,
      phoneDigits,
      email,
      consentAt: body.consent === true || !account ? Date.now() : account.consentAt,
      comment: clean(customer.comment, 1000),
      deliveryId,
      deliveryName: method.name,
      address,
      addressRequired: method.requiresAddress,
      deliveryCost,
      items,
      subtotal,
      total,
      currency: getSite().currency,
      notes,
    },
  };
}

/* ------------------------------------------------------------------ */
/* Telegram                                                            */
/* ------------------------------------------------------------------ */

function escapeHtml(text: string): string {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function money(value: number, currency: string): string {
  return `${value.toFixed(2)} ${currency}`;
}

function buildMessage(
  id: number,
  order: ValidatedOrder,
  referer: string,
): string {
  const lines = [
    `<b>🚗 Заказ №${id} с сайта</b>`,
    "",
    ...order.items.map(
      (item) =>
        `• ${escapeHtml(item.title)}${item.options ? ` — <i>${escapeHtml(item.options)}</i>` : ""}\n` +
        `   ${item.qty} шт. × ${money(item.price, order.currency)} = <b>${money(item.sum, order.currency)}</b>` +
        (item.sku ? `\n   арт. ${escapeHtml(item.sku)}` : ""),
    ),
    "",
    `Товары: ${money(order.subtotal, order.currency)}`,
    `${escapeHtml(order.deliveryName || "Доставка")}: ${
      order.deliveryCost === 0
        ? "бесплатно"
        : money(order.deliveryCost, order.currency)
    }`,
    `<b>Итого: ${money(order.total, order.currency)}</b>`,
    "",
    `<b>Клиент:</b> ${escapeHtml(order.name)}`,
    `<b>Телефон:</b> <a href="tel:+${order.phoneDigits}">${escapeHtml(order.phone)}</a>`,
  ];

  if (order.email) lines.push(`<b>Email:</b> ${escapeHtml(order.email)}`);
  if (order.address) lines.push(`<b>Адрес:</b> ${escapeHtml(order.address)}`);
  if (order.comment) {
    lines.push(`<b>Комментарий:</b> ${escapeHtml(order.comment)}`);
  }
  if (order.notes.length) {
    lines.push(
      "",
      "⚠️ <b>Проверьте:</b>",
      ...order.notes.map((note) => `• ${escapeHtml(note)}`),
    );
  }
  if (referer) lines.push("", `<i>Страница: ${escapeHtml(referer)}</i>`);

  return lines.join("\n");
}

/* ------------------------------------------------------------------ */
/* Обработчик                                                          */
/* ------------------------------------------------------------------ */

export async function POST(request: Request) {
  const ip = clientIp(request);

  // Флуд запросами — отсекаем сразу, до разбора тела.
  if (isLimited(`order-try:${ip}`, ABUSE_LIMIT, RATE_WINDOW_MS)) {
    return Response.json(
      { error: "Слишком много запросов. Позвоните нам — оформим по телефону." },
      { status: 429 },
    );
  }
  recordHit(`order-try:${ip}`);

  const signed = await getCustomer();
  const customer = await getActingCustomer();
  const staffBuyer = customer?.staff === true;
  const sellerMode = signed?.seller && !staffBuyer ? await getSellerMode() : null;

  if (!signed?.staff && isLimited(`order:${ip}`, rateLimit, RATE_WINDOW_MS)) {
    return Response.json(
      { error: "Слишком много заявок. Позвоните нам — оформим по телефону." },
      { status: 429 },
    );
  }

  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) {
    return Response.json({ error: "Слишком большой запрос" }, { status: 413 });
  }
  const raw = await request.text();
  if (Buffer.byteLength(raw) > MAX_BODY_BYTES) {
    return Response.json({ error: "Слишком большой запрос" }, { status: 413 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return Response.json({ error: "Некорректный JSON" }, { status: 400 });
  }

  // Скрытое поле формы заполняют только боты. Отвечаем «принято», чтобы бот
  // не искал обход.
  if ((payload as Record<string, unknown>)?.website) {
    return Response.json({ ok: true });
  }

  const companyId = Number((payload as Record<string, unknown>)?.companyId) || 0;
  const company = sellerMode === "wholesale" && companyId ? getCustomerById(companyId) : null;
  if (companyId && (!company || company.wholesaleStatus !== "approved" || company.staff)) {
    return Response.json({ error: "Компания не найдена среди оптовиков" }, { status: 400 });
  }
  if (company) {
    const body = payload as Record<string, unknown>;
    body.customer = { ...(body.customer as Record<string, unknown>), name: "", phone: "", phoneDigits: "" };
  }
  const buyer = company ?? customer;

  const wholesaleBuyer = isWholesale(customer);
  const { order, error } = validate(
    payload,
    wholesaleBuyer ? buildWholesaleList() : null,
    buyer,
  );
  if (error || !order) {
    // Квоту на заказы не списываем: опечатка в телефоне не должна приближать
    // живого клиента к блокировке.
    return Response.json({ error: error ?? "Заявка не принята" }, { status: 400 });
  }

  recordHit(`order:${ip}`);

  if (buyer && !buyer.address && order.address && order.addressRequired) {
    fillCustomerAddress(buyer.id, order.address);
  }

  const referer = request.headers.get("referer") ?? "";

  let id: number;
  try {
    if (staffBuyer) order.notes.unshift("внутренняя покупка сотрудника — цены оптовые");
    else if (wholesaleBuyer) order.notes.unshift("оптовый покупатель — цены оптовые");
    if (sellerMode) {
      const label = SELLER_MODES.find((mode) => mode.id === sellerMode)?.label ?? sellerMode;
      order.notes.unshift(
        company
          ? `оформил продавец ${signed?.name ?? ""} в режиме «${label}» для компании`
          : `оформил продавец в режиме «${label}»`,
      );
    }
    const created = createOrder({
      ...order,
      ip,
      referer,
      customerId: buyer?.id ?? null,
      sellerId: sellerMode && signed ? signed.id : null,
      wholesale: wholesaleBuyer,
      staff: staffBuyer,
    });
    id = created.id;
    revalidateStockMoves(created.moved.map((move) => move.productId));
  } catch (dbError) {
    console.error("[order] не удалось записать заказ:", dbError);
    return Response.json(
      { error: "Не удалось принять заказ. Позвоните нам, пожалуйста." },
      { status: 502 },
    );
  }

  const sent = staffBuyer ? null : await sendTelegram(buildMessage(id, order, referer));
  if (sent?.ok) {
    markTelegramSent(id);
  } else if (sent) {
    // Заказ уже в базе и виден в админке — это не повод отвечать ошибкой.
    console.error(`[order] Telegram не принял заказ №${id}: ${sent.reason}`);
  }

  console.log(
    `[order] №${id} · ${order.phone} · ${order.items.length} поз. · ` +
      `${order.total} ${order.currency} · telegram:${sent ? (sent.ok ? "да" : "нет") : "сотрудник"}`,
  );

  return Response.json({ ok: true, id, total: order.total });
}
