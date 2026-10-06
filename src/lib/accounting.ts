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

export interface StaffOrderRow {
  id: number;
  createdAt: number;
  status: string;
  name: string;
  phone: string;
  total: number;
  inCrm: boolean;
  money: OrderMoney;
}

export const MONEY_STATUSES: Array<{ id: MoneyStatus; name: string }> = [
  { id: "awaiting", name: "Ожидает оплаты" },
  { id: "paid", name: "Оплачен" },
  { id: "cancelled", name: "Отменён" },
];

export function isMoneyStatus(value: unknown): value is MoneyStatus {
  return MONEY_STATUSES.some((entry) => entry.id === value);
}

export interface Writeoff {
  id: number;
  date: number;
  description: string;
  amount: number;
  person: string;
}

export interface WriteoffInput {
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
  incomeTotal: number;
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

const STAFF_ORDERS_WHERE = `o.staff = 1 AND (o.status = 'done' OR p.order_id IS NOT NULL OR c.order_id IS NOT NULL)`;

export function staffOrderCounts(): Record<MoneyStatus, number> {
  const rows = getDb()
    .prepare(
      `SELECT ${MONEY_STATUS_SQL} AS money, COUNT(*) AS n
       FROM orders o ${MONEY_JOINS} WHERE ${STAFF_ORDERS_WHERE} GROUP BY money`,
    )
    .all() as Array<{ money: MoneyStatus; n: number }>;
  const counts: Record<MoneyStatus, number> = { awaiting: 0, paid: 0, cancelled: 0 };
  for (const row of rows) counts[row.money] = row.n;
  return counts;
}

export function listStaffOrders(money?: MoneyStatus): StaffOrderRow[] {
  const rows = getDb()
    .prepare(
      `SELECT o.id, o.created_at AS createdAt, o.status, o.name, o.phone, o.total,
         (o.crm_sent_at IS NOT NULL AND q.order_id IS NULL) AS inCrm,
         ${MONEY_COLUMNS}
       FROM orders o ${MONEY_JOINS}
       LEFT JOIN crm_outbox q ON q.order_id = o.id
       WHERE ${STAFF_ORDERS_WHERE} ${money ? `AND ${MONEY_STATUS_SQL} = ?` : ""}
       ORDER BY o.id DESC`,
    )
    .all(...(money ? [money] : [])) as Array<
    MoneyRow & Omit<StaffOrderRow, "inCrm" | "money"> & { inCrm: number }
  >;
  return rows.map((row) => ({
    id: row.id,
    createdAt: row.createdAt,
    status: row.status,
    name: row.name,
    phone: row.phone,
    total: row.total,
    inCrm: row.inCrm === 1,
    money: toMoney(row.id, row),
  }));
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
  const writeoffs = db
    .prepare(
      `SELECT id, date, description, amount, person
       FROM ledger_writeoffs WHERE date >= ? AND date < ? ORDER BY date, id`,
    )
    .all(from, to) as Writeoff[];
  return {
    payments,
    writeoffs,
    incomeTotal: roundMoney(payments.reduce((sum, row) => sum + row.amount, 0)),
    writeoffTotal: roundMoney(writeoffs.reduce((sum, row) => sum + row.amount, 0)),
  };
}

export function ledgerBalance(): number {
  const row = getDb()
    .prepare(
      `SELECT
         (SELECT COALESCE(SUM(amount), 0) FROM crm_payments) AS income,
         (SELECT COALESCE(SUM(amount), 0) FROM ledger_writeoffs) AS spent`,
    )
    .get() as { income: number; spent: number };
  return roundMoney(row.income - row.spent);
}

export function addWriteoff(input: WriteoffInput): void {
  getDb()
    .prepare(
      "INSERT INTO ledger_writeoffs (date, description, amount, person, created_at) VALUES (?, ?, ?, ?, ?)",
    )
    .run(input.date, input.description, roundMoney(input.amount), input.person, Date.now());
}

export function deleteWriteoff(id: number): void {
  getDb().prepare("DELETE FROM ledger_writeoffs WHERE id = ?").run(id);
}
