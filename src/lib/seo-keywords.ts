import fs from "node:fs";
import path from "node:path";

import { z } from "zod";

import { env } from "./env.mjs";
import { KEYWORD_INTENTS, KEYWORD_PRIORITIES, type KeywordsFile } from "./seo-keyword-types";

const sitePath = z
  .string()
  .trim()
  .max(300)
  .regex(/^\/[^\s]*$/, "адрес страницы должен начинаться с / и быть без пробелов");

const keywordSchema = z.strictObject({
  q: z.string().trim().min(1).max(200),
  url: sitePath.optional(),
});

const groupSchema = z.strictObject({
  id: z.string().trim().min(1).max(60),
  name: z.string().trim().min(1, "у группы должно быть название").max(120),
  url: sitePath,
  priority: z.enum(KEYWORD_PRIORITIES),
  intent: z.enum(KEYWORD_INTENTS),
  note: z.string().trim().max(1000).default(""),
  keywords: z.array(keywordSchema).max(500),
});

export const keywordsFileSchema = z.strictObject({
  updatedAt: z.string(),
  note: z.string().trim().max(2000).default(""),
  groups: z.array(groupSchema).max(100),
});

const KEYWORDS_FILE = env("SEO_KEYWORDS_FILE", path.join(process.cwd(), "var", "seo-keywords.json"));

export function readKeywords(): KeywordsFile {
  try {
    return keywordsFileSchema.parse(JSON.parse(fs.readFileSync(KEYWORDS_FILE, "utf8")));
  } catch {
    return { updatedAt: "", note: "", groups: [] };
  }
}

export type SaveKeywordsResult = { ok: true; count: number } | { ok: false; problems: string[] };

export function saveKeywords(input: unknown): SaveKeywordsResult {
  const parsed = keywordsFileSchema.safeParse({ ...(input as object), updatedAt: new Date().toISOString() });
  if (!parsed.success) {
    return {
      ok: false,
      problems: parsed.error.issues.slice(0, 10).map((issue) => `${issue.path.join(" → ")}: ${issue.message}`),
    };
  }
  const ids = parsed.data.groups.map((group) => group.id);
  if (new Set(ids).size !== ids.length) return { ok: false, problems: ["Коды групп повторяются"] };
  const temporary = `${KEYWORDS_FILE}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(parsed.data, null, 2)}\n`);
  fs.renameSync(temporary, KEYWORDS_FILE);
  return { ok: true, count: parsed.data.groups.reduce((sum, group) => sum + group.keywords.length, 0) };
}

export function normalizeKeyword(text: string): string {
  return text.toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ").trim();
}

export function duplicateKeywords(data: KeywordsFile): string[] {
  const seen = new Map<string, number>();
  for (const group of data.groups) {
    for (const keyword of group.keywords) {
      const key = normalizeKeyword(keyword.q);
      seen.set(key, (seen.get(key) ?? 0) + 1);
    }
  }
  return [...seen].filter(([, count]) => count > 1).map(([key]) => key);
}

function csvCell(value: string): string {
  return /[;"\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function keywordsCsv(data: KeywordsFile, origin: string): string {
  const rows = [["Запрос", "Группа", "Целевая страница", "Приоритет", "Тип"]];
  for (const group of data.groups) {
    for (const keyword of group.keywords) {
      rows.push([keyword.q, group.name, `${origin}${keyword.url ?? group.url}`, group.priority, group.intent]);
    }
  }
  return `﻿${rows.map((row) => row.map(csvCell).join(";")).join("\r\n")}\r\n`;
}
