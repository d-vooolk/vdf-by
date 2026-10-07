import { getDb } from "./db";

export interface CrmPayment {
  orderId: number;
  employeeName: string;
  amount: number;
  paidAt: number;
  person: string;
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

export type MoneyStatus = "awaiting" | "paid" | "cancelled";

export interface OrderMoney {
  status: MoneyStatus;
  payment: CrmPayment | null;
  cancellation: CrmCancellation | null;
}

export const MONEY_STATUSES: Array<{ id: MoneyStatus; name: string }> = [
  { id: "awaiting", name: "Ожидает оплаты" },
  { id: "paid", name: "Оплачен" },
  { id: "cancelled", name: "Отменён" },
];

export type LedgerKind = "in" | "out";

export interface Writeoff {
  id: number;
  kind: LedgerKind;
  date: number;
  description: string;
  amount: number;
  person: string;
}

export interface WriteoffInput {
  kind: LedgerKind;
  date: number;
  description: string;
  amount: number;
  person: string;
}

export interface CrmPullState {
  at: number;
  okAt: number | null;
  error: string | null;
}

export interface LedgerMonth {
  payments: CrmPayment[];
  writeoffs: Writeoff[];
  deposits: Writeoff[];
  incomeTotal: number;
  depositTotal: number;
  writeoffTotal: number;
}

const roundMoney = (value: number) => Math.round(value * 100) / 100;

export function replaceCrmStates(states: CrmStates): void {
  const db = getDb();
  const insertPayment = db.prepare(
    "INSERT INTO crm_payments (order_id, employee_name, amount, paid_at, person) VALUES (?, ?, ?, ?, ?)",
  );
  const insertCancellation = db.prepare(
    "INSERT INTO crm_cancellations (order_id, cancelled_at, person, reason) VALUES (?, ?, ?, ?)",
  );
  db.transaction(() => {
    db.prepare("DELETE FROM crm_payments").run();
    db.prepare("DELETE FROM crm_cancellations").run();
    for (const payment of states.paid) {
      insertPayment.run(payment.orderId, payment.employeeName, payment.amount, payment.paidAt, payment.person);
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

interface MoneyRow {
  paidAmount: number | null;
  paidAt: number | null;
  paidPerson: string | null;
  paidEmployee: string | null;
  cancelledAt: number | null;
  cancelledPerson: string | null;
  cancelReason: string | null;
}

const MONEY_COLUMNS = `
  p.amount AS paidAmount, p.paid_at AS paidAt, p.person AS paidPerson, p.employee_name AS paidEmployee,
  c.cancelled_at AS cancelledAt, c.person AS cancelledPerson, c.reason AS cancelReason`;

const MONEY_JOINS = `
  LEFT JOIN crm_payments p ON p.order_id = o.id
  LEFT JOIN crm_cancellations c ON c.order_id = o.id`;

const MONEY_STATUS_SQL = `CASE
  WHEN p.order_id IS NOT NULL THEN 'paid'
  WHEN c.order_id IS NOT NULL THEN 'cancelled'
  ELSE 'awaiting' END`;

function toMoney(orderId: number, row: MoneyRow): OrderMoney {
  const payment =
    row.paidAt === null
      ? null
      : {
          orderId,
          employeeName: row.paidEmployee ?? "",
          amount: row.paidAmount ?? 0,
          paidAt: row.paidAt,
          person: row.paidPerson ?? "",
        };
  const cancellation =
    row.cancelledAt === null
      ? null
      : {
          orderId,
          cancelledAt: row.cancelledAt,
          person: row.cancelledPerson ?? "",
          reason: row.cancelReason ?? "",
        };
  return {
    status: payment ? "paid" : cancellation ? "cancelled" : "awaiting",
    payment,
    cancellation,
  };
}

export function orderMoney(orderId: number): OrderMoney {
  const row = getDb()
    .prepare(`SELECT ${MONEY_COLUMNS} FROM orders o ${MONEY_JOINS} WHERE o.id = ?`)
    .get(orderId) as MoneyRow | undefined;
  return row ? toMoney(orderId, row) : { status: "awaiting", payment: null, cancellation: null };
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

export function ledgerMonth(year: number, month: number): LedgerMonth {
  const from = new Date(year, month - 1, 1).getTime();
  const to = new Date(year, month, 1).getTime();
  const db = getDb();
  const payments = db
    .prepare(
      `SELECT order_id AS orderId, employee_name AS employeeName, amount, paid_at AS paidAt, person
       FROM crm_payments WHERE paid_at >= ? AND paid_at < ? ORDER BY paid_at, order_id`,
    )
    .all(from, to) as CrmPayment[];
  const entries = db
    .prepare(
      `SELECT id, kind, date, description, amount, person
       FROM ledger_writeoffs WHERE date >= ? AND date < ? ORDER BY date, id`,
    )
    .all(from, to) as Writeoff[];
  const writeoffs = entries.filter((entry) => entry.kind === "out");
  const deposits = entries.filter((entry) => entry.kind === "in");
  const total = (rows: Array<{ amount: number }>) => roundMoney(rows.reduce((sum, row) => sum + row.amount, 0));
  return {
    payments,
    writeoffs,
    deposits,
    incomeTotal: roundMoney(total(payments) + total(deposits)),
    depositTotal: total(deposits),
    writeoffTotal: total(writeoffs),
  };
}

export function ledgerBalance(): number {
  const row = getDb()
    .prepare(
      `SELECT
         (SELECT COALESCE(SUM(amount), 0) FROM crm_payments)
           + (SELECT COALESCE(SUM(amount), 0) FROM ledger_writeoffs WHERE kind = 'in') AS income,
         (SELECT COALESCE(SUM(amount), 0) FROM ledger_writeoffs WHERE kind = 'out') AS spent`,
    )
    .get() as { income: number; spent: number };
  return roundMoney(row.income - row.spent);
}

export function addWriteoff(input: WriteoffInput): void {
  getDb()
    .prepare(
      "INSERT INTO ledger_writeoffs (kind, date, description, amount, person, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .run(input.kind, input.date, input.description, roundMoney(input.amount), input.person, Date.now());
}

export function deleteWriteoff(id: number): void {
  getDb().prepare("DELETE FROM ledger_writeoffs WHERE id = ?").run(id);
}
