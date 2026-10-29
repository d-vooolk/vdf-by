import { bodyKey, bodyName, groupByBody, homeBody, NAMED_IN_TITLE, titleMatchScore } from "./car-body";
import type { ProductCar } from "./car-types";
import { carPathsForProduct, getProductCars, setProductCars } from "./cars";
import { categoryPaths, invalidateCatalog } from "./catalog";
import { getDb } from "./db";
import { exclusive } from "./frame-lock";
import { frameMembershipOf } from "./frame-membership";
import { createFrameProduct, fillFrameProduct } from "./frame-products";
import { renderFrameProduct } from "./frame-renders";
import { revalidateImages, revalidateProduct } from "./revalidate";

export interface SplitBody {
  label: string;
  generationIds: string[];
  existingProductId: string | null;
  existingTitle: string | null;
}

export interface SplitPlan {
  productId: string;
  title: string;
  categoryId: string;
  type: string | null;
  keep: string;
  move: SplitBody[];
}

export interface SplitResult {
  productId: string;
  created: Array<{ productId: string; title: string }>;
  extended: Array<{ productId: string; title: string }>;
}

function bodyLabel(cars: ProductCar[]): string {
  const first = cars[0];
  const from = Math.min(...cars.map((car) => car.yearFrom ?? 9999));
  const to = Math.max(...cars.map((car) => car.yearTo ?? new Date().getFullYear()));
  return `${first.markName} ${first.modelName} ${bodyName(first.generationName)} ${from === 9999 ? "" : `${from}–${to}`}`
    .replace(/\s+/g, " ")
    .trim();
}

function refresh(productId: string, categoryId: string, previousCarPaths: string[] = []): void {
  const row = getDb().prepare("SELECT slug FROM products WHERE id = ?").get(productId) as
    | { slug: string }
    | undefined;
  if (!row) return;
  revalidateProduct(row.slug, categoryPaths(categoryId), { carPaths: previousCarPaths }, carPathsForProduct(productId));
}

function frameProducts(): Array<{ id: string; title: string; categoryId: string; type: string | null }> {
  return getDb()
    .prepare(
      `SELECT p.id, p.title, p.category_id AS categoryId, f.type
         FROM products p
         JOIN categories c ON c.id = p.category_id
         LEFT JOIN frame_type_products f ON f.product_id = p.id AND f.category_id = p.category_id
        WHERE COALESCE(json_extract(c.data, '$.carFitment'), 0) = 1
          AND p.id IN (SELECT product_id FROM product_cars GROUP BY product_id HAVING COUNT(*) > 1)
          AND (f.type IS NOT NULL OR c.id IN (SELECT DISTINCT category_id FROM frame_type_products))`,
    )
    .all() as Array<{ id: string; title: string; categoryId: string; type: string | null }>;
}

function typeSiblings(categoryId: string, type: string, productId: string): Array<{ id: string; title: string }> {
  return getDb()
    .prepare(
      `SELECT p.id, p.title FROM frame_type_products f JOIN products p ON p.id = f.product_id
        WHERE f.category_id = ? AND f.type = ? AND f.product_id <> ?`,
    )
    .all(categoryId, type, productId) as Array<{ id: string; title: string }>;
}

function siblingFor(
  siblings: Array<{ id: string; title: string; keys: Set<string> }>,
  body: ProductCar[],
): { id: string; title: string } | null {
  const key = bodyKey(body[0]);
  return siblings.find((sibling) => sibling.keys.has(key)) ?? null;
}

function planFor(product: { id: string; title: string; categoryId: string; type: string | null }): SplitPlan | null {
  const cars = getProductCars(product.id);
  const bodies = groupByBody(cars);
  if (bodies.length < 2) return null;
  const home = homeBody(cars, product.title);
  if (titleMatchScore(home, product.title) < NAMED_IN_TITLE) return null;
  const homeKey = home[0] ? bodyKey(home[0]) : "";
  const siblings = product.type
    ? typeSiblings(product.categoryId, product.type, product.id).map((sibling) => ({
        ...sibling,
        keys: new Set(getProductCars(sibling.id).map(bodyKey)),
      }))
    : [];
  return {
    productId: product.id,
    title: product.title,
    categoryId: product.categoryId,
    type: product.type,
    keep: bodyLabel(home),
    move: bodies
      .filter((body) => bodyKey(body[0]) !== homeKey)
      .map((body) => {
        const sibling = siblingFor(siblings, body);
        return {
          label: bodyLabel(body),
          generationIds: body.map((car) => car.generationId),
          existingProductId: sibling?.id ?? null,
          existingTitle: sibling?.title ?? null,
        };
      }),
  };
}

export function listFrameSplits(): SplitPlan[] {
  return frameProducts()
    .map(planFor)
    .filter((plan): plan is SplitPlan => plan !== null)
    .sort((a, b) => a.title.localeCompare(b.title, "ru"));
}

export function splitFrameProduct(productId: string): Promise<SplitResult> {
  return exclusive(`split:${productId}`, async () => {
    const membership = frameMembershipOf(productId);
    if (!membership) throw new Error("Товар не относится к типу рамки — разделите его вручную");
    const row = getDb().prepare("SELECT title FROM products WHERE id = ?").get(productId) as
      | { title: string }
      | undefined;
    if (!row) throw new Error("Товар не найден");
    const plan = planFor({ id: productId, title: row.title, ...membership });
    const result: SplitResult = { productId, created: [], extended: [] };
    if (!plan) return result;

    const before = carPathsForProduct(productId);
    const cars = getProductCars(productId);
    const moved = new Set(plan.move.flatMap((body) => body.generationIds));
    setProductCars(
      productId,
      cars.filter((car) => !moved.has(car.generationId)).map((car) => car.generationId),
    );

    for (const body of plan.move) {
      if (body.existingProductId) {
        const current = getProductCars(body.existingProductId).map((car) => car.generationId);
        setProductCars(body.existingProductId, [...current, ...body.generationIds]);
        result.extended.push({ productId: body.existingProductId, title: body.existingTitle ?? "" });
        refresh(body.existingProductId, membership.categoryId);
        continue;
      }
      const created = await createFrameProduct(membership.categoryId, membership.type, body.generationIds[0]);
      setProductCars(created.productId, body.generationIds);
      result.created.push({ productId: created.productId, title: created.title });
      refresh(created.productId, membership.categoryId);
    }

    invalidateCatalog();
    refresh(productId, membership.categoryId, before);
    return result;
  });
}

interface PendingWork {
  productId: string;
  categoryId: string;
  type: string;
  render: boolean;
  fill: boolean;
  attempts: number;
}

export interface SplitBatchReport {
  busy?: boolean;
  split: SplitResult[];
  rendered: string[];
  failed: Array<{ productId: string; message: string }>;
  dropped: string[];
  left: number;
  pending: number;
  manual: Array<{ productId: string; title: string; move: string[] }>;
}

const PENDING_KEY = "frameSplitPending";
const MAX_ATTEMPTS = 5;
let running = false;

function readPending(): PendingWork[] {
  const row = getDb().prepare("SELECT value FROM settings WHERE key = ?").get(PENDING_KEY) as
    | { value: string }
    | undefined;
  const stored = row ? (JSON.parse(row.value) as Array<PendingWork & { render?: boolean }>) : [];
  return stored.map((work) => ({ ...work, render: work.render ?? true }));
}

function writePending(pending: PendingWork[]): void {
  getDb()
    .prepare(
      `INSERT INTO settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    )
    .run(PENDING_KEY, JSON.stringify(pending));
}

async function renderStep(work: PendingWork): Promise<void> {
  const result = await renderFrameProduct(work.categoryId, work.type, work.productId);
  if (result.status === "skipped") throw new Error(`фото не сделано: ${result.message}`);
  work.render = false;
}

async function fillStep(work: PendingWork): Promise<void> {
  for (const part of ["description", "faq"] as const) {
    const filled = await fillFrameProduct(work.productId, part);
    if (filled.status === "skipped" && filled.message === "нейросеть не подключена") break;
  }
  work.fill = false;
}

export async function runFrameSplitBatch(budgetMs: number): Promise<SplitBatchReport> {
  const report: SplitBatchReport = { split: [], rendered: [], failed: [], dropped: [], left: 0, pending: 0, manual: [] };
  if (running) return { ...report, busy: true };
  running = true;
  const deadline = Date.now() + budgetMs;
  try {
    let pending = readPending();
    const plans = listFrameSplits();
    report.manual = plans
      .filter((plan) => !plan.type)
      .map((plan) => ({ productId: plan.productId, title: plan.title, move: plan.move.map((body) => body.label) }));

    for (const plan of plans) {
      if (!plan.type || Date.now() > deadline) continue;
      const result = await splitFrameProduct(plan.productId);
      report.split.push(result);
      pending = [
        ...pending.filter((work) => work.productId !== plan.productId),
        { productId: plan.productId, categoryId: plan.categoryId, type: plan.type, render: true, fill: false, attempts: 0 },
        ...result.created.map((created) => ({
          productId: created.productId,
          categoryId: plan.categoryId,
          type: plan.type as string,
          render: true,
          fill: true,
          attempts: 0,
        })),
      ];
      writePending(pending);
    }
    report.left = listFrameSplits().filter((plan) => plan.type).length;

    const queue = [
      ...pending.filter((work) => work.render).map((work) => ({ work, step: "render" as const })),
      ...pending.filter((work) => work.fill).map((work) => ({ work, step: "fill" as const })),
    ];
    for (const { work, step } of queue) {
      if (Date.now() > deadline) break;
      if (!pending.includes(work) || (step === "fill" && work.render)) continue;
      try {
        if (step === "render") {
          await renderStep(work);
          report.rendered.push(work.productId);
        } else {
          await fillStep(work);
        }
        invalidateCatalog();
        refresh(work.productId, work.categoryId);
        if (!work.render && !work.fill) pending = pending.filter((entry) => entry !== work);
      } catch (error) {
        const message = (error as Error).message;
        work.attempts += 1;
        report.failed.push({ productId: work.productId, message });
        pending = pending.filter((entry) => entry !== work);
        if (work.attempts >= MAX_ATTEMPTS) {
          report.dropped.push(work.productId);
          console.error(`[frame-split] ${work.productId}: ${message} — больше не пробуем`);
        } else {
          pending.push(work);
        }
      }
      writePending(pending);
    }
    if (report.rendered.length) revalidateImages();
    report.pending = pending.length;
    return report;
  } finally {
    running = false;
  }
}
