import { getDb } from "./db";

const PRUNE_EVERY = 500;
const KEEP_MS = 24 * 60 * 60 * 1000;

let writes = 0;

function prune(now: number): void {
  writes += 1;
  if (writes % PRUNE_EVERY !== 0) return;
  getDb().prepare("DELETE FROM rate_hits WHERE at < ?").run(now - KEEP_MS);
}

export function hitCount(key: string, windowMs: number): number {
  const row = getDb()
    .prepare("SELECT COUNT(*) AS n FROM rate_hits WHERE key = ? AND at > ?")
    .get(key, Date.now() - windowMs) as { n: number };
  return row.n;
}

export function isLimited(key: string, limit: number, windowMs: number): boolean {
  return hitCount(key, windowMs) >= limit;
}

export function recordHit(key: string): void {
  const now = Date.now();
  getDb().prepare("INSERT INTO rate_hits (key, at) VALUES (?, ?)").run(key, now);
  prune(now);
}

export function clearHits(key: string): void {
  getDb().prepare("DELETE FROM rate_hits WHERE key = ?").run(key);
}

export function takeHit(key: string, limit: number, windowMs: number): boolean {
  if (isLimited(key, limit, windowMs)) return false;
  recordHit(key);
  return true;
}
