"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";

import { AI_QUERIES, MANUAL_ENGINES, saveManualChecks, startAnswerCheck } from "@/lib/ai-seo";
import { requireAdmin } from "@/lib/auth";
import { parseCompetitors, runSeoCollection, saveCompetitors, type SeoKind } from "@/lib/seo-data";
import { saveKeywords, type SaveKeywordsResult } from "@/lib/seo-keywords";

export async function refreshSeoAction(kind: SeoKind): Promise<void> {
  await requireAdmin();
  const target: SeoKind = kind === "competitors" ? "competitors" : "search";
  const run = runSeoCollection(target);
  after(() => run);
  revalidatePath("/admin/seo");
}

export async function saveCompetitorsAction(text: string): Promise<{ ok: true; count: number }> {
  await requireAdmin();
  const domains = parseCompetitors(typeof text === "string" ? text : "");
  saveCompetitors(domains);
  revalidatePath("/admin/seo");
  return { ok: true, count: domains.length };
}

export async function saveSeoKeywordsAction(input: unknown): Promise<SaveKeywordsResult> {
  await requireAdmin();
  const result = saveKeywords(input);
  if (result.ok) revalidatePath("/admin/seo/keywords");
  return result;
}

export async function startAiSeoCheckAction(): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAdmin();
  const result = startAnswerCheck();
  if (!result.ok) return result;
  after(() => result.done);
  revalidatePath("/admin/seo/ai");
  return { ok: true };
}

export async function saveManualAiSeoAction(form: FormData): Promise<void> {
  await requireAdmin();
  const engine = String(form.get("engine") ?? "");
  const run = String(form.get("run") ?? "");
  if (!MANUAL_ENGINES.some((entry) => entry.id === engine) || !/^\d{4}-\d{2}-\d{2}$/.test(run)) return;
  const marks: Record<string, number> = {};
  AI_QUERIES.forEach(({ query }, index) => {
    const value = form.get(`q${index}`);
    if (value !== null && value !== "") marks[query] = Number(value);
  });
  saveManualChecks(run, engine, marks, String(form.get("competitors") ?? "").slice(0, 2000));
  revalidatePath("/admin/seo/ai");
}
