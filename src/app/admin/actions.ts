"use server";

import { join } from "node:path";

import { redirect } from "next/navigation";
import { headers } from "next/headers";

import {
  carPathsForProduct,
  deleteCarEntry,
  fetchCarImages,
  isCarFitmentCategory,
  isCarLevel,
  saveCarEntry,
  setProductCars,
} from "@/lib/cars";
import type { CarEntryInput } from "@/lib/car-types";
import {
  categoryPaths,
  categorySubtreePaths,
  getChildCategories,
  invalidateCatalog,
} from "@/lib/catalog";
import { removeImageFiles } from "@/lib/image-pipeline.mjs";
import { deleteImage, getImage, imageUsage } from "@/lib/images";
import { isOrderStatus } from "@/lib/order-types";
import { deleteOrder, setOrderNote, setOrderStatus } from "@/lib/orders";
import {
  revalidateCategory,
  revalidateImages,
  revalidateProduct,
  revalidateSite,
} from "@/lib/revalidate";
import {
  deleteCategory,
  deleteProduct,
  deleteProducts,
  getCategoryRaw,
  getProductRaw,
  nextSku,
  reorderCategories,
  reorderProducts,
  saveCategory,
  saveProduct,
  saveSite,
  setProductPrice,
  setProductStockQty,
  type SaveResult,
} from "@/lib/store";
import { login, logout, requireAdmin } from "@/lib/auth";

/**
 * Действия админки.
 *
 * Каждое начинается с requireAdmin(). Это не перестраховка: Server Actions —
 * обычные POST-адреса, до них можно достучаться в обход интерфейса, а
 * проверка в proxy.ts смотрит только на наличие куки. Настоящая проверка
 * сессии — здесь.
 *
 * Данные приходят готовыми объектами, а не FormData: у товара внутри опции с
 * вложенными значениями и галереями, и раскладывать такое по полям формы
 * значило бы собирать его обратно вручную с обеих сторон. Проверяет объекты
 * всё равно zod в src/lib/store.ts, так что доверия входным данным не больше,
 * чем при FormData.
 */

export interface FormState {
  ok: boolean;
  problems: string[];
  /** Отметка времени: по ней интерфейс понимает, что ответ новый. */
  at: number;
}

const ok = (): FormState => ({ ok: true, problems: [], at: Date.now() });
const fail = (problems: string[]): FormState => ({
  ok: false,
  problems,
  at: Date.now(),
});

function toState(result: SaveResult): FormState {
  return result.ok ? ok() : fail(result.problems);
}

/* ------------------------------------------------------------------ */
/* Вход и выход                                                        */
/* ------------------------------------------------------------------ */

export async function loginAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const name = String(formData.get("login") ?? "");
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "");

  if (!name || !password) return fail(["Заполните логин и пароль"]);

  const userAgent = (await headers()).get("user-agent") ?? "";
  const result = await login(name, password, userAgent);

  if (!result.ok) return fail([result.error]);

  // Возвращаем туда, откуда человека развернули на форму входа. Чужие адреса
  // сюда подставить нельзя: берём только путь внутри админки.
  redirect(next.startsWith("/admin") ? next : "/admin/");
}

export async function logoutAction(): Promise<void> {
  await logout();
  redirect("/admin/login/");
}

/* ------------------------------------------------------------------ */
/* Товары                                                              */
/* ------------------------------------------------------------------ */

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

  const result = saveProduct(input, previousId);
  if (!result.ok) return toState(result);

  const product = input as { id: string; slug: string; categoryId: string };

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

  const result = setProductPrice(id, price);
  if (!result.ok) return toState(result);

  invalidateCatalog();
  revalidateProduct(product.slug, categoryPaths(product.categoryId));

  return ok();
}

/**
 * Складской остаток. Пересобирать страницы не нужно: на витрине этого
 * числа нет, оно только для внутреннего учёта.
 */
export async function setProductStockQtyAction(
  id: string,
  qty: number | null,
): Promise<FormState> {
  await requireAdmin();

  const result = setProductStockQty(id, qty);
  if (!result.ok) return toState(result);

  invalidateCatalog();
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

/* ------------------------------------------------------------------ */
/* Настройки сайта                                                     */
/* ------------------------------------------------------------------ */

export async function saveSiteAction(input: unknown): Promise<FormState> {
  await requireAdmin();

  const result = saveSite(input);
  if (!result.ok) return toState(result);

  invalidateCatalog();
  revalidateSite();

  return ok();
}

/* ------------------------------------------------------------------ */
/* Заказы                                                              */
/* ------------------------------------------------------------------ */

export async function setOrderStatusAction(
  id: number,
  status: string,
): Promise<FormState> {
  await requireAdmin();
  if (!isOrderStatus(status)) return fail(["Неизвестный статус"]);

  setOrderStatus(id, status);
  return ok();
}

export async function setOrderNoteAction(
  id: number,
  note: string,
): Promise<FormState> {
  await requireAdmin();
  setOrderNote(id, String(note ?? "").trim());
  return ok();
}

export async function deleteOrderAction(id: number): Promise<FormState> {
  await requireAdmin();
  deleteOrder(id);
  redirect("/admin/orders/");
}

/* ------------------------------------------------------------------ */
/* Фотографии                                                          */
/* ------------------------------------------------------------------ */

export async function deleteImageAction(path: string): Promise<FormState> {
  await requireAdmin();

  const entry = getImage(path);
  if (!entry) return fail(["Такой фотографии нет"]);

  // Фото, которое где-то стоит, удалять не даём: на его месте молча появилась
  // бы заглушка, и заметили бы это нескоро.
  const used = imageUsage(path);
  if (used.length) {
    return fail([
      `Фото используется: ${used.slice(0, 5).join(", ")}${
        used.length > 5 ? ` и ещё ${used.length - 5}` : ""
      }. Сначала уберите его оттуда.`,
    ]);
  }

  // Сначала запись, потом файлы: если удаление файлов сорвётся на половине,
  // в public/img останется мусор, но битой ссылки в каталоге не появится.
  deleteImage(path);
  await removeImageFiles(entry, join(process.cwd(), "public"));

  revalidateImages();
  return ok();
}

export async function saveCarEntryAction(
  level: unknown,
  input: CarEntryInput,
): Promise<FormState & { id?: string }> {
  await requireAdmin();
  if (!isCarLevel(level) || !input || typeof input !== "object") {
    return fail(["Некорректный запрос"]);
  }

  const result = saveCarEntry(level, input);
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
