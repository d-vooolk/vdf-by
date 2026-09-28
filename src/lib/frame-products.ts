import { AiError, aiConfigured, complete, describeProduct, finishRewrite, parseFaq, promptFor } from "./ai";
import { WRITE_FROM_TITLE } from "./ai-import";
import { fetchCarImages, setProductCars } from "./cars";
import { getGenerationInfo, type GenerationInfo } from "./car-photos";
import { getCategoryById, invalidateCatalog } from "./catalog";
import { getDb } from "./db";
import {
  applyToProduct,
  getFrameType,
  initialFrameValues,
  newFrameSku,
  type FrameTypeGroup,
} from "./frame-types";
import { relinkInput } from "./linked-prices";
import { freeIdentity } from "./product-identity";
import type { FaqItem } from "./schema";
import { saveProduct } from "./store";

const UNIT = "комплект";
const DEFAULT_BRAND = "VDF";

export interface FrameProductResult {
  status: "created" | "skipped";
  productId: string;
  title: string;
  message: string;
}

function shortModel(info: GenerationInfo): string {
  const model = info.modelName.trim();
  return model.toLowerCase().startsWith(info.markName.toLowerCase())
    ? model.slice(info.markName.length).trim()
    : model;
}

function bodyCode(generationName: string): string {
  return generationName.match(/\(([^)]+)\)/)?.[1]?.split(/[/,]/)[0]?.trim() ?? "";
}

function yearSpan(info: GenerationInfo, now: number): string {
  if (!info.yearFrom) return info.yearTo ? `по ${info.yearTo}` : "";
  if (!info.yearTo || info.yearTo >= now) return `с ${info.yearFrom}`;
  if (info.yearTo === info.yearFrom) return String(info.yearFrom);
  return `${info.yearFrom}-${info.yearTo}`;
}

export function frameProductTitle(template: string, info: GenerationInfo, group: FrameTypeGroup): string {
  const values: Record<string, string> = {
    марка: info.markName,
    модель: shortModel(info),
    кузов: bodyCode(info.generationName),
    поколение: info.generationName,
    годы: yearSpan(info, new Date().getFullYear()),
    тип: group.type,
    название: group.name,
  };
  return template
    .replace(/\{([^}]+)\}/g, (whole, key: string) => values[key.trim().toLowerCase()] ?? whole)
    .replace(/\s+/g, " ")
    .trim();
}

function titleTaken(title: string): boolean {
  return Boolean(
    getDb()
      .prepare("SELECT 1 FROM products WHERE lower(trim(title)) = lower(trim(?)) LIMIT 1")
      .get(title),
  );
}

function existingForGeneration(group: FrameTypeGroup, generationId: string): string | null {
  const ids = group.products.map((product) => product.id);
  if (!ids.length) return null;
  const row = getDb()
    .prepare(
      `SELECT product_id AS id FROM product_cars
        WHERE generation_id = ? AND product_id IN (${ids.map(() => "?").join(",")}) LIMIT 1`,
    )
    .get(generationId, ...ids) as { id: string } | undefined;
  return row?.id ?? null;
}

function typeBrand(group: FrameTypeGroup): string {
  const ids = group.products.map((product) => product.id);
  if (!ids.length) return DEFAULT_BRAND;
  const rows = getDb()
    .prepare(
      `SELECT json_extract(data, '$.brand') AS brand, COUNT(*) AS n FROM products
        WHERE id IN (${ids.map(() => "?").join(",")}) AND json_extract(data, '$.brand') IS NOT NULL
        GROUP BY brand ORDER BY n DESC LIMIT 1`,
    )
    .get(...ids) as { brand: string } | undefined;
  return rows?.brand || DEFAULT_BRAND;
}

function aiMessage(error: unknown): string {
  return error instanceof AiError ? error.message : (error as Error).message || "ошибка";
}

export async function createFrameProduct(
  categoryId: string,
  type: string,
  generationId: string,
): Promise<FrameProductResult> {
  const group = getFrameType(categoryId, type);
  if (!group) throw new Error(`Типа ${type} нет`);
  const category = getCategoryById(categoryId);
  if (!category) throw new Error("Раздел рамок не найден");
  const info = getGenerationInfo(generationId);
  if (!info) throw new Error("Поколение не найдено в справочнике");

  let title = frameProductTitle(group.titleTemplate, info, group);
  const existing = existingForGeneration(group, generationId);
  if (existing) {
    return { status: "skipped", productId: existing, title, message: "карточка для этой машины уже есть" };
  }
  if (titleTaken(title)) title = `${title} тип ${type}`;

  const warnings: string[] = [];
  const brand = typeBrand(group);
  const car = `${info.markName} ${shortModel(info)} ${info.generationName} ${yearSpan(info, new Date().getFullYear())}`;
  const source = [
    group.name && `Тип рамки: ${group.name}`,
    `Автомобиль: ${car.replace(/\s+/g, " ").trim()}`,
    group.brief,
  ]
    .filter(Boolean)
    .join("\n\n");
  const base = { title, description: source, categoryName: category.name, brand, specs: group.specs, options: [] };

  let description = "";
  let faq: FaqItem[] = [];
  if (!aiConfigured()) {
    warnings.push("нейросеть не подключена — описание и вопросы не написаны");
  } else {
    try {
      description = finishRewrite(
        await complete(
          promptFor("rewrite", undefined) + (group.brief.trim() ? "" : WRITE_FROM_TITLE),
          describeProduct(base, false),
          "rewrite",
        ),
      );
    } catch (error) {
      warnings.push(`описание не получилось: ${aiMessage(error)}`);
    }
    try {
      faq = parseFaq(
        await complete(
          promptFor("faq", undefined),
          describeProduct({ ...base, description: description || source }, true),
          "faq",
        ),
      );
    } catch (error) {
      warnings.push(`вопросы-ответы не получились: ${aiMessage(error)}`);
    }
  }

  const productId = freeIdentity(title, `${type}-${generationId}`);
  const product = await relinkInput({
    id: productId,
    slug: productId,
    categoryId,
    title,
    brand,
    price: 0,
    inStock: false,
    unit: UNIT,
    sku: newFrameSku(group.suffix, type),
    images: [],
    specs: group.specs,
    optionGroups: [],
    ...(description ? { description } : {}),
    ...(faq.length ? { faq } : {}),
    ...(group.storageCode ? { storageCode: group.storageCode } : {}),
  });
  const saved = saveProduct(product);
  if (!saved.ok) throw new Error(saved.problems.join(" "));

  applyToProduct(productId, initialFrameValues(group));
  setProductCars(productId, [generationId]);
  await fetchCarImages([generationId]);
  invalidateCatalog();

  return { status: "created", productId, title, message: warnings.join("; ") };
}
