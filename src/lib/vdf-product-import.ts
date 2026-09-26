import { AiError, complete, describeProduct, finishRewrite, parseFaq, promptFor } from "./ai";
import { WRITE_FROM_TITLE } from "./ai-import";
import { carPathsForProduct, fetchCarImages, isCarFitmentCategory, setProductCars } from "./cars";
import { categoryPaths, getCategoryById, invalidateCatalog } from "./catalog";
import type { MoneySource } from "./currency";
import { getDb } from "./db";
import { downloadDonorImages } from "./donor-images";
import { carCatalog, matchVdfCars } from "./frame-cars";
import { freeIdentity } from "./frame-import";
import { relinkInput } from "./linked-prices";
import { revalidateProduct } from "./revalidate";
import type { FaqItem, OptionGroup, Spec } from "./schema";
import { saveProduct } from "./store";
import { SHEET_COLUMNS, type SheetRow } from "./vdf-catalog";
import { readXlsx } from "./xlsx";

export type ImportStatus = "queued" | "importing" | "imported" | "skipped" | "error";

export interface ImportOptions {
  categoryId: string;
  unit: string;
  photos: boolean;
  faq: boolean;
}

export interface ImportSummary {
  id: number;
  fileName: string;
  createdAt: number;
  categoryName: string;
  unit: string;
  photos: boolean;
  faq: boolean;
  counts: Record<ImportStatus, number>;
  total: number;
  current: string[];
}

export interface ImportLogEntry {
  title: string;
  status: ImportStatus;
  productId: string | null;
  message: string;
}

const EMPTY_COUNTS: Record<ImportStatus, number> = {
  queued: 0,
  importing: 0,
  imported: 0,
  skipped: 0,
  error: 0,
};

function splitLines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function parseMoney(value: string): number | null {
  const number = Number(value.replace(/\s/g, "").replace(",", "."));
  return value.trim() && Number.isFinite(number) && number > 0 ? number : null;
}

export function parseSheet(data: Uint8Array): SheetRow[] {
  const [header, ...body] = readXlsx(data);
  if (!header) throw new Error("Таблица пустая");
  const index = new Map(header.map((title, position) => [title.trim(), position]));
  for (const required of ["Артикул", "Название"]) {
    if (!index.has(required)) throw new Error(`В таблице нет колонки «${required}»`);
  }
  const cell = (row: string[], key: keyof SheetRow) => {
    const column = SHEET_COLUMNS.find((item) => item.key === key);
    const position = column ? index.get(column.title) : undefined;
    return position === undefined ? "" : (row[position] ?? "").trim();
  };

  return body
    .filter((row) => cell(row, "title") && cell(row, "article"))
    .map((row) => {
      const side = cell(row, "side").toLowerCase();
      return {
        article: cell(row, "article"),
        title: cell(row, "title"),
        retail: parseMoney(cell(row, "retail")),
        wholesale: parseMoney(cell(row, "wholesale")),
        brand: cell(row, "brand"),
        description: cell(row, "description"),
        specs: splitLines(cell(row, "specs"))
          .map((line) => {
            const at = line.indexOf(":");
            return at > 0
              ? { name: line.slice(0, at).trim(), value: line.slice(at + 1).trim() }
              : { name: line, value: "" };
          })
          .filter((spec) => spec.name && spec.value),
        images: splitLines(cell(row, "images")).filter((url) => /^https?:\/\//.test(url)),
        cars: splitLines(cell(row, "cars")),
        mark: cell(row, "mark"),
        model: cell(row, "model"),
        years: cell(row, "years"),
        oem: cell(row, "oem")
          .split(/[,;\n]/)
          .map((code) => code.trim())
          .filter(Boolean),
        side: side === "левое" ? "левое" : side === "правое" ? "правое" : "",
        pair: cell(row, "pair"),
        weight: cell(row, "weight"),
        sizes: cell(row, "sizes"),
        path: cell(row, "path"),
        videos: splitLines(cell(row, "videos")),
        docs: splitLines(cell(row, "docs")),
        remains: parseMoney(cell(row, "remains")),
        url: cell(row, "url"),
      } satisfies SheetRow;
    });
}

export function groupPairs(rows: SheetRow[]): SheetRow[][] {
  const byArticle = new Map(rows.map((row) => [row.article, row]));
  const used = new Set<string>();
  const groups: SheetRow[][] = [];
  for (const row of rows) {
    if (used.has(row.article)) continue;
    const mate = row.side && row.pair ? byArticle.get(row.pair) : undefined;
    if (mate && !used.has(mate.article) && mate.pair === row.article && mate.side && mate.side !== row.side) {
      used.add(row.article);
      used.add(mate.article);
      groups.push(row.side === "левое" ? [row, mate] : [mate, row]);
    } else {
      used.add(row.article);
      groups.push([row]);
    }
  }
  return groups;
}

export function createImport(fileName: string, data: Uint8Array, options: ImportOptions): number {
  const category = getCategoryById(options.categoryId);
  if (!category) throw new Error("Раздел магазина не найден");
  const groups = groupPairs(parseSheet(data));
  if (!groups.length) throw new Error("В таблице нет товаров с артикулом и названием");

  const db = getDb();
  return db.transaction(() => {
    const id = Number(
      db
        .prepare(
          `INSERT INTO vdf_imports (file_name, created_at, category_id, unit, photos, faq)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(
          fileName.slice(0, 200),
          Date.now(),
          options.categoryId,
          options.unit,
          options.photos ? 1 : 0,
          options.faq ? 1 : 0,
        ).lastInsertRowid,
    );
    const add = db.prepare(
      "INSERT INTO vdf_import_items (import_id, position, rows, title) VALUES (?, ?, ?, ?)",
    );
    groups.forEach((group, position) =>
      add.run(id, position + 1, JSON.stringify(group), mergedTitle(group)),
    );
    return id;
  })();
}

interface ImportRow {
  id: number;
  file_name: string;
  created_at: number;
  category_id: string;
  unit: string;
  photos: number;
  faq: number;
}

export function importSummary(id: number): ImportSummary | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM vdf_imports WHERE id = ?").get(id) as ImportRow | undefined;
  if (!row) return null;
  const counts = { ...EMPTY_COUNTS };
  for (const item of db
    .prepare("SELECT status, COUNT(*) AS n FROM vdf_import_items WHERE import_id = ? GROUP BY status")
    .all(id) as Array<{ status: ImportStatus; n: number }>) {
    counts[item.status] = item.n;
  }
  return {
    id: row.id,
    fileName: row.file_name,
    createdAt: row.created_at,
    categoryName: getCategoryById(row.category_id)?.name ?? row.category_id,
    unit: row.unit,
    photos: row.photos === 1,
    faq: row.faq === 1,
    counts,
    total: Object.values(counts).reduce((sum, n) => sum + n, 0),
    current: (
      db
        .prepare(
          "SELECT title FROM vdf_import_items WHERE import_id = ? AND status = 'importing' LIMIT 5",
        )
        .all(id) as Array<{ title: string }>
    ).map((item) => item.title),
  };
}

export function listImports(): ImportSummary[] {
  return (
    getDb().prepare("SELECT id FROM vdf_imports ORDER BY id DESC LIMIT 20").all() as Array<{ id: number }>
  )
    .map((row) => importSummary(row.id))
    .filter((summary): summary is ImportSummary => summary !== null);
}

export function importLog(id: number, limit = 300): ImportLogEntry[] {
  return (
    getDb()
      .prepare(
        `SELECT title, status, product_id, message FROM vdf_import_items
          WHERE import_id = ? AND status IN ('imported', 'skipped', 'error')
          ORDER BY updated_at DESC LIMIT ?`,
      )
      .all(id, limit) as Array<{ title: string; status: ImportStatus; product_id: string | null; message: string }>
  ).map((row) => ({ title: row.title, status: row.status, productId: row.product_id, message: row.message }));
}

export function deleteImport(id: number): void {
  getDb().prepare("DELETE FROM vdf_imports WHERE id = ?").run(id);
}

export function releaseImport(id: number): void {
  getDb()
    .prepare("UPDATE vdf_import_items SET status = 'queued' WHERE import_id = ? AND status = 'importing'")
    .run(id);
}

export function retryImport(id: number): number {
  return getDb()
    .prepare(
      "UPDATE vdf_import_items SET status = 'queued', message = '' WHERE import_id = ? AND status IN ('error', 'importing')",
    )
    .run(id).changes;
}

const SIDE_WORDS = /\s*[(,]?\s*(лев(ое|ая|ый|ой)|прав(ое|ая|ый|ой))\s*\)?\s*$/i;

function mergedTitle(group: SheetRow[]): string {
  if (group.length === 1) return group[0].title;
  const stripped = group[0].title.replace(SIDE_WORDS, "").trim();
  return stripped || group[0].title;
}

function existingSku(skus: string[]): string | null {
  const db = getDb();
  const bySku = db.prepare("SELECT 1 FROM products WHERE json_extract(data, '$.sku') = ?");
  const byOption = db.prepare(
    `SELECT 1 FROM products, json_each(products.data, '$.optionGroups') AS g, json_each(g.value, '$.values') AS v
      WHERE json_extract(v.value, '$.sku') = ? LIMIT 1`,
  );
  return skus.find((sku) => bySku.get(sku) || byOption.get(sku)) ?? null;
}

function productWithTitle(title: string): string | null {
  const row = getDb()
    .prepare("SELECT id FROM products WHERE lower(trim(title)) = lower(trim(?)) LIMIT 1")
    .get(title) as { id: string } | undefined;
  return row?.id ?? null;
}

function productWithOem(codes: string[]): string | null {
  const find = getDb().prepare(
    "SELECT id FROM products WHERE instr(json_extract(data, '$.specs'), ?) > 0 LIMIT 1",
  );
  for (const code of codes.filter((item) => item.length >= 6).slice(0, 5)) {
    const row = find.get(code) as { id: string } | undefined;
    if (row) return row.id;
  }
  return null;
}

function rub(amount: number | null): MoneySource | undefined {
  return amount ? { amount, currency: "RUB" } : undefined;
}

function carSources(row: SheetRow): string[] {
  if (row.cars.length) return row.cars;
  if (!row.mark) return [];
  const [from, to] = row.years.split(/\s*[-—–]\s*/);
  const years = from ? `(${from}—${to ?? ""})` : "";
  return [`${row.mark} ${row.model} (${years})`.replace(/\s+\(\)$/, "")];
}

function specsOf(row: SheetRow, group: SheetRow[]): Spec[] {
  const specs = row.specs.filter((spec) => !/^сторона$/i.test(spec.name));
  const oem = [...new Set(group.flatMap((item) => item.oem))];
  if (oem.length && !specs.some((spec) => /oem/i.test(spec.name))) {
    specs.push({ name: "OEM-номера", value: oem.join(", ") });
  }
  return specs;
}

async function imagesFor(urls: string[], folder: string, referer: string, warnings: string[]) {
  if (!urls.length) return [];
  const result = await downloadDonorImages(urls, folder, referer);
  if (result.problems.length) warnings.push(result.problems.join("; "));
  return result.images.map((image) => image.path);
}

function claimNext(id: number): { position: number; rows: string } | null {
  const db = getDb();
  return db.transaction(() => {
    const row = db
      .prepare(
        "SELECT position, rows FROM vdf_import_items WHERE import_id = ? AND status = 'queued' ORDER BY position LIMIT 1",
      )
      .get(id) as { position: number; rows: string } | undefined;
    if (!row) return null;
    db.prepare(
      "UPDATE vdf_import_items SET status = 'importing', updated_at = ? WHERE import_id = ? AND position = ?",
    ).run(Date.now(), id, row.position);
    return row;
  })();
}

export async function importNext(id: number): Promise<ImportLogEntry | null> {
  const job = getDb().prepare("SELECT * FROM vdf_imports WHERE id = ?").get(id) as ImportRow | undefined;
  if (!job) throw new Error("Загрузка не найдена");
  const claimed = claimNext(id);
  if (!claimed) return null;

  const group = JSON.parse(claimed.rows) as SheetRow[];
  const [main] = group;
  const title = mergedTitle(group);
  const warnings: string[] = [];
  const finish = (status: ImportStatus, productId: string | null, message: string): ImportLogEntry => {
    getDb()
      .prepare(
        "UPDATE vdf_import_items SET status = ?, product_id = ?, message = ?, updated_at = ? WHERE import_id = ? AND position = ?",
      )
      .run(status, productId, message, Date.now(), id, claimed.position);
    return { title, status, productId, message };
  };

  try {
    const taken = existingSku(group.map((row) => row.article));
    if (taken) return finish("skipped", null, `артикул ${taken} уже есть в магазине`);
    const sameOem = productWithOem(group.flatMap((row) => row.oem));
    if (sameOem) return finish("skipped", sameOem, "товар с такими же OEM-номерами уже есть в магазине");
    const sameTitle = productWithTitle(title);
    if (sameTitle) return finish("skipped", sameTitle, "товар с таким названием уже есть в магазине");

    const category = getCategoryById(job.category_id);
    if (!category) throw new Error("Раздел магазина удалён");
    const productId = freeIdentity(title, main.article);
    const folder = `${job.category_id}/${productId}`;
    const specs = specsOf(main, group);
    const brand = main.brand || "VDF";

    const base = {
      title,
      description: main.description,
      categoryName: category.name,
      brand,
      specs,
      options: group.length > 1 ? ["Сторона: правое, левое или пара"] : [],
    };
    const description = finishRewrite(
      await complete(
        promptFor("rewrite", undefined) + (main.description.trim() ? "" : WRITE_FROM_TITLE),
        describeProduct(base, false),
        "rewrite",
      ),
    );

    let faq: FaqItem[] = [];
    if (job.faq === 1) {
      try {
        faq = parseFaq(
          await complete(promptFor("faq", undefined), describeProduct({ ...base, description }, true), "faq"),
        );
      } catch (error) {
        warnings.push(`вопросы-ответы не получились: ${(error as Error).message}`);
      }
    }

    const photos = job.photos === 1;
    let images: string[] = [];
    let optionGroups: OptionGroup[] = [];
    let priceSource = rub(main.retail);
    let costSource = rub(main.wholesale);

    if (group.length > 1) {
      const [left, right] = group;
      const leftImages = photos ? await imagesFor(left.images, folder, left.url, warnings) : [];
      const rightImages = photos ? await imagesFor(right.images, `${folder}/right`, right.url, warnings) : [];
      images = leftImages.length ? leftImages : rightImages;
      const pairRub = left.retail && right.retail ? left.retail + right.retail : null;
      optionGroups = [
        {
          id: "storona",
          name: "Сторона",
          values: [
            {
              id: "pravoe",
              label: "Правое",
              sku: right.article,
              ...(rub(right.retail) ? { priceSource: rub(right.retail), price: 0 } : {}),
              ...(rightImages.length ? { images: rightImages } : {}),
            },
            {
              id: "levoe",
              label: "Левое",
              sku: left.article,
              ...(rub(left.retail) ? { priceSource: rub(left.retail), price: 0 } : {}),
              ...(leftImages.length ? { images: leftImages } : {}),
            },
            {
              id: "para",
              label: "Пара",
              ...(rub(pairRub) ? { priceSource: rub(pairRub), price: 0 } : {}),
            },
          ],
        },
      ];
      const retails = [left.retail, right.retail].filter((value): value is number => value !== null);
      priceSource = rub(retails.length ? Math.min(...retails) : null);
      const costs = [left.wholesale, right.wholesale].filter((value): value is number => value !== null);
      costSource = rub(costs.length ? Math.max(...costs) : null);
    } else if (photos) {
      images = await imagesFor(main.images, folder, main.url, warnings);
    }

    const product = await relinkInput({
      id: productId,
      slug: productId,
      categoryId: job.category_id,
      title,
      brand,
      price: 0,
      inStock: false,
      unit: job.unit,
      sku: main.article,
      images,
      description,
      specs,
      optionGroups,
      ...(priceSource ? { priceSource } : {}),
      ...(costSource ? { costSource } : {}),
      ...(faq.length ? { faq } : {}),
    });
    const saved = saveProduct(product);
    if (!saved.ok) throw new Error(saved.problems.join(" "));

    if (isCarFitmentCategory(job.category_id)) {
      const matches = matchVdfCars(carSources(main), carCatalog());
      const generationIds = [...new Set(matches.flatMap((match) => match.generationIds))];
      if (generationIds.length) {
        setProductCars(productId, generationIds);
        await fetchCarImages(generationIds);
      } else {
        warnings.push("машина не найдена в справочнике — привяжите вручную");
      }
    }
    if (!priceSource) warnings.push("в таблице нет розничной цены");

    invalidateCatalog();
    revalidateProduct(productId, categoryPaths(job.category_id), undefined, carPathsForProduct(productId));
    return finish("imported", productId, warnings.join("; "));
  } catch (error) {
    const message = error instanceof AiError ? error.message : (error as Error).message || "ошибка";
    return finish("error", null, message);
  }
}
