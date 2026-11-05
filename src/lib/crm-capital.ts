import { getDb } from "./db";

export interface CapitalDeposit {
  ref: string;
  currency: "USD" | "EUR";
  amount: number;
  rate: number;
  date: string;
  description: string;
  person: string;
}

export interface CapitalOutboxRow {
  ref: string;
  payload: string | null;
  queued_at: number;
  attempts: number;
  last_error: string | null;
}

export const capitalRef = (paymentId: number) => `vdf-debt-payment-${paymentId}`;

export function queueCapital(ref: string, deposit: CapitalDeposit | null): void {
  getDb()
    .prepare(
      `INSERT INTO crm_capital_outbox (ref, payload, queued_at) VALUES (?, ?, ?)
       ON CONFLICT(ref) DO UPDATE SET
         payload = excluded.payload,
         queued_at = excluded.queued_at,
         attempts = 0,
         last_error = NULL`,
    )
    .run(ref, deposit ? JSON.stringify(deposit) : null, Date.now());
}

export function capitalOutboxState(): { count: number; lastError: string | null } {
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) AS count,
         (SELECT last_error FROM crm_capital_outbox WHERE last_error IS NOT NULL ORDER BY queued_at DESC LIMIT 1) AS lastError
       FROM crm_capital_outbox`,
    )
    .get() as { count: number; lastError: string | null };
  return row;
}
