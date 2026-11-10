import { capitalRef, queueCapital } from "./crm-capital";
import { getDb } from "./db";

export interface CrmPayment {
  orderId: number;
  employeeName: string;
  amount: number;
  paidAt: number;
  person: string;
  remaining: number;
}

export interface CrmCancellation {
  orderId: number;
  cancelledAt: number;
  person: string;
  reason: string;
}

export interface CrmStates {
  paid: CrmPayment[];
  cancelled: CrmCancellation[];
}

export type MoneyStatus = "awaiting" | "partial" | "paid" | "cancelled";

export interface OrderMoney {
  status: MoneyStatus;
  payments: CrmPayment[];
  paidTotal: number;
  remaining: number;
  cancellation: CrmCancellation | null;
}

export const MONEY_STATUSES: Array<{ id: MoneyStatus; name: string }> = [
  { id: "awaiting", name: "Ожидает оплаты" },
  { id: "partial", name: "Исполнен частично" },
  { id: "paid", name: "Оплачен" },
  { id: "cancelled", name: "Отменён" },
];

export type LedgerKind = "in" | "out";

export interface LedgerEntry {
  id: number;
  kind: LedgerKind;
  date: number;
  description: string;
  category: string;
  amount: number;
  person: string;
  debtId: number | null;
}

export interface LedgerEntryInput {
  kind: LedgerKind;
  date: number;
  description: string;
  category: string;
  amount: number;
  person: string;
}

export interface LedgerEntryUpdate {
  date: number;
  description: string;
  category: string;
  amount: number;
}

export interface OrderCashIncome {
  orderId: number;
  name: string;
  phone: string;
  wholesale: boolean;
}

export type CashIncome =
  | { source: "crm"; key: string; date: number; amount: number; payment: CrmPayment }
  | { source: "order"; key: string; date: number; amount: number; order: OrderCashIncome }
  | { source: "entry"; key: string; date: number; amount: number; entry: LedgerEntry };

export interface CashMonth {
  income: CashIncome[];
  expenses: LedgerEntry[];
  incomeTotal: number;
  expenseTotal: number;
}

export interface RsIncome {
  orderId: number;
  date: number;
  name: string;
  phone: string;
  amount: number;
  staff: boolean;
}

export interface CrmPullState {
  at: number;
  okAt: number | null;
  error: string | null;
}

const roundMoney = (value: number) => Math.round(value * 100) / 100;

export function replaceCrmStates(states: CrmStates): void {
  const db = getDb();
  const insertPayment = db.prepare(
    "INSERT INTO crm_payments (order_id, employee_name, amount, paid_at, person, remaining) VALUES (?, ?, ?, ?, ?, ?)",
  );
  const insertCancellation = db.prepare(
    "INSERT INTO crm_cancellations (order_id, cancelled_at, person, reason) VALUES (?, ?, ?, ?)",
  );
  db.transaction(() => {
    db.prepare("DELETE FROM crm_payments").run();
    db.prepare("DELETE FROM crm_cancellations").run();
    for (const payment of states.paid) {
      insertPayment.run(
        payment.orderId,
        payment.employeeName,
        payment.amount,
        payment.paidAt,
        payment.person,
        payment.remaining,
      );
    }
    for (const cancellation of states.cancelled) {
      insertCancellation.run(
        cancellation.orderId,
        cancellation.cancelledAt,
        cancellation.person,
        cancellation.reason,
      );
    }
  })();
}

export function recordCrmPull(error: string | null): void {
  const now = Date.now();
  getDb()
    .prepare(
      `INSERT INTO crm_pull (id, at, ok_at, error) VALUES (1, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         at = excluded.at,
         ok_at = COALESCE(excluded.ok_at, crm_pull.ok_at),
         error = excluded.error`,
    )
    .run(now, error ? null : now, error);
}

export function crmPullState(): CrmPullState | null {
  const row = getDb().prepare("SELECT at, ok_at, error FROM crm_pull WHERE id = 1").get() as
    | { at: number; ok_at: number | null; error: string | null }
    | undefined;
  return row ? { at: row.at, okAt: row.ok_at, error: row.error } : null;
}

const PAYMENT_COLUMNS = `
  order_id AS orderId, employee_name AS employeeName, amount, paid_at AS paidAt, person, remaining`;

const MONEY_JOINS = `
  LEFT JOIN (SELECT order_id, MAX(remaining) AS remaining FROM crm_payments GROUP BY order_id) p
    ON p.order_id = o.id
  LEFT JOIN crm_cancellations c ON c.order_id = o.id`;

const MONEY_STATUS_SQL = `CASE
  WHEN p.order_id IS NOT NULL AND p.remaining > 0 THEN 'partial'
  WHEN p.order_id IS NOT NULL THEN 'paid'
  WHEN c.order_id IS NOT NULL THEN 'cancelled'
  ELSE 'awaiting' END`;

export function orderMoney(orderId: number): OrderMoney {
  const db = getDb();
  const payments = db
    .prepare(`SELECT ${PAYMENT_COLUMNS} FROM crm_payments WHERE order_id = ? ORDER BY paid_at, id`)
    .all(orderId) as CrmPayment[];
  const cancellation =
    (db
      .prepare(
        `SELECT order_id AS orderId, cancelled_at AS cancelledAt, person, reason
         FROM crm_cancellations WHERE order_id = ?`,
      )
      .get(orderId) as CrmCancellation | undefined) ?? null;
  const remaining = roundMoney(Math.max(0, ...payments.map((payment) => payment.remaining)));
  const status: MoneyStatus = payments.length
    ? remaining > 0
      ? "partial"
      : "paid"
    : cancellation
      ? "cancelled"
      : "awaiting";
  return {
    status,
    payments,
    paidTotal: roundMoney(payments.reduce((sum, payment) => sum + payment.amount, 0)),
    remaining,
    cancellation,
  };
}

export function moneyStatuses(orderIds: number[]): Map<number, MoneyStatus> {
  const statuses = new Map<number, MoneyStatus>();
  if (!orderIds.length) return statuses;
  const rows = getDb()
    .prepare(
      `SELECT o.id, ${MONEY_STATUS_SQL} AS money FROM orders o ${MONEY_JOINS}
       WHERE o.id IN (${orderIds.map(() => "?").join(", ")})`,
    )
    .all(...orderIds) as Array<{ id: number; money: MoneyStatus }>;
  for (const row of rows) statuses.set(row.id, row.money);
  return statuses;
}

function monthRange(year: number, month: number): [number, number] {
  return [new Date(year, month - 1, 1).getTime(), new Date(year, month, 1).getTime()];
}

const total = (rows: Array<{ amount: number }>) => roundMoney(rows.reduce((sum, row) => sum + row.amount, 0));

const CASH_ORDERS = `orders WHERE staff = 0 AND status = 'done' AND rs_at IS NULL AND done_at IS NOT NULL`;

const ENTRY_COLUMNS = `
  w.id, w.kind, w.date, w.description, w.category, w.amount, w.person, dp.debt_id AS debtId`;

const ENTRY_FROM = `ledger_writeoffs w
  LEFT JOIN debt_payments dp ON dp.entry_id = w.id OR dp.capital_entry_id = w.id`;

export function cashMonth(year: number, month: number): CashMonth {
  const [from, to] = monthRange(year, month);
  const db = getDb();
  const payments = db
    .prepare(
      `SELECT ${PAYMENT_COLUMNS}
       FROM crm_payments WHERE paid_at >= ? AND paid_at < ? ORDER BY paid_at, order_id, id`,
    )
    .all(from, to) as CrmPayment[];
  const entries = db
    .prepare(`SELECT ${ENTRY_COLUMNS} FROM ${ENTRY_FROM} WHERE w.date >= ? AND w.date < ? ORDER BY w.date, w.id`)
    .all(from, to) as LedgerEntry[];
  const orders = db
    .prepare(
      `SELECT id, done_at, name, phone, total, wholesale FROM ${CASH_ORDERS}
         AND done_at >= ? AND done_at < ? ORDER BY done_at, id`,
    )
    .all(from, to) as Array<{ id: number; done_at: number; name: string; phone: string; total: number; wholesale: number }>;
  const income: CashIncome[] = [
    ...payments.map((payment, index): CashIncome => ({
      source: "crm",
      key: `crm-${payment.orderId}-${index}`,
      date: payment.paidAt,
      amount: payment.amount,
      payment,
    })),
    ...orders.map((order): CashIncome => ({
      source: "order",
      key: `order-${order.id}`,
      date: order.done_at,
      amount: order.total,
      order: { orderId: order.id, name: order.name, phone: order.phone, wholesale: order.wholesale === 1 },
    })),
    ...entries
      .filter((entry) => entry.kind === "in")
      .map((entry): CashIncome => ({ source: "entry", key: `entry-${entry.id}`, date: entry.date, amount: entry.amount, entry })),
  ].sort((a, b) => a.date - b.date);
  const expenses = entries.filter((entry) => entry.kind === "out");
  return { income, expenses, incomeTotal: total(income), expenseTotal: total(expenses) };
}

export function rsMonth(year: number, month: number): RsIncome[] {
  const [from, to] = monthRange(year, month);
  const rows = getDb()
    .prepare(
      `SELECT id, rs_at, name, phone, total, staff FROM orders
       WHERE rs_at >= ? AND rs_at < ? AND status != 'cancelled' ORDER BY rs_at, id`,
    )
    .all(from, to) as Array<{ id: number; rs_at: number; name: string; phone: string; total: number; staff: number }>;
  return rows.map((row) => ({
    orderId: row.id,
    date: row.rs_at,
    name: row.name,
    phone: row.phone,
    amount: row.total,
    staff: row.staff === 1,
  }));
}

export function ledgerBalance(): number {
  const row = getDb()
    .prepare(
      `SELECT
         (SELECT COALESCE(SUM(amount), 0) FROM crm_payments)
           + (SELECT COALESCE(SUM(total), 0) FROM ${CASH_ORDERS})
           + (SELECT COALESCE(SUM(amount), 0) FROM ledger_writeoffs WHERE kind = 'in') AS income,
         (SELECT COALESCE(SUM(amount), 0) FROM ledger_writeoffs WHERE kind = 'out') AS spent`,
    )
    .get() as { income: number; spent: number };
  return roundMoney(row.income - row.spent);
}

const normalizeCategory = (name: string) => name.trim().replace(/\s+/g, " ");

export function expenseCategories(): string[] {
  const rows = getDb()
    .prepare(
      `SELECT name FROM expense_categories
       ORDER BY sort_order IS NULL, sort_order, name COLLATE NOCASE`,
    )
    .all() as Array<{ name: string }>;
  return rows.map((row) => row.name);
}

export function resolveCategory(rawName: string): string {
  const name = normalizeCategory(rawName);
  if (!name) return "";
  const db = getDb();
  db.prepare("INSERT OR IGNORE INTO expense_categories (name) VALUES (?)").run(name);
  const row = db.prepare("SELECT name FROM expense_categories WHERE name = ?").get(name) as { name: string };
  return row.name;
}

export function getLedgerEntry(id: number): LedgerEntry | null {
  return (
    (getDb().prepare(`SELECT ${ENTRY_COLUMNS} FROM ${ENTRY_FROM} WHERE w.id = ?`).get(id) as LedgerEntry | undefined) ??
    null
  );
}

export function addLedgerEntry(input: LedgerEntryInput): number {
  const result = getDb()
    .prepare(
      `INSERT INTO ledger_writeoffs (kind, date, description, category, amount, person, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.kind,
      input.date,
      input.description,
      input.kind === "out" ? resolveCategory(input.category) : "",
      roundMoney(input.amount),
      input.person,
      Date.now(),
    );
  return Number(result.lastInsertRowid);
}

export function updateLedgerEntry(id: number, update: LedgerEntryUpdate): string[] {
  const entry = getLedgerEntry(id);
  if (!entry) return ["Запись не найдена"];
  const amount = roundMoney(update.amount);
  if (entry.debtId !== null && amount !== entry.amount) {
    return ["Сумму погашения долга не меняют: удалите запись — долг вернётся — и проведите погашение заново"];
  }
  const isPlainExpense = entry.kind === "out" && entry.debtId === null;
  getDb()
    .prepare("UPDATE ledger_writeoffs SET date = ?, description = ?, category = ?, amount = ? WHERE id = ?")
    .run(
      update.date,
      entry.debtId === null ? update.description : entry.description,
      isPlainExpense ? resolveCategory(update.category) : entry.category,
      amount,
      id,
    );
  return [];
}

export function deleteLedgerEntry(id: number): void {
  const db = getDb();
  db.transaction(() => {
    const payment = db
      .prepare(
        `SELECT id, debt_id, amount, entry_id, capital_entry_id FROM debt_payments
         WHERE entry_id = ? OR capital_entry_id = ?`,
      )
      .get(id, id) as
      | { id: number; debt_id: number; amount: number; entry_id: number | null; capital_entry_id: number | null }
      | undefined;
    if (payment) {
      db.prepare(
        `UPDATE debts SET remaining_amount = ROUND(remaining_amount + ?, 2), status = 'active', settled_at = NULL
         WHERE id = ?`,
      ).run(payment.amount, payment.debt_id);
      db.prepare("DELETE FROM debt_payments WHERE id = ?").run(payment.id);
      for (const linked of [payment.entry_id, payment.capital_entry_id]) {
        if (linked !== null) db.prepare("DELETE FROM ledger_writeoffs WHERE id = ?").run(linked);
      }
      if (payment.capital_entry_id !== null) queueCapital(capitalRef(payment.id), null);
    }
    db.prepare("DELETE FROM ledger_writeoffs WHERE id = ?").run(id);
  })();
}
