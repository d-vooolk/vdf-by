import {
  LINKED_FIELDS,
  relinkValues,
  type CurrencyRates,
  type LinkedValues,
  type MoneySource,
} from "./currency";
import { bumpCatalogVersion, getDb } from "./db";
import { getRubRate, getUsdRate } from "./rates";
import type { Product } from "./schema";

const REPORT_KEY = "rates:report";

export interface RatesReport {
  at: number;
  ok: boolean;
  error: string;
  rates: CurrencyRates;
  products: number;
  frameTypes: number;
}

export async function currentRates(): Promise<CurrencyRates> {
  const [RUB, USD] = await Promise.all([getRubRate(), getUsdRate()]);
  return { RUB, USD };
}

export async function relinkInput(input: unknown): Promise<unknown> {
  if (!input || typeof input !== "object") return input;
  const values = input as LinkedValues;
  const optionLinked = values.optionGroups?.some((group) =>
    group.values.some((value) => value.priceSource),
  );
  if (!optionLinked && !LINKED_FIELDS.some((field) => values[field.source])) return input;
  return relinkValues(values, await currentRates());
}

export function ratesReport(): RatesReport | null {
  const row = getDb().prepare("SELECT value FROM settings WHERE key = ?").get(REPORT_KEY) as
    | { value: string }
    | undefined;
  return row ? (JSON.parse(row.value) as RatesReport) : null;
}

function sameNumber(a: number | null | undefined, b: number | null | undefined): boolean {
  return (a ?? null) === (b ?? null);
}

function refreshProducts(rates: CurrencyRates): number {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT id, data FROM products
        WHERE data LIKE '%"priceSource"%'
           OR data LIKE '%"wholesaleSource"%'
           OR data LIKE '%"costSource"%'`,
    )
    .all() as Array<{ id: string; data: string }>;
  const write = db.prepare("UPDATE products SET price = ?, data = ?, updated_at = ? WHERE id = ?");
  let changed = 0;

  db.transaction(() => {
    for (const row of rows) {
      const product = JSON.parse(row.data) as Product;
      const next = relinkValues(product, rates);
      if (JSON.stringify(next) === JSON.stringify(product)) continue;
      write.run(next.price, JSON.stringify(next), Date.now(), row.id);
      changed += 1;
    }
  })();
  return changed;
}

interface TypeSourceRow {
  category_id: string;
  type: string;
  price: number | null;
  cost_price: number | null;
  wholesale_price: number | null;
  price_source: string | null;
  cost_source: string | null;
  wholesale_source: string | null;
}

function parseSource(raw: string | null): MoneySource | null {
  return raw ? (JSON.parse(raw) as MoneySource) : null;
}

function refreshFrameTypes(rates: CurrencyRates): number {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT category_id, type, price, cost_price, wholesale_price,
              price_source, cost_source, wholesale_source
         FROM frame_types
        WHERE price_source IS NOT NULL OR cost_source IS NOT NULL OR wholesale_source IS NOT NULL`,
    )
    .all() as TypeSourceRow[];
  const write = db.prepare(
    `UPDATE frame_types SET price = ?, cost_price = ?, wholesale_price = ?, updated_at = ?
      WHERE category_id = ? AND type = ?`,
  );
  let changed = 0;

  db.transaction(() => {
    for (const row of rows) {
      const before: LinkedValues = {
        price: row.price,
        costPrice: row.cost_price,
        wholesalePrice: row.wholesale_price,
        priceSource: parseSource(row.price_source),
        costSource: parseSource(row.cost_source),
        wholesaleSource: parseSource(row.wholesale_source),
      };
      const next = relinkValues(before, rates);
      if (LINKED_FIELDS.every((field) => sameNumber(next[field.value], before[field.value]))) {
        continue;
      }
      write.run(
        next.price ?? null,
        next.costPrice ?? null,
        next.wholesalePrice ?? null,
        Date.now(),
        row.category_id,
        row.type,
      );
      changed += 1;
    }
  })();
  return changed;
}

export async function refreshLinkedPrices(): Promise<RatesReport> {
  const rates = await currentRates();
  const report: RatesReport = {
    at: Date.now(),
    ok: false,
    error: "",
    rates,
    products: 0,
    frameTypes: 0,
  };
  const missing = (Object.keys(rates) as Array<keyof CurrencyRates>).filter((code) => !rates[code]);
  if (missing.length) {
    report.error = `НБРБ не отдал курс: ${missing.join(", ")} — суммы в этой валюте не пересчитаны`;
  }
  report.products = refreshProducts(rates);
  report.frameTypes = refreshFrameTypes(rates);
  if (report.products) bumpCatalogVersion();
  report.ok = missing.length === 0;

  getDb()
    .prepare(
      `INSERT INTO settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    )
    .run(REPORT_KEY, JSON.stringify(report));
  return report;
}
