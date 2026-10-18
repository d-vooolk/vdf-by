"use server";

import { categoryPaths, invalidateCatalog } from "@/lib/catalog";
import { revalidateProduct } from "@/lib/revalidate";
import { getCategoryRaw } from "@/lib/category-store";
import { getProductRaw, setProductFaq } from "@/lib/product-store";
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
import { requireAdmin } from "@/lib/auth";

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
