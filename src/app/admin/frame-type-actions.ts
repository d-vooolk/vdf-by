"use server";

import { carPathsForProduct } from "@/lib/cars";
import { categoryPaths, invalidateCatalog } from "@/lib/catalog";
import { revalidateProduct, revalidateSite } from "@/lib/revalidate";
import { deleteProducts, getProductRaw } from "@/lib/product-store";
import {
  addToFrameType,
  applyFrameType,
  copyFrameType,
  deleteFrameType,
  isFrameCategory,
  removeFromFrameType,
  saveFrameTypeInfo,
  setFrameTypeStock,
  setPlannedFrameCars,
  validFrameTypeInfo,
  validFrameTypeValues,
  type FrameTypeResult,
} from "@/lib/frame-types";
import { isFrameType } from "@/lib/frame-sku";
import { frameMembers } from "@/lib/frame-membership";
import { requireAdmin } from "@/lib/auth";
import { revalidateProductsById } from "@/lib/stock-revalidate";
import { relinkValues } from "@/lib/currency";
import { currentRates } from "@/lib/linked-prices";
import { fail, type FormState, ok } from "./form-state";

export async function applyFrameTypeAction(
  categoryId: string,
  type: string,
  input: unknown,
): Promise<FormState & { updated?: number }> {
  await requireAdmin();
  if (!isFrameType(type)) return fail(["Номер рамки указан неверно"]);
  if (!isFrameCategory(categoryId)) return fail(["Раздел рамок не найден"]);
  const values = validFrameTypeValues(input);
  if (typeof values === "string") return fail([values]);
  const linked = values.priceSource || values.costSource || values.wholesaleSource;
  const priced = linked ? relinkValues(values, await currentRates()) : values;
  const updated = applyFrameType(categoryId, type, priced);
  invalidateCatalog();
  revalidateSite();
  return { ...ok(), updated };
}

function finishFrameChange(result: FrameTypeResult): FormState {
  if (!result.ok) return fail(result.problems);
  invalidateCatalog();
  revalidateProductsById(result.productIds);
  return ok();
}

export async function saveFrameTypeInfoAction(
  categoryId: string,
  previousType: string | null,
  input: unknown,
): Promise<FormState & { type?: string }> {
  await requireAdmin();
  const info = validFrameTypeInfo(input);
  if (typeof info === "string") return fail([info]);
  const state = finishFrameChange(saveFrameTypeInfo(categoryId, previousType, info));
  return state.ok ? { ...state, type: info.type } : state;
}

export async function copyFrameTypeAction(
  categoryId: string,
  sourceType: string,
  input: unknown,
): Promise<FormState & { type?: string }> {
  await requireAdmin();
  const info = validFrameTypeInfo(input);
  if (typeof info === "string") return fail([info]);
  const state = finishFrameChange(copyFrameType(categoryId, sourceType, info));
  return state.ok ? { ...state, type: info.type } : state;
}

export async function setPlannedFrameCarsAction(
  categoryId: string,
  type: string,
  generationIds: string[],
): Promise<FormState> {
  await requireAdmin();
  const result = setPlannedFrameCars(categoryId, type, generationIds.map(String).slice(0, 2000));
  return result.ok ? ok() : fail(result.problems);
}

export async function deleteFrameTypeAction(
  categoryId: string,
  type: string,
  withProducts = false,
): Promise<FormState> {
  await requireAdmin();
  if (!withProducts) return finishFrameChange(deleteFrameType(categoryId, type));

  const ids = frameMembers(categoryId, type);
  const affected = ids
    .map((id) => getProductRaw(id))
    .filter((product): product is NonNullable<typeof product> => Boolean(product))
    .map((product) => ({
      slug: product.slug,
      paths: categoryPaths(product.categoryId),
      carPaths: carPathsForProduct(product.id),
    }));
  const result = deleteFrameType(categoryId, type);
  if (!result.ok) return fail(result.problems);
  deleteProducts(ids);
  invalidateCatalog();
  for (const entry of affected) {
    revalidateProduct(entry.slug, entry.paths, { carPaths: entry.carPaths });
  }
  return ok();
}

export async function addToFrameTypeAction(
  categoryId: string,
  type: string,
  productId: string,
): Promise<FormState> {
  await requireAdmin();
  return finishFrameChange(addToFrameType(categoryId, type, productId));
}

export async function removeFromFrameTypeAction(
  categoryId: string,
  productId: string,
): Promise<FormState> {
  await requireAdmin();
  return finishFrameChange(removeFromFrameType(categoryId, productId));
}

export async function setFrameTypeStockAction(
  categoryId: string,
  type: string,
  stockQty: number | null,
): Promise<FormState> {
  await requireAdmin();
  if (stockQty !== null && (!Number.isInteger(stockQty) || stockQty < 0)) {
    return fail(["Количество — целое число не меньше нуля"]);
  }
  return finishFrameChange(setFrameTypeStock(categoryId, type, stockQty));
}
