import { getDb } from "./db";


export interface ServiceRequest {
  id: number;
  createdAt: number;
  name: string;
  phone: string;
  car: string;
  comment: string;
  productId: string | null;
  productTitle: string;
  productUrl: string;
  telegramSent: boolean;
  done: boolean;
}

interface ServiceRequestRow {
  id: number;
  created_at: number;
  name: string;
  phone: string;
  car: string;
  comment: string;
  product_id: string | null;
  product_title: string;
  product_url: string;
  telegram_sent: number;
  done: number;
}

export function createServiceRequest(input: {
  name: string;
  phone: string;
  car: string;
  comment: string;
  productId: string | null;
  productTitle: string;
  productUrl: string;
  ip: string;
}): number {
  const result = getDb()
    .prepare(
      `INSERT INTO service_requests
         (created_at, name, phone, car, comment, product_id, product_title, product_url, ip)
       VALUES (@createdAt, @name, @phone, @car, @comment, @productId, @productTitle, @productUrl, @ip)`,
    )
    .run({ createdAt: Date.now(), ...input });
  return Number(result.lastInsertRowid);
}

export function markServiceRequestSent(id: number): void {
  getDb().prepare("UPDATE service_requests SET telegram_sent = 1 WHERE id = ?").run(id);
}

export function setServiceRequestDone(id: number, done: boolean): void {
  getDb().prepare("UPDATE service_requests SET done = ? WHERE id = ?").run(done ? 1 : 0, id);
}

export function listServiceRequests(limit = 200): ServiceRequest[] {
  const rows = getDb()
    .prepare("SELECT * FROM service_requests ORDER BY created_at DESC LIMIT ?")
    .all(limit) as ServiceRequestRow[];
  return rows.map((row) => ({
    id: row.id,
    createdAt: row.created_at,
    name: row.name,
    phone: row.phone,
    car: row.car,
    comment: row.comment,
    productId: row.product_id,
    productTitle: row.product_title,
    productUrl: row.product_url,
    telegramSent: row.telegram_sent === 1,
    done: row.done === 1,
  }));
}

export function countOpenServiceRequests(): number {
  return (
    getDb().prepare("SELECT COUNT(*) AS n FROM service_requests WHERE done = 0").get() as { n: number }
  ).n;
}
