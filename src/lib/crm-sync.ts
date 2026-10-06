import { z } from "zod";

import { recordCrmPull, replaceCrmStates } from "./accounting";
import { getDb } from "./db";
import { env } from "./env.mjs";
import type { OrderItem } from "./order-types";

const SEND_LIMIT = 50;
const TIMEOUT_MS = 10_000;
const ERROR_LENGTH = 300;

interface OutboxRow {
  order_id: number;
  queued_at: number;
  completed_at: number | null;
  attempts: number;
  last_error: string | null;
}

interface CrmOrderRow {
  status: string;
  staff: number;
  name: string;
  phone: string;
  items: string;
  total: number;
}

type CrmOrderReport =
  | {
      orderId: number;
      done: true;
      employeeName: string;
      employeePhone: string;
      items: Array<Pick<OrderItem, "title" | "options" | "sku" | "qty" | "price" | "sum">>;
      total: number;
      completedAt: string;
    }
  | { orderId: number; done: false };

export interface CrmSyncReport {
  configured: boolean;
  sent: number;
  failed: number;
  left: number;
  payments: number | null;
  paymentsError: string | null;
}

const isoDate = z.string().refine((value) => !Number.isNaN(Date.parse(value)));

const statesResponse = z.object({
  data: z.object({
    paid: z.array(
      z.object({
        orderId: z.number().int().positive(),
        employeeName: z.string(),
        amount: z.number().finite(),
        paidAt: isoDate,
        person: z.string(),
      }),
    ),
    cancelled: z.array(
      z.object({
        orderId: z.number().int().positive(),
        cancelledAt: isoDate,
        person: z.string(),
        reason: z.string(),
      }),
    ),
  }),
});

export interface CrmSyncState {
  configured: boolean;
  sentAt: number | null;
  queued: { attempts: number; lastError: string | null } | null;
}

function crmConfig(): { url: string; key: string } | null {
  const url = env("CRM_URL", undefined);
  const key = env("CRM_INTEGRATION_KEY", undefined);
  return url && key ? { url: url.replace(/\/+$/, ""), key } : null;
}

export function queueCrmSync(orderId: number, done: boolean): void {
  const now = Date.now();
  getDb()
    .prepare(
      `INSERT INTO crm_outbox (order_id, queued_at, completed_at) VALUES (?, ?, ?)
       ON CONFLICT(order_id) DO UPDATE SET
         queued_at = excluded.queued_at,
         completed_at = excluded.completed_at,
         attempts = 0,
         last_error = NULL`,
    )
    .run(orderId, now, done ? now : null);
}

function buildReport(row: OutboxRow): CrmOrderReport {
  const order = getDb()
    .prepare("SELECT status, staff, name, phone, items, total FROM orders WHERE id = ?")
    .get(row.order_id) as CrmOrderRow | undefined;
  if (!order || order.staff !== 1 || order.status !== "done") {
    return { orderId: row.order_id, done: false };
  }
  const items = JSON.parse(order.items) as OrderItem[];
  return {
    orderId: row.order_id,
    done: true,
    employeeName: order.name,
    employeePhone: order.phone,
    items: items.map(({ title, options, sku, qty, price, sum }) => ({ title, options, sku, qty, price, sum })),
    total: order.total,
    completedAt: new Date(row.completed_at ?? row.queued_at).toISOString(),
  };
}

function markSent(row: OutboxRow, done: boolean): void {
  const db = getDb();
  db.transaction(() => {
    db.prepare("DELETE FROM crm_outbox WHERE order_id = ? AND queued_at = ?").run(row.order_id, row.queued_at);
    db.prepare("UPDATE orders SET crm_sent_at = ? WHERE id = ?").run(done ? Date.now() : null, row.order_id);
  })();
}

function markFailed(row: OutboxRow, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  getDb()
    .prepare(
      "UPDATE crm_outbox SET attempts = attempts + 1, last_error = ? WHERE order_id = ? AND queued_at = ?",
    )
    .run(message.slice(0, ERROR_LENGTH), row.order_id, row.queued_at);
}

function queuedCount(): number {
  return (getDb().prepare("SELECT COUNT(*) AS n FROM crm_outbox").get() as { n: number }).n;
}

async function send(config: { url: string; key: string }, report: CrmOrderReport): Promise<void> {
  const response = await fetch(`${config.url}/api/integrations/vdf/orders`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-integration-key": config.key },
    body: JSON.stringify(report),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) {
    const body = (await response.text().catch(() => "")).slice(0, ERROR_LENGTH);
    throw new Error(`CRM ответила ${response.status}${body ? `: ${body}` : ""}`);
  }
}

async function pullStates(config: { url: string; key: string }): Promise<number> {
  const response = await fetch(`${config.url}/api/integrations/vdf/states`, {
    headers: { "x-integration-key": config.key },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) {
    const body = (await response.text().catch(() => "")).slice(0, ERROR_LENGTH);
    throw new Error(`CRM ответила ${response.status}${body ? `: ${body}` : ""}`);
  }
  const parsed = statesResponse.safeParse(await response.json());
  if (!parsed.success) throw new Error("CRM прислала оплаты в незнакомом виде");
  const { paid, cancelled } = parsed.data.data;
  replaceCrmStates({
    paid: paid.map((payment) => ({ ...payment, paidAt: Date.parse(payment.paidAt) })),
    cancelled: cancelled.map((entry) => ({ ...entry, cancelledAt: Date.parse(entry.cancelledAt) })),
  });
  return paid.length;
}

async function syncPayments(
  config: { url: string; key: string },
): Promise<Pick<CrmSyncReport, "payments" | "paymentsError">> {
  try {
    const payments = await pullStates(config);
    recordCrmPull(null);
    return { payments, paymentsError: null };
  } catch (error) {
    const message = (error instanceof Error ? error.message : String(error)).slice(0, ERROR_LENGTH);
    recordCrmPull(message);
    return { payments: null, paymentsError: message };
  }
}

async function exchangeWithCrm(): Promise<CrmSyncReport> {
  const config = crmConfig();
  if (!config) {
    return { configured: false, sent: 0, failed: 0, left: queuedCount(), payments: null, paymentsError: null };
  }

  const rows = getDb()
    .prepare("SELECT * FROM crm_outbox ORDER BY queued_at LIMIT ?")
    .all(SEND_LIMIT) as OutboxRow[];
  let sent = 0;
  let failed = 0;
  for (const row of rows) {
    const report = buildReport(row);
    try {
      await send(config, report);
      markSent(row, report.done);
      sent += 1;
    } catch (error) {
      markFailed(row, error);
      failed += 1;
    }
  }
  return { configured: true, sent, failed, left: queuedCount(), ...(await syncPayments(config)) };
}

let running: Promise<CrmSyncReport> | null = null;

export function syncCrm(): Promise<CrmSyncReport> {
  running ??= exchangeWithCrm().finally(() => {
    running = null;
  });
  return running;
}

export function crmSyncState(orderId: number): CrmSyncState {
  const db = getDb();
  const order = db.prepare("SELECT crm_sent_at FROM orders WHERE id = ?").get(orderId) as
    | { crm_sent_at: number | null }
    | undefined;
  const queued = db
    .prepare("SELECT attempts, last_error FROM crm_outbox WHERE order_id = ?")
    .get(orderId) as { attempts: number; last_error: string | null } | undefined;
  return {
    configured: crmConfig() !== null,
    sentAt: order?.crm_sent_at ?? null,
    queued: queued ? { attempts: queued.attempts, lastError: queued.last_error } : null,
  };
}
