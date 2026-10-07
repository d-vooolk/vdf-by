"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";

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
