"use server";

import {
  carPathsForProduct,
  deleteCarEntry,
  downloadCarImage,
  fetchCarImages,
  getCarTree,
  isCarFitmentCategory,
  isCarLevel,
  saveCarEntry,
  setProductCars,
} from "@/lib/cars";
import { saveCarText } from "@/lib/car-texts";
import { carsRoot, modelUrl, type CarEntryInput } from "@/lib/car-types";
import { categoryPaths, getCategoryById, invalidateCatalog } from "@/lib/catalog";
import {
  revalidateCarText,
  revalidateImages,
  revalidateProduct,
  revalidateSite,
} from "@/lib/revalidate";
import { getProductRaw } from "@/lib/product-store";
import { requireAdmin } from "@/lib/auth";
import { fail, type FormState, ok } from "./form-state";

export async function saveCarEntryAction(
  level: unknown,
  input: CarEntryInput,
): Promise<FormState & { id?: string }> {
  await requireAdmin();
  if (!isCarLevel(level) || !input || typeof input !== "object") {
    return fail(["Некорректный запрос"]);
  }

  const imageUrl = String(input.imageUrl ?? "").trim();
  let image = input.image;
  if (imageUrl) {
    image = await downloadCarImage(level, imageUrl);
    if (!image) {
      return fail([
        "Не удалось скачать фото по ссылке — нужна прямая ссылка на картинку (jpg, png, webp)",
      ]);
    }
    revalidateImages();
  }

  const result = saveCarEntry(level, { ...input, image });
  if (!result.ok) return fail(result.problems);

  revalidateSite();
  return { ...ok(), id: result.id };
}

export async function deleteCarEntryAction(
  level: unknown,
  id: unknown,
): Promise<FormState> {
  await requireAdmin();
  if (!isCarLevel(level) || typeof id !== "string") {
    return fail(["Некорректный запрос"]);
  }

  const result = deleteCarEntry(level, id);
  if (!result.ok) return fail(result.problems);

  revalidateSite();
  return ok();
}

export async function setProductCarsAction(
  productId: string,
  generationIds: string[],
): Promise<FormState> {
  await requireAdmin();
  const product = getProductRaw(productId);
  if (!product) return fail(["Товар не найден"]);
  if (!isCarFitmentCategory(product.categoryId)) return fail(["У раздела товара нет подбора по машинам"]);
  const beforeCarPaths = carPathsForProduct(productId);
  const ids = Array.isArray(generationIds) ? generationIds.map(String) : [];
  setProductCars(productId, ids);
  await fetchCarImages(ids);
  invalidateCatalog();
  revalidateProduct(
    product.slug,
    categoryPaths(product.categoryId),
    { carPaths: beforeCarPaths },
    carPathsForProduct(productId),
  );
  return ok();
}

export async function saveCarTextAction(categoryId: string, modelId: string, text: string): Promise<FormState> {
  await requireAdmin();
  const category = getCategoryById(categoryId);
  if (!category || !isCarFitmentCategory(categoryId)) return fail(["Раздел не подбирается по автомобилю"]);
  const mark = getCarTree(categoryId).find((entry) => entry.models.some((model) => model.id === modelId));
  const model = mark?.models.find((entry) => entry.id === modelId);
  if (!mark || !model) return fail(["К этой модели в разделе не привязано ни одного товара"]);

  saveCarText(categoryId, modelId, text);
  revalidateCarText(modelUrl(mark.slug, model.slug, carsRoot(category.slug)));
  return ok();
}
