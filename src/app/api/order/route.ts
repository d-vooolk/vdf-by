import { getSite } from "@/lib/catalog";
import { env, envNumber } from "@/lib/env.mjs";
import { createOrder, markTelegramSent, type OrderItem } from "@/lib/orders";
import { getCustomer } from "@/lib/customer-auth";
import { isWholesale } from "@/lib/customers";
import { buildPriceList } from "@/lib/prices";
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
 * Переменные окружения:
 *   TELEGRAM_BOT_TOKEN   токен бота от @BotFather
 *   TELEGRAM_CHAT_ID     куда писать: ваш id или id группы
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
const accepted = new Map<string, number[]>();
const attempts = new Map<string, number[]>();

function tooMany(store: Map<string, number[]>, ip: string, limit: number) {
  const now = Date.now();
  const recent = (store.get(ip) ?? []).filter(
    (time) => now - time < RATE_WINDOW_MS,
  );
  store.set(ip, recent);
  return recent.length >= limit;
}

function record(store: Map<string, number[]>, ip: string) {
  const recent = store.get(ip) ?? [];
  recent.push(Date.now());
  store.set(ip, recent);
  // Чистим карту здесь же: отдельный setInterval в route handler'е пережил бы
  // не всякую пересборку в dev и остался бы висеть.
  if (store.size > 5000) {
    const now = Date.now();
    for (const [key, times] of store) {
      if (!times.some((time) => now - time < RATE_WINDOW_MS)) store.delete(key);
    }
  }
}

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
): { order?: ValidatedOrder; error?: string } {
  if (typeof payload !== "object" || payload === null) {
    return { error: "Пустой запрос" };
  }

  const body = payload as Record<string, unknown>;
  const customer = (body.customer ?? {}) as Record<string, unknown>;

  const name = clean(customer.name, 120);
  const phone = clean(customer.phone, 40);
  const phoneDigits = clean(customer.phoneDigits, 20).replace(/\D/g, "");

  const email = clean(customer.email, 120);

  if (name.length < 2) return { error: "Не указано имя" };
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "Некорректный email" };
  }
  if (body.consent !== true) {
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

  const prices = buildPriceList();
  const hasPrices = Object.keys(prices).length > 0;
  const notes: string[] = [];
  let serverTotal = 0;

  const items: OrderItem[] = (body.items as unknown[]).map((raw) => {
    const line = (raw ?? {}) as Record<string, unknown>;
    const key = clean(line.key, 200);
    const qty = Math.max(1, Math.min(99, Math.floor(Number(line.qty) || 1)));
    const claimed = Number(line.price) || 0;
    const title = clean(line.title, 200);

    const retail = hasPrices ? prices[key] : undefined;
    const actual =
      retail && wholesale?.[key] ? { ...retail, price: wholesale[key] } : retail;
    const price = actual ? actual.price : claimed;

    if (hasPrices && !actual) {
      notes.push(`позиции «${title}» нет в текущем прайсе`);
    } else if (actual && Math.abs(actual.price - claimed) > 0.001) {
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

  const delivery = (body.delivery ?? {}) as Record<string, unknown>;
  const deliveryId = clean(delivery.id, 40);
  const address = clean(delivery.address, 300);

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

  const free = method.freeFrom != null && serverTotal >= method.freeFrom;
  const deliveryCost = free ? 0 : method.price;

  if (method.requiresAddress && !quick && address.length < 5) {
    return { error: "Не указан адрес доставки" };
  }
  if (quick) notes.push("быстрый заказ со страницы товара — уточните доставку");

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
      consentAt: Date.now(),
      comment: clean(customer.comment, 1000),
      deliveryId,
      deliveryName: method.name,
      address,
      deliveryCost,
      items,
      subtotal,
      total,
      currency: clean(body.currency, 10) || getSite().currency,
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

async function sendToTelegram(
  text: string,
): Promise<{ ok: boolean; reason?: string }> {
  const token = env("TELEGRAM_BOT_TOKEN", "");
  const chatId = env("TELEGRAM_CHAT_ID", "");
  if (!token || !chatId) return { ok: false, reason: "не настроен" };

  // Telegram обычно отвечает быстро; если завис — не держим клиента.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: "HTML",
          disable_web_page_preview: true,
        }),
        signal: controller.signal,
        cache: "no-store",
      },
    );
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      return { ok: false, reason: `HTTP ${response.status} ${body.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: (error as Error).message };
  } finally {
    clearTimeout(timeout);
  }
}

/* ------------------------------------------------------------------ */
/* Обработчик                                                          */
/* ------------------------------------------------------------------ */

function clientIp(request: Request): string {
  // Приложение работает за nginx, который проставляет X-Forwarded-For.
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

export async function POST(request: Request) {
  const ip = clientIp(request);

  // Флуд запросами — отсекаем сразу, до разбора тела.
  if (tooMany(attempts, ip, ABUSE_LIMIT)) {
    return Response.json(
      { error: "Слишком много запросов. Позвоните нам — оформим по телефону." },
      { status: 429 },
    );
  }
  record(attempts, ip);

  if (tooMany(accepted, ip, rateLimit)) {
    return Response.json(
      { error: "Слишком много заявок. Позвоните нам — оформим по телефону." },
      { status: 429 },
    );
  }

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) {
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

  const customer = await getCustomer();
  const wholesaleBuyer = isWholesale(customer);
  const { order, error } = validate(payload, wholesaleBuyer ? buildWholesaleList() : null);
  if (error || !order) {
    // Квоту на заказы не списываем: опечатка в телефоне не должна приближать
    // живого клиента к блокировке.
    return Response.json({ error: error ?? "Заявка не принята" }, { status: 400 });
  }

  record(accepted, ip);

  const referer = request.headers.get("referer") ?? "";

  let id: number;
  try {
    if (wholesaleBuyer) order.notes.unshift("оптовый покупатель — цены оптовые");
    id = createOrder({
      ...order,
      ip,
      referer,
      customerId: customer?.id ?? null,
      wholesale: wholesaleBuyer,
    });
  } catch (dbError) {
    console.error("[order] не удалось записать заказ:", dbError);
    return Response.json(
      { error: "Не удалось принять заказ. Позвоните нам, пожалуйста." },
      { status: 502 },
    );
  }

  const sent = await sendToTelegram(buildMessage(id, order, referer));
  if (sent.ok) {
    markTelegramSent(id);
  } else {
    // Заказ уже в базе и виден в админке — это не повод отвечать ошибкой.
    console.error(`[order] Telegram не принял заказ №${id}: ${sent.reason}`);
  }

  console.log(
    `[order] №${id} · ${order.phone} · ${order.items.length} поз. · ` +
      `${order.total} ${order.currency} · telegram:${sent.ok ? "да" : "нет"}`,
  );

  return Response.json({ ok: true, id, total: order.total });
}
