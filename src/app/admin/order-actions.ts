"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { invalidateCatalog } from "@/lib/catalog";
import { isOrderStatus } from "@/lib/order-types";
import { syncCrm } from "@/lib/crm-sync";
import { findOrderVariants, type OrderVariantOption } from "@/lib/order-catalog";
import {
  deleteOrder,
  getOrder,
  markReviewRequested,
  setOrderNote,
  setOrderStatus,
  setOrderTotal,
  updateOrderItems,
  type OrderLineInput,
} from "@/lib/orders";
import { REVIEW_PAGE_PATH } from "@/lib/review-links";

import { getSite } from "@/lib/catalog";
import {
  getSmsSettings,
  renderTemplate,
  sendSms,
  smsConfigured,
} from "@/lib/sms";
import { normalizePhone } from "@/lib/phone";
import { productsSharingStock } from "@/lib/shared-stock";
import { requireAdmin } from "@/lib/auth";
import { revalidateProductsById } from "@/lib/stock-revalidate";
import { fail, type FormState, ok } from "./form-state";

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
  after(syncCrm);
  revalidatePath("/admin", "layout");
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

export async function setOrderTotalAction(id: number, total: number | null): Promise<FormState> {
  await requireAdmin();
  const result = setOrderTotal(Number(id), total === null ? null : Number(total));
  if (!result.ok) return fail(result.problems);
  after(syncCrm);
  revalidatePath("/admin", "layout");
  return ok();
}

export async function updateOrderItemsAction(
  id: number,
  lines: OrderLineInput[],
): Promise<FormState> {
  await requireAdmin();
  if (!Array.isArray(lines)) return fail(["Пустой состав заказа"]);
  const result = updateOrderItems(
    Number(id),
    lines.slice(0, 100).map((line) => ({ key: String(line?.key ?? ""), qty: Number(line?.qty) })),
  );
  if (!result.ok) return fail(result.problems);
  if (result.changed.length) {
    invalidateCatalog();
    revalidateProductsById(
      result.changed.flatMap(({ productId }) => productsSharingStock(productId)),
    );
  }
  after(syncCrm);
  revalidatePath("/admin", "layout");
  return ok();
}

export async function searchOrderVariantsAction(
  orderId: number,
  query: string,
): Promise<OrderVariantOption[]> {
  await requireAdmin();
  const order = getOrder(Number(orderId));
  if (!order) return [];
  return findOrderVariants(String(query ?? "").slice(0, 100), {
    staff: order.staff,
    wholesale: order.wholesale,
  });
}

export async function requestReviewAction(orderId: number): Promise<FormState> {
  await requireAdmin();
  const order = getOrder(Number(orderId));
  if (!order) return fail(["Заказ не найден"]);
  if (order.status !== "done") return fail(["Отзыв просим только после выполнения заказа"]);
  if (order.reviewSmsAt) return fail(["Просьбу об отзыве по этому заказу уже отправляли"]);
  if (!smsConfigured()) return fail(["SMS не настроены: Настройки → SMS"]);
  const phone = normalizePhone(order.phoneDigits);
  if (!phone) return fail(["У заказа не белорусский номер — SMS не отправить"]);

  const site = getSite();
  try {
    await sendSms(
      phone,
      renderTemplate(getSmsSettings().reviewTemplate, {
        name: order.name.split(" ")[0] || order.name,
        siteName: site.name,
        link: `${site.url.replace(/\/$/, "")}${REVIEW_PAGE_PATH}`,
      }),
    );
  } catch (error) {
    return fail([(error as Error).message]);
  }
  markReviewRequested(order.id);
  revalidatePath(`/admin/orders/${order.id}`);
  return ok();
}

export async function deleteOrderAction(id: number): Promise<FormState> {
  await requireAdmin();
  const returned = deleteOrder(id);
  if (returned.length) {
    invalidateCatalog();
    revalidateProductsById(returned.flatMap(({ productId }) => productsSharingStock(productId)));
  }
  after(syncCrm);
  revalidatePath("/admin", "layout");
  redirect("/admin/orders/");
}
