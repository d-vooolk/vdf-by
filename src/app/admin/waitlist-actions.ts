"use server";

import { requireAdmin } from "@/lib/auth";
import { getProductById, getProducts } from "@/lib/catalog";
import { getCustomerById } from "@/lib/customers";
import { normalizePhone } from "@/lib/phone";
import { normalize } from "@/lib/search";
import { hasAnyInStock } from "@/lib/variant";
import {
  addWaitlistEntry,
  deleteWaitlistEntry,
  isWaitlistStatus,
  setWaitlistNote,
  setWaitlistStatus,
} from "@/lib/waitlist";
import { fail, type FormState, ok } from "./form-state";

export interface WaitlistProductOption {
  id: string;
  title: string;
  sku: string;
  inStock: boolean;
}

export async function searchWaitlistProductsAction(query: string): Promise<WaitlistProductOption[]> {
  await requireAdmin();
  const words = normalize(query).split(" ").filter(Boolean);
  if (!words.length) return [];
  return getProducts()
    .filter((product) => {
      const haystack = normalize(`${product.title} ${product.sku ?? ""}`);
      return words.every((word) => haystack.includes(word));
    })
    .slice(0, 20)
    .map((product) => ({
      id: product.id,
      title: product.title,
      sku: product.sku ?? "",
      inStock: hasAnyInStock(product),
    }));
}

export interface WaitlistInput {
  customerId: number | null;
  name: string;
  phone: string;
  productId: string | null;
  productTitle: string;
  qty: number;
  note: string;
}

export async function addWaitlistAction(input: WaitlistInput): Promise<FormState> {
  await requireAdmin();
  const product = input.productId ? getProductById(input.productId) : undefined;
  const productTitle = product?.title ?? input.productTitle.trim().slice(0, 300);
  if (!productTitle) return fail(["Выберите товар или впишите, что человек ждёт"]);
  const qty = Math.max(1, Math.min(999, Math.floor(Number(input.qty) || 1)));
  const note = input.note.trim().slice(0, 1000);

  if (input.customerId) {
    const company = getCustomerById(input.customerId);
    if (!company) return fail(["Компания не найдена"]);
    addWaitlistEntry({ customerId: company.id, name: "", phone: "", productId: product?.id ?? null, productTitle, qty, note });
    return ok();
  }

  const name = input.name.trim().slice(0, 160);
  const phone = normalizePhone(input.phone);
  if (name.length < 2) return fail(["Укажите имя или выберите компанию"]);
  if (!phone) return fail(["Номер нужен белорусский: +375 XX XXX-XX-XX"]);
  addWaitlistEntry({ customerId: null, name, phone, productId: product?.id ?? null, productTitle, qty, note });
  return ok();
}

export async function setWaitlistStatusAction(id: number, status: string): Promise<FormState> {
  await requireAdmin();
  if (!isWaitlistStatus(status)) return fail(["Неизвестный статус"]);
  setWaitlistStatus(id, status);
  return ok();
}

export async function setWaitlistNoteAction(id: number, note: string): Promise<FormState> {
  await requireAdmin();
  setWaitlistNote(id, note);
  return ok();
}

export async function deleteWaitlistAction(id: number): Promise<FormState> {
  await requireAdmin();
  deleteWaitlistEntry(id);
  return ok();
}
