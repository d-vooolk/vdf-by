"use server";

import { join } from "node:path";

import { redirect } from "next/navigation";
import { cookies, headers } from "next/headers";

import {
  carPathsForProduct,
  deleteCarEntry,
  downloadCarImage,
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
import { deleteImage, getImage, imageUsage, usedImagePaths } from "@/lib/images";
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
  setProductFaq,
  setProductPrice,
  setProductStockQty,
  type SaveResult,
} from "@/lib/store";
import { listIncompleteProducts } from "@/lib/incomplete";
import {
  AI_TASKS,
  AiError,
  aiConfigured,
  checkConnection,
  complete,
  describeProduct,
  getPrompts,
  MAX_PROMPT,
  parseFaq,
  promptFor,
  savePrompt,
  type AiProductInput,
  type AiTask,
} from "@/lib/ai";
import { LAST_CATEGORY_COOKIE } from "@/lib/admin-prefs";
import {
  escapeTelegram,
  getTelegramSettings,
  saveTelegramSettings,
  sendTelegramTo,
  telegramBot,
  telegramChats,
  type TelegramBot,
  type TelegramChat,
  type TelegramSettings,
} from "@/lib/telegram";
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
import { frameMembers, frameMembershipOf, setFrameMembership } from "@/lib/frame-membership";
import type { Product } from "@/lib/schema";
import { getSite } from "@/lib/catalog";
import {
  deleteCustomer,
  getCustomerById,
  setCustomerNote,
  setWholesaleStatus,
} from "@/lib/customers";
import {
  checkSmsConnection,
  getSmsSettings,
  renderTemplate,
  saveSmsSettings,
  sendSms,
  smsConfigured,
  type SmsConnection,
  type SmsSettings,
} from "@/lib/sms";
import {
  forgetVdfSession,
  requestVdfCode,
  loadVdfPrices,
  verifyVdfCode,
} from "@/lib/vdf-prices";
import { normalizePhone } from "@/lib/phone";
import { productsSharingStock, setGroupStock, stockGroupOf } from "@/lib/shared-stock";
import { login, logout, requireAdmin } from "@/lib/auth";
import { relinkValues, type CurrencyRates } from "@/lib/currency";
import { currentRates, refreshLinkedPrices, relinkInput } from "@/lib/linked-prices";

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

function revalidateProductsById(ids: Iterable<string>): void {
  for (const id of new Set(ids)) {
    const product = getProductRaw(id);
    if (!product) continue;
    revalidateProduct(product.slug, categoryPaths(product.categoryId), undefined, carPathsForProduct(id));
  }
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
  const result = saveProduct(await relinkInput(locked ? withFrameFields(input, locked) : input), previousId);
  if (!result.ok) return toState(result);

  const product = input as { id: string; slug: string; categoryId: string; stockQty?: number | null };
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

  const moved = setOrderStatus(id, status);
  if (moved.length) {
    invalidateCatalog();
    revalidateProductsById(moved.flatMap(({ productId }) => productsSharingStock(productId)));
  }
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

const UNUSED_BATCH = 200;

export async function deleteUnusedImagesAction(
  paths: string[],
): Promise<FormState & { deleted: string[] }> {
  await requireAdmin();
  if (!Array.isArray(paths) || paths.length > UNUSED_BATCH) {
    return { ...fail(["Некорректный запрос"]), deleted: [] };
  }

  const used = usedImagePaths();
  const deleted: string[] = [];
  const skipped: string[] = [];
  const publicDir = join(process.cwd(), "public");

  for (const path of paths) {
    const entry = typeof path === "string" ? getImage(path) : null;
    if (!entry) continue;
    if (used.has(path)) {
      skipped.push(path);
      continue;
    }
    deleteImage(path);
    await removeImageFiles(entry, publicDir);
    deleted.push(path);
  }

  if (deleted.length) revalidateImages();
  const problems = skipped.length
    ? [`Пропущено ${skipped.length}: эти фото успели снова начать использоваться`]
    : [];
  return { ok: true, problems, at: Date.now(), deleted };
}

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

export async function getRatesAction(): Promise<CurrencyRates> {
  await requireAdmin();
  return currentRates();
}

export type { AiProductInput } from "@/lib/ai";

export type AiFaqResult =
  | { ok: true; items: Array<{ q: string; a: string }> }
  | { ok: false; error: string };

function aiFailure(error: unknown): { ok: false; error: string } {
  if (error instanceof AiError) return { ok: false, error: error.message };
  console.error("[ai]", error);
  return { ok: false, error: "Не получилось: внутренняя ошибка, подробности в логе сервера" };
}

export async function aiFaqAction(input: AiProductInput): Promise<AiFaqResult> {
  await requireAdmin();
  if (!input.title?.trim()) return { ok: false, error: "Сначала заполните название" };

  try {
    const answer = await complete(promptFor("faq", input.prompt), describeProduct(input, true), "faq");
    const items = parseFaq(answer);
    if (!items.length) {
      return { ok: false, error: "Нейросеть не предложила ни одного вопроса — попробуйте ещё раз" };
    }
    return { ok: true, items };
  } catch (error) {
    return aiFailure(error);
  }
}

export type AiFaqBatchResult =
  | { ok: true; done: number; left: number; failed: string[] }
  | { ok: false; error: string };

const FAQ_BATCH = 3;

export async function aiFillFaqAction(skip: string[] = []): Promise<AiFaqBatchResult> {
  await requireAdmin();
  if (!aiConfigured()) return { ok: false, error: "Нейросеть не подключена: нет AI_API_KEY в .env" };

  const skipped = new Set(Array.isArray(skip) ? skip : []);
  const pending = listIncompleteProducts().filter(
    (product) => product.gaps.includes("faq") && !skipped.has(product.id),
  );

  let done = 0;
  const failed: string[] = [];

  for (const brief of pending.slice(0, FAQ_BATCH)) {
    const product = getProductRaw(brief.id);
    if (!product) continue;
    try {
      const answer = await complete(
        promptFor("faq", undefined),
        describeProduct(
          {
            title: product.title,
            description: product.description ?? "",
            categoryName: getCategoryRaw(product.categoryId)?.name,
            brand: product.brand,
            specs: product.specs,
            options: product.optionGroups.map(
              (group) => `${group.name}: ${group.values.map((value) => value.label).join(", ")}`,
            ),
          },
          true,
        ),
        "faq",
      );
      const items = parseFaq(answer);
      if (!items.length || !setProductFaq(product.id, items).ok) {
        failed.push(product.id);
        continue;
      }
      invalidateCatalog();
      revalidateProduct(product.slug, categoryPaths(product.categoryId));
      done++;
    } catch (error) {
      if (!(error instanceof AiError)) console.error("[ai]", error);
      failed.push(product.id);
    }
  }

  const left = Math.max(0, pending.length - done - failed.length);
  return { ok: true, done, left, failed };
}

export async function saveAiPromptAction(
  task: AiTask,
  prompt: string | null,
): Promise<Record<AiTask, string>> {
  await requireAdmin();
  if (!AI_TASKS.includes(task)) return getPrompts();
  savePrompt(task, typeof prompt === "string" ? prompt.slice(0, MAX_PROMPT) : null);
  return getPrompts();
}

export type AiCheckResult =
  | {
      ok: true;
      durationMs: number;
      firstTokenMs: number | null;
      model: string;
      provider: string;
      answer: string;
      cost: number | null;
    }
  | { ok: false; error: string };

export async function checkAiConnectionAction(): Promise<AiCheckResult> {
  await requireAdmin();
  try {
    const result = await checkConnection();
    return {
      ok: true,
      durationMs: result.durationMs,
      firstTokenMs: result.firstTokenMs,
      model: result.model,
      provider: result.provider,
      answer: result.answer,
      cost: result.usage.cost ?? null,
    };
  } catch (error) {
    return aiFailure(error);
  }
}

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

export async function setWholesaleStatusAction(
  customerId: number,
  status: "approved" | "rejected" | "none",
): Promise<FormState> {
  await requireAdmin();
  const customer = getCustomerById(customerId);
  if (!customer) return fail(["Покупатель не найден"]);
  setWholesaleStatus(customerId, status);
  if (status === "approved" && customer.wholesaleStatus !== "approved" && smsConfigured()) {
    try {
      await sendSms(
        customer.phone,
        renderTemplate(getSmsSettings().approvedTemplate, {
          name: customer.name,
          siteName: getSite().name,
        }),
      );
    } catch (error) {
      console.error("[customers] SMS об опте не ушло:", (error as Error).message);
    }
  }
  return ok();
}

export async function setCustomerNoteAction(customerId: number, note: string): Promise<FormState> {
  await requireAdmin();
  setCustomerNote(customerId, typeof note === "string" ? note : "");
  return ok();
}

export async function deleteCustomerAction(customerId: number): Promise<FormState> {
  await requireAdmin();
  deleteCustomer(customerId);
  return ok();
}

export async function saveSmsSettingsAction(input: Partial<SmsSettings>): Promise<FormState> {
  await requireAdmin();
  saveSmsSettings({
    enabled: input.enabled === true,
    token: typeof input.token === "string" ? input.token : "",
    alphanameId: typeof input.alphanameId === "string" ? input.alphanameId : "",
    alphaname: typeof input.alphaname === "string" ? input.alphaname : "",
    codeTemplate: typeof input.codeTemplate === "string" ? input.codeTemplate : "",
    approvedTemplate: typeof input.approvedTemplate === "string" ? input.approvedTemplate : "",
  });
  return ok();
}

export async function checkSmsAction(
  token: string,
): Promise<{ ok: true; info: SmsConnection } | { ok: false; error: string }> {
  await requireAdmin();
  try {
    const info = await checkSmsConnection(token.trim() || getSmsSettings().token);
    return { ok: true, info };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
}

export async function sendTestSmsAction(phone: string, message: string): Promise<FormState> {
  await requireAdmin();
  const digits = normalizePhone(phone);
  if (!digits) return fail(["Номер нужен белорусский: 375XXXXXXXXX"]);
  try {
    await sendSms(digits, message.trim() || `Тестовое сообщение от ${getSite().name}`);
    return ok();
  } catch (error) {
    return fail([(error as Error).message]);
  }
}

export async function saveTelegramSettingsAction(
  input: Partial<TelegramSettings>,
): Promise<FormState> {
  await requireAdmin();
  const next = {
    enabled: input.enabled === true,
    token: typeof input.token === "string" ? input.token : "",
    chatId: typeof input.chatId === "string" ? input.chatId : "",
    chatTitle: typeof input.chatTitle === "string" ? input.chatTitle : "",
  };
  const merged = { ...getTelegramSettings(), ...next, token: next.token.trim() || getTelegramSettings().token };
  if (merged.enabled && (!merged.token || !merged.chatId)) {
    return fail(["Чтобы включить отправку, нужны токен бота и чат"]);
  }
  saveTelegramSettings(next);
  return ok();
}

export type TelegramCheckResult =
  | { ok: true; bot: TelegramBot; chats: TelegramChat[] }
  | { ok: false; error: string };

export async function checkTelegramAction(token: string): Promise<TelegramCheckResult> {
  await requireAdmin();
  const key = token.trim() || getTelegramSettings().token;
  try {
    const bot = await telegramBot(key);
    const chats = await telegramChats(key);
    return { ok: true, bot, chats };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
}

export async function sendTestTelegramAction(token: string, chatId: string): Promise<FormState> {
  await requireAdmin();
  const settings = getTelegramSettings();
  try {
    await sendTelegramTo(
      token.trim() || settings.token,
      chatId.trim() || settings.chatId,
      `✅ <b>${escapeTelegram(getSite().name)}</b>: бот подключён. Сюда будут приходить новые заказы.`,
    );
    return ok();
  } catch (error) {
    return fail([(error as Error).message]);
  }
}

export async function requestVdfCodeAction(email: string): Promise<FormState> {
  await requireAdmin();
  const address = String(email ?? "").trim();
  if (!address.includes("@")) return fail(["Укажите почту, на которую заведён кабинет vdf-light.ru"]);
  try {
    await requestVdfCode(address);
    return ok();
  } catch (error) {
    return fail([(error as Error).message]);
  }
}

export async function verifyVdfCodeAction(email: string, code: string): Promise<FormState> {
  await requireAdmin();
  const digits = String(code ?? "").replace(/\D/g, "");
  if (!digits) return fail(["Введите код из письма"]);
  try {
    const session = await verifyVdfCode(String(email ?? "").trim(), digits);
    return session.wholesale
      ? ok()
      : fail(["Вход выполнен, но кабинет не оптовый — себестоимость заполняться не будет"]);
  } catch (error) {
    return fail([(error as Error).message]);
  }
}

export async function forgetVdfSessionAction(): Promise<FormState> {
  await requireAdmin();
  forgetVdfSession();
  return ok();
}

export async function loadVdfPricesAction(): Promise<FormState> {
  await requireAdmin();
  try {
    const report = await loadVdfPrices();
    return report.ok ? ok() : fail([report.error]);
  } catch (error) {
    return fail([(error as Error).message]);
  }
}

export async function refreshRatesAction(): Promise<FormState> {
  await requireAdmin();
  const report = await refreshLinkedPrices();
  if (report.products) {
    invalidateCatalog();
    revalidateSite();
  }
  return report.ok ? ok() : fail([report.error]);
}
