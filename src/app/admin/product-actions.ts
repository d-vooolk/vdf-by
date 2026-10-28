"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import {
  carPathsForProduct,
  fetchCarImages,
  isCarFitmentCategory,
  setProductCars,
} from "@/lib/cars";
import { categoryPaths, invalidateCatalog } from "@/lib/catalog";
import { revalidateProduct } from "@/lib/revalidate";
import {
  deleteProduct,
  deleteProducts,
  getProductRaw,
  nextSku,
  reorderProducts,
  saveProduct,
  setProductPrice,
  setProductStockQty,
} from "@/lib/product-store";
import {
  FRAME_TYPES_VIEW_COOKIE,
  LAST_CATEGORY_COOKIE,
  parseProductsView,
  PRODUCTS_VIEW_COOKIE,
} from "@/lib/admin-prefs";
import { isFrameCategory, rememberVdfArticle } from "@/lib/frame-types";
import { buildProductSku, productSkuBase } from "@/lib/sku";
import { frameMembershipOf, setFrameMembership } from "@/lib/frame-membership";
import type { Product } from "@/lib/schema";
import { productsSharingStock, setGroupStock, stockGroupOf } from "@/lib/shared-stock";
import { requireAdmin } from "@/lib/auth";
import { revalidateProductsById } from "@/lib/stock-revalidate";
import { relinkInput } from "@/lib/linked-prices";
import { fail, type FormState, ok, toState } from "./form-state";

/* ------------------------------------------------------------------ */
/* Товары                                                              */
/* ------------------------------------------------------------------ */

const FRAME_FIELDS = [
  "price",
  "priceSource",
  "costPrice",
  "costSource",
  "wholesalePrice",
  "wholesaleSource",
  "sku",
  "storageCode",
] as const;

function withFrameFields(input: unknown, stored: Product): unknown {
  const next = { ...(input as Record<string, unknown>) };
  for (const field of FRAME_FIELDS) {
    if (stored[field] === undefined) delete next[field];
    else next[field] = stored[field];
  }
  return next;
}

function withComposedSku(input: unknown): Record<string, unknown> {
  const next = { ...(input as Record<string, unknown>) };
  const storageCode = typeof next.storageCode === "string" ? next.storageCode : "";
  const base = productSkuBase(typeof next.sku === "string" ? next.sku : "", storageCode);
  const sku = buildProductSku(base, storageCode);
  if (sku) next.sku = sku;
  else delete next.sku;
  return next;
}

export async function saveProductAction(
  input: unknown,
  previousId?: string,
  carIds: string[] = [],
): Promise<FormState> {
  await requireAdmin();

  // Адреса, по которым товар был доступен до правки: если поменяли slug или
  // перенесли в другой раздел, старые страницы тоже надо пересобрать.
  const before = previousId ? getProductRaw(previousId) : null;
  // Считаем до сохранения: после него дерево разделов уже другое.
  const beforePaths = before ? categoryPaths(before.categoryId) : [];
  const beforeCarPaths = previousId ? carPathsForProduct(previousId) : [];

  const membership = previousId ? frameMembershipOf(previousId) : null;
  const locked = membership && before && isFrameCategory(membership.categoryId) ? before : null;
  const prepared = locked ? withFrameFields(input, locked) : withComposedSku(input);
  const result = saveProduct(await relinkInput(prepared), previousId);
  if (!result.ok) return toState(result);

  const product = input as { id: string; slug: string; categoryId: string; stockQty?: number | null };
  if (!locked && before?.sku) {
    const saved = prepared as { sku?: string; storageCode?: string };
    if (saved.sku !== before.sku && productSkuBase(saved.sku, saved.storageCode) === before.sku) {
      rememberVdfArticle(product.id, before.sku);
    }
  }
  if (membership && membership.categoryId !== product.categoryId) setFrameMembership(product.id, null);

  const group = stockGroupOf(product.id);
  const stockQty = product.stockQty ?? null;
  const siblings = group && group.stockQty !== stockQty ? setGroupStock(group, stockQty) : [];

  // Привязки к машинам — после товара: у нового товара строки в products
  // до этого момента ещё нет, а внешний ключ на неё ссылается.
  if (isCarFitmentCategory(product.categoryId)) {
    const ids = Array.isArray(carIds) ? carIds : [];
    setProductCars(product.id, ids);
    // Логотип марки и фото поколения забираем к себе, если их ещё нет.
    // Сохранение товара из-за этого не падает — см. fetchCarImages.
    await fetchCarImages(ids);
  }

  invalidateCatalog();

  revalidateProduct(
    product.slug,
    categoryPaths(product.categoryId),
    {
      slug: before?.slug,
      categoryPaths: beforePaths,
      carPaths: beforeCarPaths,
    },
    carPathsForProduct(product.id),
  );
  revalidateProductsById(siblings.filter((id) => id !== product.id));

  if (!previousId) {
    (await cookies()).set(LAST_CATEGORY_COOKIE, product.categoryId, {
      path: "/admin",
      httpOnly: true,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 365,
    });
  }

  return ok();
}

/**
 * Свободный артикул для формы товара — кнопка «перегенерировать».
 *
 * Действием, а не значением в пропсах страницы: кнопку жмут на уже открытой
 * форме, и номер нужен на момент нажатия. Номер, посчитанный при загрузке
 * страницы, к этому времени мог достаться другому товару.
 */
export async function generateSkuAction(): Promise<{ sku: string }> {
  await requireAdmin();
  return { sku: nextSku() };
}

export async function deleteProductAction(id: string): Promise<FormState> {
  await requireAdmin();

  const product = getProductRaw(id);
  if (!product) return fail(["Товар не найден"]);

  const paths = categoryPaths(product.categoryId);
  // До удаления: привязки уходят вместе с товаром (ON DELETE CASCADE), и
  // после него узнать, какие страницы подбора он занимал, уже негде.
  const carPaths = carPathsForProduct(id);
  deleteProduct(id);
  invalidateCatalog();
  revalidateProduct(product.slug, paths, { carPaths });

  redirect("/admin/products/");
}

/**
 * Удаление отмеченных галочками товаров.
 *
 * Адреса страниц собираются до удаления — после него ни товара, ни его
 * раздела в снимке каталога уже не найти, а пересобрать нужно и страницу
 * товара, и разделы, где он лежал.
 */
export async function deleteProductsAction(ids: string[]): Promise<FormState> {
  await requireAdmin();

  if (!Array.isArray(ids) || !ids.length) return fail(["Ничего не выбрано"]);
  if (ids.some((id) => typeof id !== "string")) {
    return fail(["Некорректный список товаров"]);
  }

  const affected = ids
    .map((id) => getProductRaw(id))
    .filter((product): product is NonNullable<typeof product> => Boolean(product))
    .map((product) => ({
      slug: product.slug,
      paths: categoryPaths(product.categoryId),
      carPaths: carPathsForProduct(product.id),
    }));

  if (!affected.length) return fail(["Товары не найдены"]);

  deleteProducts(ids);
  invalidateCatalog();

  for (const entry of affected) {
    revalidateProduct(entry.slug, entry.paths, { carPaths: entry.carPaths });
  }

  return ok();
}

/** Быстрая правка цены прямо из списка товаров. */
export async function setProductPriceAction(
  id: string,
  price: number,
): Promise<FormState> {
  await requireAdmin();

  const product = getProductRaw(id);
  if (!product) return fail(["Товар не найден"]);
  const membership = frameMembershipOf(id);
  if (membership && isFrameCategory(membership.categoryId)) {
    return fail([`Цена задаётся в типе рамки ${membership.type} — поменяйте её там`]);
  }

  const result = setProductPrice(id, price);
  if (!result.ok) return toState(result);

  invalidateCatalog();
  revalidateProduct(product.slug, categoryPaths(product.categoryId));

  return ok();
}

export async function setProductStockQtyAction(
  id: string,
  qty: number | null,
): Promise<FormState> {
  await requireAdmin();

  const product = getProductRaw(id);
  if (!product) return fail(["Товар не найден"]);

  const result = setProductStockQty(id, qty);
  if (!result.ok) return toState(result);

  invalidateCatalog();
  revalidateProductsById(productsSharingStock(id));
  return ok();
}

export async function setProductsViewAction(
  view: string,
  scope: "products" | "frame-types" = "products",
): Promise<void> {
  await requireAdmin();
  const cookie = scope === "frame-types" ? FRAME_TYPES_VIEW_COOKIE : PRODUCTS_VIEW_COOKIE;
  (await cookies()).set(cookie, parseProductsView(view), {
    path: "/admin",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
  });
}

export interface ProductRowChanges {
  costPrice?: number | null;
  price?: number | null;
  wholesalePrice?: number | null;
  storageCode?: string | null;
  stockQty?: number | null;
}

const ROW_MONEY_FIELDS = [
  { field: "costPrice", source: "costSource", label: "Себестоимость" },
  { field: "price", source: "priceSource", label: "Цена розницы" },
  { field: "wholesalePrice", source: "wholesaleSource", label: "Оптовая цена" },
] as const;

function validMoney(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isFinite(value) && value >= 0);
}

export async function saveProductRowAction(
  id: string,
  changes: ProductRowChanges,
): Promise<FormState> {
  await requireAdmin();

  const before = getProductRaw(id);
  if (!before) return fail(["Товар не найден"]);

  const membership = frameMembershipOf(id);
  const frameLocked =
    membership !== null &&
    membership.categoryId === before.categoryId &&
    isFrameCategory(membership.categoryId);
  const touchesProduct =
    ROW_MONEY_FIELDS.some(({ field }) => field in changes) || "storageCode" in changes;
  if (frameLocked && touchesProduct) {
    return fail(["Цены и складской номер этого товара задаются в его типе рамки"]);
  }

  const next: Product = { ...before };
  for (const { field, source, label } of ROW_MONEY_FIELDS) {
    if (!(field in changes)) continue;
    const value = changes[field];
    if (!validMoney(value)) return fail([`${label}: нужно число не меньше нуля`]);
    delete next[source];
    if (field === "price") next.price = value ?? 0;
    else if (value === null) delete next[field];
    else next[field] = value;
  }

  if ("storageCode" in changes) {
    const storageCode = typeof changes.storageCode === "string" ? changes.storageCode.trim() : "";
    const sku = buildProductSku(productSkuBase(before.sku, before.storageCode), storageCode);
    if (storageCode) next.storageCode = storageCode;
    else delete next.storageCode;
    if (sku) next.sku = sku;
    else delete next.sku;
  }

  if ("stockQty" in changes) {
    const qty = changes.stockQty;
    if (qty !== null && (typeof qty !== "number" || !Number.isInteger(qty) || qty < 0)) {
      return fail(["Количество: нужно целое число не меньше нуля"]);
    }
  }

  if (touchesProduct) {
    const result = saveProduct(next, id);
    if (!result.ok) return toState(result);
    if (next.sku !== before.sku && before.sku && productSkuBase(next.sku, next.storageCode) === before.sku) {
      rememberVdfArticle(id, before.sku);
    }
  }

  if ("stockQty" in changes) {
    const result = setProductStockQty(id, changes.stockQty ?? null);
    if (!result.ok) return toState(result);
  }

  invalidateCatalog();
  revalidateProductsById([id, ...productsSharingStock(id)]);
  return ok();
}

export async function reorderProductsAction(ids: string[]): Promise<FormState> {
  await requireAdmin();
  if (!Array.isArray(ids) || ids.some((id) => typeof id !== "string")) {
    return fail(["Некорректный порядок"]);
  }

  reorderProducts(ids);
  invalidateCatalog();

  const first = getProductRaw(ids[0] ?? "");
  revalidateProduct(
    first?.slug ?? "",
    first ? categoryPaths(first.categoryId) : [],
  );

  return ok();
}
