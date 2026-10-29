import { getProductById } from "./catalog";
import { getDb } from "./db";
import { hasAnyInStock } from "./variant";

export type WaitlistStatus = "waiting" | "notified" | "done";

export const WAITLIST_STATUSES: ReadonlyArray<{ id: WaitlistStatus; label: string }> = [
  { id: "waiting", label: "Ждут" },
  { id: "notified", label: "Сообщили" },
  { id: "done", label: "Закрыты" },
];

export interface WaitlistEntry {
  id: number;
  createdAt: number;
  customerId: number | null;
  companyName: string | null;
  name: string;
  phone: string;
  productId: string | null;
  productTitle: string;
  qty: number;
  note: string;
  status: WaitlistStatus;
  closedAt: number | null;
}

export interface NewWaitlistEntry {
  customerId: number | null;
  name: string;
  phone: string;
  productId: string | null;
  productTitle: string;
  qty: number;
  note: string;
}

interface WaitlistRow {
  id: number;
  created_at: number;
  customer_id: number | null;
  company_name: string | null;
  company_phone: string | null;
  name: string;
  phone: string;
  product_id: string | null;
  product_title: string;
  qty: number;
  note: string;
  status: WaitlistStatus;
  closed_at: number | null;
}

function toEntry(row: WaitlistRow): WaitlistEntry {
  return {
    id: row.id,
    createdAt: row.created_at,
    customerId: row.customer_id,
    companyName: row.company_name,
    name: row.name,
    phone: row.phone || row.company_phone || "",
    productId: row.product_id,
    productTitle: row.product_title,
    qty: row.qty,
    note: row.note,
    status: row.status,
    closedAt: row.closed_at,
  };
}

export function isWaitlistStatus(value: string): value is WaitlistStatus {
  return WAITLIST_STATUSES.some((status) => status.id === value);
}

export function listWaitlist(status: WaitlistStatus): WaitlistEntry[] {
  const rows = getDb()
    .prepare(
      `SELECT w.*, c.name AS company_name, c.phone AS company_phone
         FROM waitlist w LEFT JOIN customers c ON c.id = w.customer_id
        WHERE w.status = ?
        ORDER BY ${status === "waiting" ? "w.created_at ASC" : "COALESCE(w.closed_at, w.created_at) DESC"}
        LIMIT 500`,
    )
    .all(status) as WaitlistRow[];
  return rows.map(toEntry);
}

export function waitlistCounts(): Record<WaitlistStatus, number> {
  const rows = getDb().prepare("SELECT status, COUNT(*) AS n FROM waitlist GROUP BY status").all() as Array<{
    status: WaitlistStatus;
    n: number;
  }>;
  const counts: Record<WaitlistStatus, number> = { waiting: 0, notified: 0, done: 0 };
  for (const row of rows) if (isWaitlistStatus(row.status)) counts[row.status] = row.n;
  return counts;
}

export function addWaitlistEntry(entry: NewWaitlistEntry): number {
  const result = getDb()
    .prepare(
      `INSERT INTO waitlist (created_at, customer_id, name, phone, product_id, product_title, qty, note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      Date.now(),
      entry.customerId,
      entry.name,
      entry.phone,
      entry.productId,
      entry.productTitle,
      entry.qty,
      entry.note,
    );
  return Number(result.lastInsertRowid);
}

export function productBackInStock(productId: string | null): boolean {
  const product = productId ? getProductById(productId) : undefined;
  return product ? hasAnyInStock(product) : false;
}

export function countWaitlistReady(): number {
  const rows = getDb().prepare("SELECT product_id FROM waitlist WHERE status = 'waiting'").all() as Array<{
    product_id: string | null;
  }>;
  return rows.filter((row) => productBackInStock(row.product_id)).length;
}

export function setWaitlistStatus(id: number, status: WaitlistStatus): void {
  getDb()
    .prepare("UPDATE waitlist SET status = ?, closed_at = ? WHERE id = ?")
    .run(status, status === "waiting" ? null : Date.now(), id);
}

export function setWaitlistNote(id: number, note: string): void {
  getDb().prepare("UPDATE waitlist SET note = ? WHERE id = ?").run(note.slice(0, 1000), id);
}

export function deleteWaitlistEntry(id: number): void {
  getDb().prepare("DELETE FROM waitlist WHERE id = ?").run(id);
}
