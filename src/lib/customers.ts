import crypto from "node:crypto";

import { getDb } from "./db";
import { localPart } from "./phone";

export type CustomerKind = "retail" | "wholesale";
export type WholesaleStatus = "none" | "pending" | "approved" | "rejected";
export type CodePurpose = "register" | "login";

export const WHOLESALE_LABELS: Record<WholesaleStatus, string> = {
  none: "розничный",
  pending: "ждёт проверки",
  approved: "оптовик",
  rejected: "опт отклонён",
};

export interface Customer {
  id: number;
  phone: string;
  name: string;
  kind: CustomerKind;
  address: string;
  wholesaleStatus: WholesaleStatus;
  consentAt: number;
  createdAt: number;
  lastLoginAt: number | null;
  reviewedAt: number | null;
  adminNote: string;
}

export interface Registration {
  name: string;
  kind: CustomerKind;
  address: string;
}

const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const RESEND_AFTER_MS = 60 * 1000;
const PHONE_HOURLY = 5;
const IP_HOURLY = 15;
const HOUR_MS = 60 * 60 * 1000;
export const SESSION_TTL_MS = 180 * 24 * 60 * 60 * 1000;

interface CustomerRow {
  id: number;
  phone: string;
  name: string;
  kind: CustomerKind;
  address: string;
  wholesale_status: WholesaleStatus;
  consent_at: number;
  created_at: number;
  last_login_at: number | null;
  reviewed_at: number | null;
  admin_note: string;
}

function toCustomer(row: CustomerRow): Customer {
  return {
    id: row.id,
    phone: row.phone,
    name: row.name,
    kind: row.kind,
    address: row.address,
    wholesaleStatus: row.wholesale_status,
    consentAt: row.consent_at,
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at,
    reviewedAt: row.reviewed_at,
    adminNote: row.admin_note,
  };
}

export const hashSecret = (value: string) =>
  crypto.createHash("sha256").update(value).digest("hex");

export function findCustomerByPhone(phone: string): Customer | null {
  const row = getDb().prepare("SELECT * FROM customers WHERE phone = ?").get(phone) as
    | CustomerRow
    | undefined;
  return row ? toCustomer(row) : null;
}

export function getCustomerById(id: number): Customer | null {
  const row = getDb().prepare("SELECT * FROM customers WHERE id = ?").get(id) as
    | CustomerRow
    | undefined;
  return row ? toCustomer(row) : null;
}

export function isWholesale(customer: Customer | null): boolean {
  return customer?.wholesaleStatus === "approved";
}

export type CodeCheck = { ok: true } | { ok: false; error: string; retryIn?: number };

export function canSendCode(phone: string, ip: string): CodeCheck {
  const db = getDb();
  const now = Date.now();
  const last = db
    .prepare("SELECT created_at FROM sms_codes WHERE phone = ? ORDER BY created_at DESC LIMIT 1")
    .get(phone) as { created_at: number } | undefined;
  if (last && now - last.created_at < RESEND_AFTER_MS) {
    const retryIn = Math.ceil((RESEND_AFTER_MS - (now - last.created_at)) / 1000);
    return { ok: false, error: `Код уже отправлен. Повторить можно через ${retryIn} с`, retryIn };
  }
  const byPhone = db
    .prepare("SELECT COUNT(*) AS n FROM sms_codes WHERE phone = ? AND created_at > ?")
    .get(phone, now - HOUR_MS) as { n: number };
  if (byPhone.n >= PHONE_HOURLY) {
    return { ok: false, error: "Слишком много кодов на этот номер. Попробуйте через час" };
  }
  const byIp = db
    .prepare("SELECT COUNT(*) AS n FROM sms_codes WHERE ip = ? AND created_at > ?")
    .get(ip, now - HOUR_MS) as { n: number };
  if (byIp.n >= IP_HOURLY) {
    return { ok: false, error: "Слишком много запросов кода. Попробуйте позже" };
  }
  return { ok: true };
}

export function issueCode(
  phone: string,
  purpose: CodePurpose,
  ip: string,
  payload: Registration | null = null,
): { id: number; code: string } {
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
  const now = Date.now();
  const result = getDb()
    .prepare(
      `INSERT INTO sms_codes (phone, purpose, code_hash, payload, ip, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(phone, purpose, hashSecret(`${phone}:${code}`), JSON.stringify(payload ?? {}), ip, now, now + CODE_TTL_MS);
  getDb().prepare("DELETE FROM sms_codes WHERE created_at < ?").run(now - 30 * 24 * HOUR_MS);
  return { id: Number(result.lastInsertRowid), code };
}

export function markCodeSent(id: number, error: string | null): void {
  getDb()
    .prepare("UPDATE sms_codes SET sent = ?, error = ? WHERE id = ?")
    .run(error === null ? 1 : 0, error ?? "", id);
}

export type VerifyResult =
  | { ok: true; customer: Customer; created: boolean }
  | { ok: false; error: string };

export function verifyCode(phone: string, code: string): VerifyResult {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT id, purpose, code_hash, payload, attempts, used, expires_at
         FROM sms_codes WHERE phone = ? AND sent = 1 ORDER BY created_at DESC LIMIT 1`,
    )
    .get(phone) as
    | {
        id: number;
        purpose: CodePurpose;
        code_hash: string;
        payload: string;
        attempts: number;
        used: number;
        expires_at: number;
      }
    | undefined;

  if (!row || row.used) return { ok: false, error: "Запросите код ещё раз" };
  if (row.expires_at < Date.now()) return { ok: false, error: "Код устарел — запросите новый" };
  if (row.attempts >= MAX_ATTEMPTS) {
    return { ok: false, error: "Слишком много неверных попыток — запросите новый код" };
  }

  const expected = Buffer.from(row.code_hash, "hex");
  const actual = Buffer.from(hashSecret(`${phone}:${code.trim()}`), "hex");
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
    db.prepare("UPDATE sms_codes SET attempts = attempts + 1 WHERE id = ?").run(row.id);
    const left = MAX_ATTEMPTS - row.attempts - 1;
    return { ok: false, error: left > 0 ? `Неверный код. Осталось попыток: ${left}` : "Неверный код — запросите новый" };
  }

  return db.transaction((): VerifyResult => {
    db.prepare("UPDATE sms_codes SET used = 1 WHERE id = ?").run(row.id);
    const existing = findCustomerByPhone(phone);
    if (existing) {
      db.prepare("UPDATE customers SET last_login_at = ? WHERE id = ?").run(Date.now(), existing.id);
      return { ok: true, customer: { ...existing, lastLoginAt: Date.now() }, created: false };
    }
    if (row.purpose !== "register") return { ok: false, error: "Номер не зарегистрирован" };
    const payload = JSON.parse(row.payload) as Registration;
    const now = Date.now();
    const result = db
      .prepare(
        `INSERT INTO customers (phone, name, kind, address, wholesale_status, consent_at, created_at, last_login_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        phone,
        payload.name,
        payload.kind,
        payload.address,
        payload.kind === "wholesale" ? "pending" : "none",
        now,
        now,
        now,
      );
    const customer = getCustomerById(Number(result.lastInsertRowid));
    if (!customer) return { ok: false, error: "Не удалось создать кабинет" };
    return { ok: true, customer, created: true };
  })();
}

export function createCustomerSession(customerId: number): { token: string; expiresAt: number } {
  const token = crypto.randomBytes(32).toString("base64url");
  const now = Date.now();
  const expiresAt = now + SESSION_TTL_MS;
  const db = getDb();
  db.prepare(
    "INSERT INTO customer_sessions (token_hash, customer_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
  ).run(hashSecret(token), customerId, now, expiresAt);
  db.prepare("DELETE FROM customer_sessions WHERE expires_at < ?").run(now);
  return { token, expiresAt };
}

export function customerBySession(token: string): Customer | null {
  const row = getDb()
    .prepare(
      `SELECT c.* FROM customer_sessions s JOIN customers c ON c.id = s.customer_id
        WHERE s.token_hash = ? AND s.expires_at > ?`,
    )
    .get(hashSecret(token), Date.now()) as CustomerRow | undefined;
  return row ? toCustomer(row) : null;
}

export function deleteCustomerSession(token: string): void {
  getDb().prepare("DELETE FROM customer_sessions WHERE token_hash = ?").run(hashSecret(token));
}

export function updateCustomerProfile(
  id: number,
  changes: { name: string; address: string; requestWholesale: boolean },
): void {
  const db = getDb();
  const current = getCustomerById(id);
  if (!current) return;
  const status =
    changes.requestWholesale && current.wholesaleStatus === "none" ? "pending" : current.wholesaleStatus;
  db.prepare("UPDATE customers SET name = ?, address = ?, kind = ?, wholesale_status = ? WHERE id = ?").run(
    changes.name,
    changes.address,
    changes.requestWholesale || current.kind === "wholesale" ? "wholesale" : "retail",
    status,
    id,
  );
}

export interface CustomerListEntry extends Customer {
  orders: number;
  ordersTotal: number;
  lastOrderAt: number | null;
}

export function listCustomers(filter: WholesaleStatus | "all" | "wholesale"): CustomerListEntry[] {
  const where =
    filter === "all"
      ? ""
      : filter === "wholesale"
        ? "WHERE c.wholesale_status IN ('pending', 'approved', 'rejected')"
        : "WHERE c.wholesale_status = @filter";
  const rows = getDb()
    .prepare(
      `SELECT c.*,
              (SELECT COUNT(*) FROM orders o WHERE substr(o.phone_digits, -9) = substr(c.phone, -9)) AS orders,
              (SELECT COALESCE(SUM(total), 0) FROM orders o WHERE substr(o.phone_digits, -9) = substr(c.phone, -9)) AS orders_total,
              (SELECT MAX(created_at) FROM orders o WHERE substr(o.phone_digits, -9) = substr(c.phone, -9)) AS last_order_at
         FROM customers c ${where}
        ORDER BY CASE c.wholesale_status WHEN 'pending' THEN 0 ELSE 1 END, c.created_at DESC`,
    )
    .all(filter === "all" || filter === "wholesale" ? {} : { filter }) as Array<
    CustomerRow & { orders: number; orders_total: number; last_order_at: number | null }
  >;
  return rows.map((row) => ({
    ...toCustomer(row),
    orders: row.orders,
    ordersTotal: row.orders_total,
    lastOrderAt: row.last_order_at,
  }));
}

export function countPendingWholesale(): number {
  return (
    getDb()
      .prepare("SELECT COUNT(*) AS n FROM customers WHERE wholesale_status = 'pending'")
      .get() as { n: number }
  ).n;
}

export function setWholesaleStatus(id: number, status: WholesaleStatus): void {
  getDb()
    .prepare("UPDATE customers SET wholesale_status = ?, reviewed_at = ? WHERE id = ?")
    .run(status, Date.now(), id);
}

export function setCustomerNote(id: number, note: string): void {
  getDb().prepare("UPDATE customers SET admin_note = ? WHERE id = ?").run(note.slice(0, 2000), id);
}

export function deleteCustomer(id: number): void {
  getDb().prepare("DELETE FROM customers WHERE id = ?").run(id);
}

export interface CustomerOrder {
  id: number;
  createdAt: number;
  status: string;
  total: number;
  currency: string;
  deliveryName: string;
  wholesale: boolean;
  items: Array<{ title: string; options: string; sku: string | null; qty: number; price: number; sum: number; url: string }>;
}

export function customerOrders(phone: string): CustomerOrder[] {
  const rows = getDb()
    .prepare(
      `SELECT id, created_at, status, total, currency, delivery_name, wholesale, items
         FROM orders WHERE substr(phone_digits, -9) = ? ORDER BY created_at DESC LIMIT 200`,
    )
    .all(localPart(phone)) as Array<{
    id: number;
    created_at: number;
    status: string;
    total: number;
    currency: string;
    delivery_name: string;
    wholesale: number;
    items: string;
  }>;
  return rows.map((row) => ({
    id: row.id,
    createdAt: row.created_at,
    status: row.status,
    total: row.total,
    currency: row.currency,
    deliveryName: row.delivery_name,
    wholesale: row.wholesale === 1,
    items: JSON.parse(row.items) as CustomerOrder["items"],
  }));
}
