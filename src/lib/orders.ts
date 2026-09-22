import { getDb } from "./db";
import {
  isOrderStatus,
  type Order,
  type OrderItem,
  type OrderStatus,
} from "./order-types";

/**
 * Заказы: приём с витрины и работа с ними в админке.
 *
 * Раньше заявки жили в orders.jsonl рядом с сервисом заказов, и всё, что с
 * ними можно было сделать, — открыть файл в редакторе. Теперь это таблица:
 * есть история, статусы и поиск по телефону.
 *
 * Типы и список статусов лежат отдельно, в order-types.ts: их импортируют
 * клиентские компоненты, а этот модуль тянет за собой драйвер базы.
 */

export type { Order, OrderItem, OrderStatus };

interface OrderRow {
  id: number;
  created_at: number;
  status: string;
  name: string;
  phone: string;
  phone_digits: string;
  email: string;
  consent_at: number | null;
  comment: string;
  delivery_id: string;
  delivery_name: string;
  address: string;
  delivery_cost: number;
  subtotal: number;
  total: number;
  currency: string;
  items: string;
  notes: string;
  ip: string;
  referer: string;
  telegram_sent: number;
  admin_note: string;
}

function toOrder(row: OrderRow): Order {
  return {
    id: row.id,
    createdAt: row.created_at,
    status: isOrderStatus(row.status) ? row.status : "new",
    name: row.name,
    phone: row.phone,
    phoneDigits: row.phone_digits,
    email: row.email,
    consentAt: row.consent_at,
    comment: row.comment,
    deliveryId: row.delivery_id,
    deliveryName: row.delivery_name,
    address: row.address,
    deliveryCost: row.delivery_cost,
    subtotal: row.subtotal,
    total: row.total,
    currency: row.currency,
    items: JSON.parse(row.items) as OrderItem[],
    notes: JSON.parse(row.notes) as string[],
    ip: row.ip,
    referer: row.referer,
    telegramSent: row.telegram_sent === 1,
    adminNote: row.admin_note,
  };
}

const COLUMNS = `id, created_at, status, name, phone, phone_digits, email, consent_at, comment,
  delivery_id, delivery_name, address, delivery_cost, subtotal, total,
  currency, items, notes, ip, referer, telegram_sent, admin_note`;

/* ------------------------------------------------------------------ */
/* Приём заявки                                                        */
/* ------------------------------------------------------------------ */

export interface NewOrder {
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
  subtotal: number;
  total: number;
  currency: string;
  items: OrderItem[];
  notes: string[];
  ip: string;
  referer: string;
}

/**
 * Записывает заявку и возвращает её номер.
 *
 * Вызывается до отправки в Telegram — специально: если мессенджер недоступен,
 * заказ уже лежит в базе и виден в админке, а не потерян.
 */
export function createOrder(order: NewOrder): number {
  const result = getDb()
    .prepare(
      `INSERT INTO orders
         (created_at, status, name, phone, phone_digits, email, consent_at, comment,
          delivery_id, delivery_name, address, delivery_cost,
          subtotal, total, currency, items, notes, ip, referer)
       VALUES
         (@createdAt, 'new', @name, @phone, @phoneDigits, @email, @consentAt, @comment,
          @deliveryId, @deliveryName, @address, @deliveryCost,
          @subtotal, @total, @currency, @items, @notes, @ip, @referer)`,
    )
    .run({
      createdAt: Date.now(),
      name: order.name,
      phone: order.phone,
      phoneDigits: order.phoneDigits,
      email: order.email,
      consentAt: order.consentAt,
      comment: order.comment,
      deliveryId: order.deliveryId,
      deliveryName: order.deliveryName,
      address: order.address,
      deliveryCost: order.deliveryCost,
      subtotal: order.subtotal,
      total: order.total,
      currency: order.currency,
      items: JSON.stringify(order.items),
      notes: JSON.stringify(order.notes),
      ip: order.ip,
      referer: order.referer,
    });

  return Number(result.lastInsertRowid);
}

export function markTelegramSent(id: number): void {
  getDb().prepare("UPDATE orders SET telegram_sent = 1 WHERE id = ?").run(id);
}

/* ------------------------------------------------------------------ */
/* Чтение и правка в админке                                           */
/* ------------------------------------------------------------------ */

export function getOrder(id: number): Order | null {
  const row = getDb()
    .prepare(`SELECT ${COLUMNS} FROM orders WHERE id = ?`)
    .get(id) as OrderRow | undefined;
  return row ? toOrder(row) : null;
}

export function listOrders(filter: {
  status?: string;
  query?: string;
  limit?: number;
  offset?: number;
}): { rows: Order[]; total: number } {
  const where: string[] = [];
  const params: Record<string, string | number> = {};

  if (filter.status && isOrderStatus(filter.status)) {
    where.push("status = @status");
    params.status = filter.status;
  }
  if (filter.query?.trim()) {
    const query = filter.query.trim();
    // По телефону ищем по цифрам: человек может ввести его с любыми скобками
    // и дефисами, а в phone_digits они уже убраны.
    const digits = query.replace(/\D/g, "");
    if (digits.length >= 3) {
      where.push("(phone_digits LIKE @digits OR name LIKE @text)");
      params.digits = `%${digits}%`;
    } else {
      where.push("(name LIKE @text OR address LIKE @text)");
    }
    params.text = `%${query}%`;
  }

  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const total = (
    getDb().prepare(`SELECT COUNT(*) AS n FROM orders ${clause}`).get(params) as {
      n: number;
    }
  ).n;

  const rows = getDb()
    .prepare(
      `SELECT ${COLUMNS} FROM orders ${clause}
        ORDER BY created_at DESC LIMIT @limit OFFSET @offset`,
    )
    .all({
      ...params,
      limit: filter.limit ?? 40,
      offset: filter.offset ?? 0,
    }) as OrderRow[];

  return { total, rows: rows.map(toOrder) };
}

export function setOrderStatus(id: number, status: OrderStatus): void {
  getDb().prepare("UPDATE orders SET status = ? WHERE id = ?").run(status, id);
}

export function setOrderNote(id: number, note: string): void {
  getDb()
    .prepare("UPDATE orders SET admin_note = ? WHERE id = ?")
    .run(note.slice(0, 2000), id);
}

export function deleteOrder(id: number): void {
  getDb().prepare("DELETE FROM orders WHERE id = ?").run(id);
}

/* ------------------------------------------------------------------ */
/* Сводка для главной админки                                          */
/* ------------------------------------------------------------------ */

export interface OrderStats {
  newCount: number;
  todayCount: number;
  weekTotal: number;
  byStatus: Record<string, number>;
}

export function orderStats(): OrderStats {
  const db = getDb();
  const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

  const byStatus: Record<string, number> = {};
  const statusRows = db
    .prepare("SELECT status, COUNT(*) AS n FROM orders GROUP BY status")
    .all() as Array<{ status: string; n: number }>;
  for (const row of statusRows) byStatus[row.status] = row.n;

  const today = db
    .prepare("SELECT COUNT(*) AS n FROM orders WHERE created_at >= ?")
    .get(dayAgo) as { n: number };

  // Отменённые в выручку не считаем — иначе цифра врёт в приятную сторону.
  const week = db
    .prepare(
      "SELECT COALESCE(SUM(total), 0) AS sum FROM orders WHERE created_at >= ? AND status != 'cancelled'",
    )
    .get(weekAgo) as { sum: number };

  return {
    newCount: byStatus.new ?? 0,
    todayCount: today.n,
    weekTotal: week.sum,
    byStatus,
  };
}
