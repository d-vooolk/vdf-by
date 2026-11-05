"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { fail, type FormState, ok } from "@/app/admin/form-state";
import { addLedgerEntry, deleteLedgerEntry, updateLedgerEntry } from "@/lib/accounting";
import { requireAdmin } from "@/lib/auth";
import { syncCrm } from "@/lib/crm-sync";
import { DEBT_CURRENCIES } from "@/lib/debt-types";
import { createDebt, deleteDebt, payDebt, updateDebt } from "@/lib/debts";
import { getEurRate, getUsdRate } from "@/lib/rates";

const ACCOUNTING_PATH = "/admin/accounting";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Укажите дату");

const amountSchema = z
  .number({ error: "Укажите сумму" })
  .finite("Укажите сумму")
  .positive("Сумма должна быть больше нуля")
  .max(10_000_000, "Слишком большая сумма");

const categorySchema = z.string().trim().max(60, "Категория — не длиннее 60 знаков");

const entrySchema = z
  .object({
    kind: z.enum(["in", "out"]),
    date: dateSchema,
    description: z.string().trim().max(300, "Описание — не длиннее 300 знаков"),
    category: categorySchema,
    amount: amountSchema,
  })
  .superRefine((value, context) => {
    if (!value.description) {
      context.addIssue({ code: "custom", message: value.kind === "out" ? "Укажите цель" : "Укажите источник" });
    }
    if (value.kind === "out" && !value.category) {
      context.addIssue({ code: "custom", message: "Укажите категорию" });
    }
  });

const entryUpdateSchema = z.object({
  date: dateSchema,
  description: z.string().trim().min(1, "Укажите описание").max(300, "Описание — не длиннее 300 знаков"),
  category: categorySchema,
  amount: amountSchema,
});

const debtSchema = z.object({
  description: z.string().trim().min(1, "Укажите, за что долг").max(300, "Описание — не длиннее 300 знаков"),
  amount: amountSchema,
  currency: z.enum(DEBT_CURRENCIES),
  direction: z.enum(["we_owe", "owed_to_us"]),
  category: categorySchema,
});

const debtUpdateSchema = z.object({
  description: z.string().trim().min(1, "Укажите, за что долг").max(300, "Описание — не длиннее 300 знаков"),
  amount: amountSchema,
  category: categorySchema,
});

const debtPaymentSchema = z.object({
  amount: amountSchema,
  currency: z.enum(DEBT_CURRENCIES),
  rate: z.number().finite().positive("Курс должен быть больше нуля").max(1000, "Слишком большой курс").nullable(),
});

const issues = (error: z.ZodError) => fail([...new Set(error.issues.map((issue) => issue.message))]);

const validId = (id: unknown): id is number => Number.isInteger(id) && (id as number) > 0;

function entryTimestamp(date: string): number {
  const [year, month, day] = date.split("-").map(Number);
  const today = new Date();
  if (year === today.getFullYear() && month === today.getMonth() + 1 && day === today.getDate()) {
    return today.getTime();
  }
  return new Date(year, month - 1, day, 12).getTime();
}

function checkedTimestamp(date: string): number | null {
  const timestamp = entryTimestamp(date);
  if (Number.isNaN(timestamp) || timestamp > Date.now() + 24 * 60 * 60 * 1000) return null;
  return timestamp;
}

function done(): FormState {
  revalidatePath(ACCOUNTING_PATH);
  return ok();
}

function result(problems: string[]): FormState {
  return problems.length ? fail(problems) : done();
}

export async function addLedgerEntryAction(input: unknown): Promise<FormState> {
  const admin = await requireAdmin();
  const parsed = entrySchema.safeParse(input);
  if (!parsed.success) return issues(parsed.error);
  const date = checkedTimestamp(parsed.data.date);
  if (date === null) return fail(["Некорректная дата"]);
  addLedgerEntry({ ...parsed.data, date, person: admin.login });
  return done();
}

export async function updateLedgerEntryAction(id: number, input: unknown): Promise<FormState> {
  await requireAdmin();
  if (!validId(id)) return fail(["Запись не найдена"]);
  const parsed = entryUpdateSchema.safeParse(input);
  if (!parsed.success) return issues(parsed.error);
  const date = checkedTimestamp(parsed.data.date);
  if (date === null) return fail(["Некорректная дата"]);
  return result(updateLedgerEntry(id, { ...parsed.data, date }));
}

export async function deleteLedgerEntryAction(id: number): Promise<FormState> {
  await requireAdmin();
  if (!validId(id)) return fail(["Запись не найдена"]);
  deleteLedgerEntry(id);
  return done();
}

export async function createDebtAction(input: unknown): Promise<FormState> {
  await requireAdmin();
  const parsed = debtSchema.safeParse(input);
  if (!parsed.success) return issues(parsed.error);
  return result(createDebt(parsed.data));
}

export async function updateDebtAction(id: number, input: unknown): Promise<FormState> {
  await requireAdmin();
  if (!validId(id)) return fail(["Долг не найден"]);
  const parsed = debtUpdateSchema.safeParse(input);
  if (!parsed.success) return issues(parsed.error);
  return result(updateDebt(id, parsed.data));
}

export async function deleteDebtAction(id: number): Promise<FormState> {
  await requireAdmin();
  if (!validId(id)) return fail(["Долг не найден"]);
  return result(deleteDebt(id));
}

export async function payDebtAction(id: number, input: unknown): Promise<FormState> {
  const admin = await requireAdmin();
  if (!validId(id)) return fail(["Долг не найден"]);
  const parsed = debtPaymentSchema.safeParse(input);
  if (!parsed.success) return issues(parsed.error);
  return result(payDebt(id, parsed.data, admin.login));
}

export async function currencyRatesAction(): Promise<{ USD: number | null; EUR: number | null }> {
  await requireAdmin();
  const [usd, eur] = await Promise.all([getUsdRate(), getEurRate()]);
  return { USD: usd?.rate ?? null, EUR: eur?.rate ?? null };
}

export async function refreshCrmPaymentsAction(): Promise<FormState> {
  await requireAdmin();
  const report = await syncCrm();
  revalidatePath("/admin", "layout");
  if (!report.configured) return fail(["CRM не подключена: заполните CRM_URL и CRM_INTEGRATION_KEY в .env"]);
  if (report.paymentsError) return fail([`Не удалось получить оплаты из CRM: ${report.paymentsError}`]);
  return ok();
}
