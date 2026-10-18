"use server";

import { redirect } from "next/navigation";
import {
  categoryPaths,
  categorySubtreePaths,
  getChildCategories,
  invalidateCatalog,
} from "@/lib/catalog";
import { revalidateCategory, revalidateSite } from "@/lib/revalidate";
import {
  deleteCategory,
  getCategoryRaw,
  reorderCategories,
  saveCategory,
} from "@/lib/category-store";
import { requireAdmin } from "@/lib/auth";
import { fail, type FormState, ok, toState } from "./form-state";

/* ------------------------------------------------------------------ */
/* Разделы                                                             */
/* ------------------------------------------------------------------ */

export async function saveCategoryAction(
  input: unknown,
  previousId?: string,
  /** Забрать товары родителя в этот подраздел — см. saveCategory. */
  adoptProducts = false,
): Promise<FormState> {
  await requireAdmin();

  // Адреса поддерева до правки: если поменяли slug или переложили раздел
  // в другого родителя, старые страницы тоже надо пересобрать.
  const beforePaths = previousId ? categorySubtreePaths(previousId) : [];

  const result = saveCategory(input, previousId, adoptProducts);
  if (!result.ok) return toState(result);

  invalidateCatalog();
  revalidateCategory(
    [
      ...categorySubtreePaths((input as { id: string }).id),
      // Товары могли уехать из родителя в новый подраздел — его страница
      // тоже поменялась.
      ...categoryPaths((input as { parentId?: string }).parentId),
    ],
    beforePaths,
  );

  return ok();
}

/**
 * Удаление раздела. `moveTo` — куда переехать товарам из него.
 *
 * Адрес раздела-приёмника берём до удаления: после него getCategoryRaw
 * вернёт ту же запись, но пересобрать нужно обе страницы — и ту, что
 * исчезла, и ту, где товаров стало больше.
 */
export async function deleteCategoryAction(
  id: string,
  moveTo?: string,
): Promise<FormState> {
  await requireAdmin();

  const category = getCategoryRaw(id);
  if (!category) return fail(["Раздел не найден"]);

  if (moveTo && !getCategoryRaw(moveTo)) {
    return fail(["Раздел, в который переносим товары, не найден"]);
  }

  // Адреса собираем до удаления: после него ни раздела, ни его подразделов
  // в дереве уже нет, а пересобрать их страницы всё равно надо.
  const gone = categorySubtreePaths(id);
  const target = moveTo ? categoryPaths(moveTo) : [];
  // Подразделы поднимутся на верхний уровень, то есть получат новые,
  // короткие адреса — их тоже надо собрать.
  const promoted = getChildCategories(id).map((child) => `/catalog/${child.slug}/`);

  const result = deleteCategory(id, moveTo);
  if (!result.ok) return toState(result);

  invalidateCatalog();
  revalidateCategory([...gone, ...promoted, ...target]);

  redirect("/admin/categories/");
}

export async function reorderCategoriesAction(
  ids: string[],
): Promise<FormState> {
  await requireAdmin();
  if (!Array.isArray(ids) || ids.some((id) => typeof id !== "string")) {
    return fail(["Некорректный порядок"]);
  }

  reorderCategories(ids);
  invalidateCatalog();
  revalidateSite(); // порядок разделов виден в меню на каждой странице

  return ok();
}
