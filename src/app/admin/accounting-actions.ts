"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { FormState } from "@/app/admin/actions";
import { addWriteoff, deleteWriteoff } from "@/lib/accounting";
import { requireAdmin } from "@/lib/auth";
import { syncCrm } from "@/lib/crm-sync";

const ACCOUNTING_PATH = "/admin/accounting";

const ok = (): FormState => ({ ok: true, problems: [], at: Date.now() });
const fail = (problems: string[]): FormState => ({ ok: false, problems, at: Date.now() });

const writeoffSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Укажите дату"),
  description: z.string().trim().min(1, "Укажите цель списания").max(300, "Цель — не длиннее 300 знаков"),
  amount: z
    .number({ error: "Укажите сумму" })
    .finite("Укажите сумму")
    .positive("Сумма должна быть больше нуля")
    .max(10_000_000, "Слишком большая сумма"),
  person: z.string().trim().min(1, "Укажите, кто списывает").max(150, "Имя — не длиннее 150 знаков"),
});

function writeoffTimestamp(date: string): number {
  const [year, month, day] = date.split("-").map(Number);
  const today = new Date();
  if (year === today.getFullYear() && month === today.getMonth() + 1 && day === today.getDate()) {
    return today.getTime();
  }
  return new Date(year, month - 1, day, 12).getTime();
}

export async function addWriteoffAction(input: unknown): Promise<FormState> {
  await requireAdmin();
  const parsed = writeoffSchema.safeParse(input);
  if (!parsed.success) return fail([...new Set(parsed.error.issues.map((issue) => issue.message))]);

  const timestamp = writeoffTimestamp(parsed.data.date);
  if (Number.isNaN(timestamp) || timestamp > Date.now() + 24 * 60 * 60 * 1000) {
    return fail(["Некорректная дата"]);
  }
  addWriteoff({ ...parsed.data, date: timestamp });
  revalidatePath(ACCOUNTING_PATH);
  return ok();
}

export async function deleteWriteoffAction(id: number): Promise<FormState> {
  await requireAdmin();
  if (!Number.isInteger(id) || id <= 0) return fail(["Запись не найдена"]);
  deleteWriteoff(id);
  revalidatePath(ACCOUNTING_PATH);
  return ok();
}

export async function refreshCrmPaymentsAction(): Promise<FormState> {
  await requireAdmin();
  const report = await syncCrm();
  revalidatePath("/admin", "layout");
  if (!report.configured) return fail(["CRM не подключена: заполните CRM_URL и CRM_INTEGRATION_KEY в .env"]);
  if (report.paymentsError) return fail([`Не удалось получить оплаты из CRM: ${report.paymentsError}`]);
  return ok();
}
