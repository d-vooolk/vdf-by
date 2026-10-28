"use server";

import { setServiceRequestDone } from "@/lib/service";
import { getSite } from "@/lib/catalog";
import {
  deleteCustomer,
  getCustomerById,
  setCustomerNote,
  setCustomerSeller,
  setCustomerStaff,
  setWholesaleStatus,
} from "@/lib/customers";
import {
  getSmsSettings,
  renderTemplate,
  sendSms,
  smsConfigured,
} from "@/lib/sms";
import { requireAdmin } from "@/lib/auth";
import { fail, type FormState, ok } from "./form-state";

export async function setWholesaleStatusAction(
  customerId: number,
  status: "approved" | "rejected" | "none",
): Promise<FormState> {
  await requireAdmin();
  const customer = getCustomerById(customerId);
  if (!customer) return fail(["Покупатель не найден"]);
  if (customer.staff || !setWholesaleStatus(customerId, status)) {
    return fail(["Сотрудник не может быть оптовиком — сначала снимите роль сотрудника"]);
  }
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

export async function setServiceRequestDoneAction(id: number, done: boolean): Promise<FormState> {
  await requireAdmin();
  setServiceRequestDone(Number(id), done === true);
  return ok();
}

export async function setCustomerStaffAction(customerId: number, staff: boolean): Promise<FormState> {
  await requireAdmin();
  if (!getCustomerById(customerId)) return fail(["Покупатель не найден"]);
  setCustomerStaff(customerId, staff === true);
  return ok();
}

export async function setCustomerSellerAction(customerId: number, seller: boolean): Promise<FormState> {
  await requireAdmin();
  if (!getCustomerById(customerId)) return fail(["Покупатель не найден"]);
  setCustomerSeller(customerId, seller === true);
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
