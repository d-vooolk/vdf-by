import { queueCrmSync } from "./crm-sync";
import { getDb } from "./db";
import {
  isOrderStatus,
  type Order,
  type OrderItem,
  type OrderStatus,
} from "./order-types";
import { orderLineFromCatalog } from "./order-catalog";
import { describeShortage, stockShortages } from "./prices";
import { returnToStock, takeFromStock, type StockMove } from "./store";
import { variantKey } from "./variant";

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
  total_manual: number;
  currency: string;
  items: string;
  notes: string;
  ip: string;
  referer: string;
  telegram_sent: number;
  admin_note: string;
  staff: number;
  wholesale: number;
  edited_at: number | null;
  review_sms_at: number | null;
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
    totalManual: row.total_manual === 1,
    currency: row.currency,
    items: JSON.parse(row.items) as OrderItem[],
    notes: JSON.parse(row.notes) as string[],
    ip: row.ip,
    referer: row.referer,
    telegramSent: row.telegram_sent === 1,
    adminNote: row.admin_note,
    staff: row.staff === 1,
    wholesale: row.wholesale === 1,
    editedAt: row.edited_at,
    reviewSmsAt: row.review_sms_at,
  };
}

const COLUMNS = `id, created_at, status, name, phone, phone_digits, email, consent_at, comment,
  delivery_id, delivery_name, address, delivery_cost, subtotal, total, total_manual,
  currency, items, notes, ip, referer, telegram_sent, admin_note, staff,
  wholesale, edited_at, review_sms_at`;

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
  customerId?: number | null;
  wholesale?: boolean;
  staff?: boolean;
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
          subtotal, total, currency, items, notes, ip, referer, customer_id, wholesale, staff)
       VALUES
         (@createdAt, 'new', @name, @phone, @phoneDigits, @email, @consentAt, @comment,
          @deliveryId, @deliveryName, @address, @deliveryCost,
          @subtotal, @total, @currency, @items, @notes, @ip, @referer, @customerId, @wholesale, @staff)`,
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
      customerId: order.customerId ?? null,
      wholesale: order.wholesale ? 1 : 0,
      staff: order.staff ? 1 : 0,
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
  staff?: boolean;
  limit?: number;
  offset?: number;
}): { rows: Order[]; total: number } {
  const where: string[] = [];
  const params: Record<string, string | number> = {};

  if (filter.staff !== undefined) {
    where.push("staff = @staff");
    params.staff = filter.staff ? 1 : 0;
  }

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

export function setOrderStatus(id: number, status: OrderStatus): StockMove[] {
  const db = getDb();
  return db.transaction(() => {
    const row = db
      .prepare("SELECT status, staff, items, stock_moves FROM orders WHERE id = ?")
      .get(id) as
      | { status: string; staff: number; items: string; stock_moves: string | null }
      | undefined;
    if (!row) return [];

    let moves: StockMove[] | null = row.stock_moves
      ? (JSON.parse(row.stock_moves) as StockMove[])
      : null;
    let changed: StockMove[] = [];

    if (status === "done" && moves === null) {
      moves = takeFromStock(orderedQuantities(JSON.parse(row.items) as OrderItem[]));
      changed = moves;
    } else if (status !== "done" && moves !== null) {
      changed = returnToStock(moves);
      moves = null;
    }

    db.prepare("UPDATE orders SET status = ?, stock_moves = ? WHERE id = ?").run(
      status,
      moves === null ? null : JSON.stringify(moves),
      id,
    );
    if (row.staff === 1 && (row.status === "done") !== (status === "done")) {
      queueCrmSync(id, status === "done");
    }
    return changed;
  })();
}

function orderedQuantities(items: OrderItem[]): StockMove[] {
  const totals = new Map<string, number>();
  for (const item of items) {
    if (item.key) totals.set(item.key, (totals.get(item.key) ?? 0) + item.qty);
  }
  return [...totals].map(([key, qty]) => {
    const [productId, ...parts] = key.split("|");
    const selection = Object.fromEntries(
      parts.map((part) => part.split(":") as [string, string]),
    );
    return { productId, qty, selection };
  });
}

export interface OrderLineInput {
  key: string;
  qty: number;
}

export type OrderEditResult =
  | { ok: true; changed: StockMove[] }
  | { ok: false; problems: string[] };

export function updateOrderItems(id: number, lines: OrderLineInput[]): OrderEditResult {
  const db = getDb();
  return db.transaction((): OrderEditResult => {
    const row = db
      .prepare(
        "SELECT status, staff, wholesale, items, delivery_cost, stock_moves, total, total_manual FROM orders WHERE id = ?",
      )
      .get(id) as
      | {
          status: string;
          staff: number;
          wholesale: number;
          items: string;
          delivery_cost: number;
          stock_moves: string | null;
          total: number;
          total_manual: number;
        }
      | undefined;
    if (!row) return { ok: false, problems: ["Заказ не найден"] };

    const current = new Map((JSON.parse(row.items) as OrderItem[]).map((item) => [item.key, item]));
    const buyer = { staff: row.staff === 1, wholesale: row.wholesale === 1 };
    const wanted = new Map<string, number>();
    for (const line of lines) {
      const qty = Math.floor(Number(line.qty) || 0);
      if (line.key && qty > 0) wanted.set(line.key, Math.min(999, (wanted.get(line.key) ?? 0) + qty));
    }

    const problems: string[] = [];
    const items: OrderItem[] = [];
    for (const [key, qty] of wanted) {
      const existing = current.get(key);
      const item = existing
        ? { ...existing, qty, sum: Math.round(existing.price * qty * 100) / 100 }
        : orderLineFromCatalog(key, qty, buyer);
      if (item) items.push(item);
      else problems.push(`Товара ${key} больше нет в каталоге`);
    }
    if (!items.length) problems.push("В заказе должна остаться хотя бы одна позиция");
    if (problems.length) return { ok: false, problems };

    const taken = row.stock_moves ? (JSON.parse(row.stock_moves) as StockMove[]) : null;
    const released = (taken ?? []).map((move) => ({
      key: variantKey(move.productId, move.selection ?? {}),
      title: "",
      qty: move.qty,
    }));
    const shortages = stockShortages(items, released);
    if (shortages.length) {
      return {
        ok: false,
        problems: shortages.map((shortage) => `Не хватает на складе: ${describeShortage(shortage)}`),
      };
    }

    let moves = taken;
    const changed: StockMove[] = [];
    if (taken) {
      changed.push(...returnToStock(taken));
      moves = takeFromStock(orderedQuantities(items));
      changed.push(...moves);
    }

    const subtotal = Math.round(items.reduce((sum, item) => sum + item.sum, 0) * 100) / 100;
    db.prepare(
      `UPDATE orders
          SET items = ?, subtotal = ?, total = ?, stock_moves = ?, edited_at = ?
        WHERE id = ?`,
    ).run(
      JSON.stringify(items),
      subtotal,
      row.total_manual === 1 ? row.total : roundMoney(subtotal + row.delivery_cost),
      moves === null ? null : JSON.stringify(moves),
      Date.now(),
      id,
    );
    if (row.staff === 1 && row.status === "done") queueCrmSync(id, true);
    return { ok: true, changed };
  })();
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function setOrderTotal(id: number, total: number | null): { ok: true } | { ok: false; problems: string[] } {
  const db = getDb();
  const row = db.prepare("SELECT status, staff, subtotal, delivery_cost FROM orders WHERE id = ?").get(id) as
    | { status: string; staff: number; subtotal: number; delivery_cost: number }
    | undefined;
  if (!row) return { ok: false, problems: ["Заказ не найден"] };
  if (total !== null && !(Number.isFinite(total) && total >= 0 && total < 100_000_000)) {
    return { ok: false, problems: ["Сумма должна быть числом не меньше нуля"] };
  }
  const manual = total !== null;
  db.prepare("UPDATE orders SET total = ?, total_manual = ?, edited_at = ? WHERE id = ?").run(
    manual ? roundMoney(total) : roundMoney(row.subtotal + row.delivery_cost),
    manual ? 1 : 0,
    Date.now(),
    id,
  );
  if (row.staff === 1 && row.status === "done") queueCrmSync(id, true);
  return { ok: true };
}

export function markReviewRequested(id: number): void {
  getDb().prepare("UPDATE orders SET review_sms_at = ? WHERE id = ?").run(Date.now(), id);
}

export function setOrderNote(id: number, note: string): void {
  getDb()
    .prepare("UPDATE orders SET admin_note = ? WHERE id = ?")
    .run(note.slice(0, 2000), id);
}

export function deleteOrder(id: number): void {
  const db = getDb();
  db.transaction(() => {
    const row = db.prepare("SELECT status, staff FROM orders WHERE id = ?").get(id) as
      | { status: string; staff: number }
      | undefined;
    if (row?.staff === 1 && row.status === "done") queueCrmSync(id, false);
    db.prepare("DELETE FROM orders WHERE id = ?").run(id);
  })();
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

export function orderStatusCounts(staff: boolean): Record<string, number> {
  const counts: Record<string, number> = {};
  const rows = getDb()
    .prepare("SELECT status, COUNT(*) AS n FROM orders WHERE staff = ? GROUP BY status")
    .all(staff ? 1 : 0) as Array<{ status: string; n: number }>;
  for (const row of rows) counts[row.status] = row.n;
  return counts;
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
