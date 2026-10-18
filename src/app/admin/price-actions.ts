"use server";

import { invalidateCatalog } from "@/lib/catalog";
import { revalidateSite } from "@/lib/revalidate";
import {
  forgetVdfSession,
  requestVdfCode,
  loadVdfPrices,
  verifyVdfCode,
} from "@/lib/vdf-prices";
import { requireAdmin } from "@/lib/auth";
import { type CurrencyRates } from "@/lib/currency";
import { currentRates, refreshLinkedPrices } from "@/lib/linked-prices";
import { fail, type FormState, ok } from "./form-state";

export async function getRatesAction(): Promise<CurrencyRates> {
  await requireAdmin();
  return currentRates();
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
