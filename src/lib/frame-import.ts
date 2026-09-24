import { AiError, complete, describeProduct, finishRewrite, parseFaq, promptFor } from "./ai";
import { WRITE_FROM_TITLE } from "./ai-import";
import { carPathsForProduct, fetchCarImages, setProductCars } from "./cars";
import { categoryPaths, invalidateCatalog } from "./catalog";
import { getDb } from "./db";
import { downloadDonorImages } from "./donor-images";
import { carCatalog, matchVdfCars } from "./frame-cars";
import { revalidateProduct } from "./revalidate";
import type { FaqItem } from "./schema";
import { toSlug } from "./slug.mjs";
import { saveProduct } from "./store";
import {
  readVdfCategory,
  readVdfFrame,
  VDF_FRAME_ROOT,
  VDF_PAUSE_MS,
  type VdfFrame,
} from "./vdf-frames";

export const FRAME_CATEGORY_NAME = "Переходные рамки";
export const FRAME_BRAND = "VDF";
export const FRAME_UNIT = "комплект";

export type FrameStatus =
  | "new"
  | "read"
  | "importing"
  | "imported"
  | "skipped"
  | "read_error"
  | "import_error";

export const STATUS_LABELS: Record<FrameStatus, string> = {
  new: "найдена, не прочитана",
  read: "готова к импорту",
  importing: "создаётся",
  imported: "товар создан",
  skipped: "не рамка — пропущена",
  read_error: "ошибка чтения",
  import_error: "ошибка создания",
};

const EXPECTED_KEY = "vdf:expected";

interface FrameRow {
  url: string;
  article: string;
  model_frame: string;
  frame_type: string;
  name: string;
  cars: string;
  generation_ids: string;
  unmatched: string;
  review: string;
  details: string;
  status: FrameStatus;
  product_id: string | null;
  error: string;
  updated_at: number;
}

export interface FrameEntry {
  url: string;
  article: string;
  frameType: string;
  name: string;
  cars: string[];
  matched: number;
  unmatched: string[];
  review: string[];
  status: FrameStatus;
  productId: string | null;
  error: string;
}

type FrameDetails = Pick<
  VdfFrame,
  "description" | "specs" | "images" | "categoryPath" | "mark" | "model" | "years"
>;

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function toEntry(row: FrameRow): FrameEntry {
  return {
    url: row.url,
    article: row.article,
    frameType: row.frame_type,
    name: row.name,
    cars: JSON.parse(row.cars) as string[],
    matched: (JSON.parse(row.generation_ids) as string[]).length,
    unmatched: JSON.parse(row.unmatched) as string[],
    review: JSON.parse(row.review) as string[],
    status: row.status,
    productId: row.product_id,
    error: row.error,
  };
}

export interface FrameSummary {
  expected: number;
  categoriesDone: number;
  categoriesPending: number;
  truncated: string[];
  counts: Record<FrameStatus, number>;
  total: number;
  nextCategories: string[];
  nextFrames: string[];
  importing: string[];
}

export interface StepResult {
  summary: FrameSummary;
  processed: string[];
}

export const DISCOVER_BATCH = 5;
export const READ_BATCH = 5;

export function frameSummary(): FrameSummary {
  const db = getDb();
  const expected = Number(
    (db.prepare("SELECT value FROM settings WHERE key = ?").get(EXPECTED_KEY) as
      | { value: string }
      | undefined)?.value ?? 0,
  );
  const categories = db
    .prepare(
      "SELECT COALESCE(SUM(done), 0) AS done, COALESCE(SUM(1 - done), 0) AS pending FROM vdf_categories",
    )
    .get() as { done: number; pending: number };
  const truncated = (
    db.prepare("SELECT slug FROM vdf_categories WHERE truncated = 1 ORDER BY slug").all() as Array<{
      slug: string;
    }>
  ).map((row) => row.slug);
  const counts = Object.fromEntries(
    (Object.keys(STATUS_LABELS) as FrameStatus[]).map((status) => [status, 0]),
  ) as Record<FrameStatus, number>;
  for (const row of db
    .prepare("SELECT status, COUNT(*) AS n FROM vdf_frames GROUP BY status")
    .all() as Array<{ status: FrameStatus; n: number }>) {
    counts[row.status] = row.n;
  }
  const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
  const pluck = (sql: string, limit: number) =>
    (db.prepare(sql).all(limit) as Array<{ value: string }>).map((row) => row.value);
  return {
    nextCategories: pluck(
      "SELECT slug AS value FROM vdf_categories WHERE done = 0 ORDER BY rowid LIMIT ?",
      DISCOVER_BATCH,
    ),
    nextFrames: pluck(
      "SELECT article AS value FROM vdf_frames WHERE status = 'new' ORDER BY rowid LIMIT ?",
      READ_BATCH,
    ),
    importing: pluck(
      "SELECT article AS value FROM vdf_frames WHERE status = 'importing' ORDER BY updated_at LIMIT ?",
      10,
    ),
    expected,
    categoriesDone: categories.done,
    categoriesPending: categories.pending,
    truncated,
    counts,
    total,
  };
}

export function listFrames(): FrameEntry[] {
  return (
    getDb()
      .prepare("SELECT * FROM vdf_frames WHERE status <> 'skipped' ORDER BY frame_type, article")
      .all() as FrameRow[]
  ).map(toEntry);
}

export async function discoverStep(maxPages = DISCOVER_BATCH): Promise<StepResult> {
  const db = getDb();
  const seeded = db.prepare("SELECT COUNT(*) AS n FROM vdf_categories").get() as { n: number };
  if (seeded.n === 0) {
    db.prepare("INSERT INTO vdf_categories (slug) VALUES (?)").run(VDF_FRAME_ROOT);
  }

  const pending = db
    .prepare("SELECT slug FROM vdf_categories WHERE done = 0 ORDER BY rowid LIMIT ?")
    .all(maxPages) as Array<{ slug: string }>;

  const addCategory = db.prepare("INSERT OR IGNORE INTO vdf_categories (slug) VALUES (?)");
  const addFrame = db.prepare(
    `INSERT OR IGNORE INTO vdf_frames (url, article, model_frame, frame_type, name, updated_at)
     VALUES (@url, @article, @modelFrame, @frameType, @name, @now)`,
  );
  const finish = db.prepare("UPDATE vdf_categories SET done = 1, truncated = ? WHERE slug = ?");
  const saveExpected = db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  );

  for (const [index, { slug }] of pending.entries()) {
    if (index > 0) await pause(VDF_PAUSE_MS);
    const page = await readVdfCategory(slug);
    db.transaction(() => {
      for (const child of page.children) addCategory.run(child);
      for (const product of page.products) {
        if (!product.url) continue;
        addFrame.run({
          url: new URL(product.url, "https://vdf-light.ru").toString(),
          article: product.article,
          modelFrame: product.modelFrame,
          frameType: (product.modelFrame || product.article).match(/(\d{3})\s*$/)?.[1] ?? "",
          name: product.name,
          now: Date.now(),
        });
      }
      const truncated = !page.children.length && page.total > page.products.length;
      finish.run(truncated ? 1 : 0, slug);
      if (slug === VDF_FRAME_ROOT) saveExpected.run(EXPECTED_KEY, String(page.total));
    })();
  }

  return { summary: frameSummary(), processed: pending.map((row) => row.slug) };
}

function fallbackCars(frame: Pick<VdfFrame, "cars" | "mark" | "model" | "years">): string[] {
  if (frame.cars.length || !frame.mark) return frame.cars;
  const years = frame.years.length
    ? `(${Math.min(...frame.years)}—${Math.max(...frame.years)})`
    : "";
  return [`${frame.mark} ${frame.model} (${years})`];
}

function matchFrame(cars: string[], catalog = carCatalog()) {
  const matches = matchVdfCars(cars, catalog);
  return {
    generationIds: [...new Set(matches.flatMap((match) => match.generationIds))],
    unmatched: matches.filter((match) => !match.generationIds.length).map((match) => match.source),
    review: matches
      .filter((match) => match.generationIds.length && match.approximate)
      .map((match) => `${match.source} → ${match.names.join(", ")}`),
  };
}

export async function readStep(maxFrames = READ_BATCH): Promise<StepResult> {
  const db = getDb();
  const rows = db
    .prepare("SELECT url, article FROM vdf_frames WHERE status = 'new' ORDER BY rowid LIMIT ?")
    .all(maxFrames) as Array<{ url: string; article: string }>;
  const catalog = carCatalog();
  const update = db.prepare(
    `UPDATE vdf_frames
        SET article = @article, model_frame = @modelFrame, frame_type = @frameType, name = @name,
            cars = @cars, generation_ids = @generationIds, unmatched = @unmatched,
            review = @review, details = @details, status = @status, error = '', updated_at = @now
      WHERE url = @url`,
  );
  const fail = db.prepare(
    "UPDATE vdf_frames SET status = 'read_error', error = ?, updated_at = ? WHERE url = ?",
  );

  for (const [index, { url }] of rows.entries()) {
    if (index > 0) await pause(VDF_PAUSE_MS);
    try {
      const frame = await readVdfFrame(url);
      const { generationIds, unmatched, review } = matchFrame(fallbackCars(frame), catalog);
      const details: FrameDetails = {
        description: frame.description,
        specs: frame.specs,
        images: frame.images,
        categoryPath: frame.categoryPath,
        mark: frame.mark,
        model: frame.model,
        years: frame.years,
      };
      update.run({
        url,
        article: frame.article,
        modelFrame: frame.modelFrame,
        frameType: frame.frameType,
        name: frame.name,
        cars: JSON.stringify(frame.cars),
        generationIds: JSON.stringify(generationIds),
        unmatched: JSON.stringify(unmatched),
        review: JSON.stringify(review),
        details: JSON.stringify(details),
        status: frame.categoryPath[0] === FRAME_CATEGORY_NAME ? "read" : "skipped",
        now: Date.now(),
      });
    } catch (error) {
      fail.run((error as Error).message, Date.now(), url);
    }
  }

  return { summary: frameSummary(), processed: rows.map((row) => row.article) };
}

export function rematchFrames(): { frames: number; productsUpdated: number } {
  const db = getDb();
  const catalog = carCatalog();
  const rows = db
    .prepare("SELECT url, cars, details, status, product_id FROM vdf_frames WHERE status <> 'new'")
    .all() as Array<Pick<FrameRow, "url" | "cars" | "details" | "status" | "product_id">>;
  const update = db.prepare(
    "UPDATE vdf_frames SET generation_ids = ?, unmatched = ?, review = ?, updated_at = ? WHERE url = ?",
  );
  const bound = db.prepare("SELECT COUNT(*) AS n FROM product_cars WHERE product_id = ?");
  let productsUpdated = 0;

  for (const row of rows) {
    const details = JSON.parse(row.details) as Partial<FrameDetails>;
    const cars = fallbackCars({
      cars: JSON.parse(row.cars) as string[],
      mark: details.mark ?? "",
      model: details.model ?? "",
      years: details.years ?? [],
    });
    const { generationIds, unmatched, review } = matchFrame(cars, catalog);
    update.run(
      JSON.stringify(generationIds),
      JSON.stringify(unmatched),
      JSON.stringify(review),
      Date.now(),
      row.url,
    );
    if (row.status === "imported" && row.product_id && generationIds.length) {
      const { n } = bound.get(row.product_id) as { n: number };
      if (n === 0) {
        setProductCars(row.product_id, generationIds);
        productsUpdated += 1;
      }
    }
  }
  if (productsUpdated) invalidateCatalog();
  return { frames: rows.length, productsUpdated };
}

export function retryFailed(): number {
  const db = getDb();
  const read = db
    .prepare("UPDATE vdf_frames SET status = 'new', error = '' WHERE status = 'read_error'")
    .run().changes;
  const imported = db
    .prepare(
      "UPDATE vdf_frames SET status = 'read', error = '' WHERE status IN ('import_error', 'importing')",
    )
    .run().changes;
  return read + imported;
}

export function releaseStuck(): void {
  getDb().prepare("UPDATE vdf_frames SET status = 'read' WHERE status = 'importing'").run();
}

function claimNext(): FrameRow | null {
  const db = getDb();
  return db.transaction(() => {
    const row = db
      .prepare("SELECT * FROM vdf_frames WHERE status = 'read' ORDER BY frame_type, article LIMIT 1")
      .get() as FrameRow | undefined;
    if (!row) return null;
    db.prepare("UPDATE vdf_frames SET status = 'importing', updated_at = ? WHERE url = ?").run(
      Date.now(),
      row.url,
    );
    return row;
  })();
}

function freeIdentity(title: string, article: string): string {
  const db = getDb();
  const taken = (value: string) =>
    Boolean(db.prepare("SELECT 1 FROM products WHERE id = ? OR slug = ?").get(value, value));
  const base = toSlug(title) || toSlug(article);
  if (!taken(base)) return base;
  const suffix = toSlug(article);
  const combined = `${base.slice(0, Math.max(1, 80 - suffix.length - 1)).replace(/-+$/, "")}-${suffix}`;
  if (!taken(combined)) return combined;
  for (let index = 2; index < 100; index += 1) {
    const candidate = `${combined.slice(0, 76)}-${index}`;
    if (!taken(candidate)) return candidate;
  }
  throw new Error(`Не удалось подобрать свободный адрес для «${title}»`);
}

function productWithSku(sku: string): string | null {
  const row = getDb()
    .prepare("SELECT id FROM products WHERE json_extract(data, '$.sku') = ?")
    .get(sku) as { id: string } | undefined;
  return row?.id ?? null;
}

export interface ImportOutcome {
  url: string;
  article: string;
  productId?: string;
  warnings: string[];
  error?: string;
}

export async function importNextFrame(
  categoryId: string,
  categoryName: string,
): Promise<ImportOutcome | null> {
  const row = claimNext();
  if (!row) return null;
  const db = getDb();
  const warnings: string[] = [];

  const finish = (status: FrameStatus, productId: string | null, error = "") =>
    db
      .prepare(
        "UPDATE vdf_frames SET status = ?, product_id = ?, error = ?, updated_at = ? WHERE url = ?",
      )
      .run(status, productId, error, Date.now(), row.url);

  try {
    const existing = productWithSku(row.article);
    if (existing) {
      finish("imported", existing);
      return { url: row.url, article: row.article, productId: existing, warnings: ["уже был в магазине"] };
    }

    const details = JSON.parse(row.details) as FrameDetails;
    const id = freeIdentity(row.name, row.article);
    const product = {
      title: row.name,
      description: details.description,
      categoryName,
      brand: FRAME_BRAND,
      specs: details.specs,
      options: [],
    };

    const fromTitle = !details.description.trim();
    const description = finishRewrite(
      await complete(
        promptFor("rewrite", undefined) + (fromTitle ? WRITE_FROM_TITLE : ""),
        describeProduct(product, false),
        "rewrite",
      ),
    );

    let faq: FaqItem[] = [];
    try {
      faq = parseFaq(
        await complete(
          promptFor("faq", undefined),
          describeProduct({ ...product, description }, true),
          "faq",
        ),
      );
    } catch (error) {
      warnings.push(`вопросы-ответы не получились: ${(error as Error).message}`);
    }

    let images: string[] = [];
    if (details.images.length) {
      const result = await downloadDonorImages(details.images, `${categoryId}/${id}`, row.url);
      images = result.images.map((image) => image.path);
      if (result.problems.length) warnings.push(result.problems.join("; "));
    }

    const saved = saveProduct({
      id,
      slug: id,
      categoryId,
      title: row.name,
      brand: FRAME_BRAND,
      price: 0,
      inStock: false,
      unit: FRAME_UNIT,
      sku: row.article,
      images,
      description,
      specs: details.specs,
      ...(faq.length ? { faq } : {}),
    });
    if (!saved.ok) throw new Error(saved.problems.join(" "));

    const generationIds = JSON.parse(row.generation_ids) as string[];
    if (generationIds.length) {
      setProductCars(id, generationIds);
      await fetchCarImages(generationIds);
    } else {
      warnings.push("машина не найдена в справочнике — привяжите вручную");
    }

    invalidateCatalog();
    revalidateProduct(id, categoryPaths(categoryId), undefined, carPathsForProduct(id));

    finish("imported", id);
    return { url: row.url, article: row.article, productId: id, warnings };
  } catch (error) {
    const message =
      error instanceof AiError ? error.message : `${(error as Error).message || "ошибка"}`;
    finish("import_error", null, message);
    return { url: row.url, article: row.article, warnings, error: message };
  }
}

function csvCell(value: string | number): string {
  const text = String(value);
  return /[";\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function framesCsv(kind: "types" | "frames"): string {
  const frames = listFrames();
  const lines: string[][] = [];
  if (kind === "types") {
    const groups = new Map<string, FrameEntry[]>();
    for (const frame of frames) {
      const list = groups.get(frame.frameType) ?? [];
      list.push(frame);
      groups.set(frame.frameType, list);
    }
    lines.push(["Тип рамки", "Сколько машин", "Машины", "Артикулы"]);
    for (const [type, list] of [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      lines.push([
        type || "без номера",
        String(list.length),
        list.map((frame) => (frame.cars.length ? frame.cars.join(", ") : frame.name)).join("\n"),
        list.map((frame) => frame.article).join(", "),
      ]);
    }
  } else {
    lines.push([
      "Тип рамки",
      "Артикул",
      "Название",
      "Машины на vdf-light",
      "Не найдены в справочнике",
      "Проверить привязку",
      "Статус",
      "Ссылка",
    ]);
    for (const frame of frames) {
      lines.push([
        frame.frameType,
        frame.article,
        frame.name,
        frame.cars.join("\n"),
        frame.unmatched.join("\n"),
        frame.review.join("\n"),
        STATUS_LABELS[frame.status],
        frame.url,
      ]);
    }
  }
  return `﻿${lines.map((line) => line.map(csvCell).join(";")).join("\r\n")}\r\n`;
}
