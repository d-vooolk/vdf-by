import { addLedgerEntry, resolveCategory } from "./accounting";
import { capitalRef, queueCapital } from "./crm-capital";
import { getDb } from "./db";
import {
  CAPITAL_TRANSFER_PREFIX,
  cashAmountInByn,
  type Debt,
  type DebtCurrency,
  type DebtInput,
  type DebtPayment,
  type DebtPaymentInput,
  type DebtUpdate,
  debtPaymentNeedsRate,
  debtPaymentOptions,
  debtReduction,
  formatMoney,
  isDebtCurrency,
} from "./debt-types";

const roundMoney = (value: number) => Math.round(value * 100) / 100;

interface DebtRow {
  id: number;
  description: string;
  currency: string;
  initial_amount: number;
  remaining_amount: number;
  direction: string;
  status: string;
  category: string;
  created_at: number;
  settled_at: number | null;
}

interface PaymentRow {
  id: number;
  debt_id: number;
  amount: number;
  paid_currency: string;
  paid_amount: number;
  rate: number | null;
  paid_at: number;
}

const currencyOf = (value: string): DebtCurrency => (isDebtCurrency(value) ? value : "BYN");

function toDebt(row: DebtRow, payments: DebtPayment[]): Debt {
  return {
    id: row.id,
    description: row.description,
    currency: currencyOf(row.currency),
    initialAmount: row.initial_amount,
    remainingAmount: row.remaining_amount,
    direction: row.direction === "owed_to_us" ? "owed_to_us" : "we_owe",
    status: row.status === "settled" ? "settled" : "active",
    category: row.category,
    createdAt: row.created_at,
    settledAt: row.settled_at,
    payments,
  };
}

function toPayment(row: PaymentRow): DebtPayment {
  return {
    id: row.id,
    amount: row.amount,
    paidCurrency: currencyOf(row.paid_currency),
    paidAmount: row.paid_amount,
    rate: row.rate,
    paidAt: row.paid_at,
  };
}

function paymentsByDebt(debtIds: number[]): Map<number, DebtPayment[]> {
  const grouped = new Map<number, DebtPayment[]>();
  if (!debtIds.length) return grouped;
  const rows = getDb()
    .prepare(
      `SELECT id, debt_id, amount, paid_currency, paid_amount, rate, paid_at FROM debt_payments
       WHERE debt_id IN (${debtIds.map(() => "?").join(", ")}) ORDER BY paid_at, id`,
    )
    .all(...debtIds) as PaymentRow[];
  for (const row of rows) {
    const list = grouped.get(row.debt_id) ?? [];
    list.push(toPayment(row));
    grouped.set(row.debt_id, list);
  }
  return grouped;
}

export function listDebts(archived: boolean): Debt[] {
  const rows = getDb()
    .prepare("SELECT * FROM debts WHERE status = ? ORDER BY created_at DESC, id DESC")
    .all(archived ? "settled" : "active") as DebtRow[];
  const payments = paymentsByDebt(rows.map((row) => row.id));
  return rows.map((row) => toDebt(row, payments.get(row.id) ?? []));
}

export function getDebt(id: number): Debt | null {
  const row = getDb().prepare("SELECT * FROM debts WHERE id = ?").get(id) as DebtRow | undefined;
  if (!row) return null;
  return toDebt(row, paymentsByDebt([row.id]).get(row.id) ?? []);
}

export function createDebt(input: DebtInput): string[] {
  if (input.direction === "we_owe" && !input.category.trim()) return ["Укажите категорию долга"];
  const amount = roundMoney(input.amount);
  getDb()
    .prepare(
      `INSERT INTO debts (description, currency, initial_amount, remaining_amount, direction, category, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.description,
      input.currency,
      amount,
      amount,
      input.direction,
      input.direction === "we_owe" ? resolveCategory(input.category) : "",
      Date.now(),
    );
  return [];
}

export function updateDebt(id: number, update: DebtUpdate): string[] {
  const debt = getDebt(id);
  if (!debt) return ["Долг не найден"];
  if (debt.direction === "we_owe" && !update.category.trim()) return ["Укажите категорию долга"];
  const amount = roundMoney(update.amount);
  if (debt.payments.length > 0 && amount !== debt.initialAmount) {
    return ["Нельзя менять сумму долга, по которому уже есть погашения"];
  }
  getDb()
    .prepare(
      `UPDATE debts SET description = ?, category = ?, initial_amount = ?, remaining_amount = ?
       WHERE id = ?`,
    )
    .run(
      update.description,
      debt.direction === "we_owe" ? resolveCategory(update.category) : "",
      debt.payments.length ? debt.initialAmount : amount,
      debt.payments.length ? debt.remainingAmount : amount,
      id,
    );
  return [];
}

export function deleteDebt(id: number): string[] {
  const debt = getDebt(id);
  if (!debt) return ["Долг не найден"];
  if (debt.payments.length > 0) return ["Нельзя удалить долг, по которому есть погашения"];
  getDb().prepare("DELETE FROM debts WHERE id = ?").run(id);
  return [];
}

export function payDebt(id: number, input: DebtPaymentInput, person: string): string[] {
  const debt = getDebt(id);
  if (!debt) return ["Долг не найден"];
  if (debt.status === "settled") return ["Долг уже погашен"];
  if (!debtPaymentOptions(debt.currency).includes(input.currency)) return ["Погашайте в валюте долга или в BYN"];

  const paid = roundMoney(input.amount);
  if (paid <= 0) return ["Сумма погашения должна быть больше нуля"];
  const rate = debtPaymentNeedsRate(debt.currency, input.currency) ? input.rate : null;
  if (debtPaymentNeedsRate(debt.currency, input.currency) && !rate) return ["Укажите курс"];

  const reduce = debtReduction(debt.currency, input.currency, paid, rate);
  if (reduce > debt.remainingAmount + 0.01) return ["Сумма погашения больше остатка долга"];
  const remaining = Math.max(0, roundMoney(debt.remainingAmount - reduce));
  const settles = remaining < 0.01;
  const now = Date.now();
  const cash = cashAmountInByn(input.currency, paid, rate);
  const foreignNote = input.currency === "BYN" ? "" : ` (${formatMoney(paid, input.currency)} по ${rate})`;

  const description = `${settles ? "Погашение" : "Частичное погашение"} долга — ${debt.description}`;
  const capitalCurrency = debt.direction === "owed_to_us" && input.currency !== "BYN" ? input.currency : null;
  const toCapital = capitalCurrency !== null && rate !== null;

  const db = getDb();
  db.transaction(() => {
    const entryId = addLedgerEntry({
      kind: debt.direction === "we_owe" ? "out" : "in",
      date: now,
      description: `${description}${foreignNote}`,
      category: debt.category,
      amount: cash,
      person,
    });
    const capitalEntryId = toCapital
      ? addLedgerEntry({
          kind: "out",
          date: now,
          description: `${CAPITAL_TRANSFER_PREFIX}: ${formatMoney(paid, input.currency)} по курсу ${rate}`,
          category: "",
          amount: cash,
          person,
        })
      : null;
    const payment = db
      .prepare(
        `INSERT INTO debt_payments (debt_id, amount, paid_currency, paid_amount, rate, paid_at, entry_id, capital_entry_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(id, settles ? debt.remainingAmount : reduce, input.currency, paid, rate, now, entryId, capitalEntryId);
    db.prepare("UPDATE debts SET remaining_amount = ?, status = ?, settled_at = ? WHERE id = ?").run(
      settles ? 0 : remaining,
      settles ? "settled" : "active",
      settles ? now : null,
      id,
    );
    if (capitalCurrency !== null && rate !== null) {
      const paymentId = Number(payment.lastInsertRowid);
      queueCapital(capitalRef(paymentId), {
        ref: capitalRef(paymentId),
        currency: capitalCurrency,
        amount: paid,
        rate,
        date: new Date(now).toISOString(),
        description,
        person,
      });
    }
  })();
  return [];
}
