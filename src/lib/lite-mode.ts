import { notFound } from "next/navigation";

import { getDb } from "./db";

const LITE_KEY = "lite_mode";

export function isLiteMode(): boolean {
  const row = getDb().prepare("SELECT value FROM settings WHERE key = ?").get(LITE_KEY) as
    | { value: string }
    | undefined;
  return row?.value === "1";
}

export function enableLiteMode(): void {
  getDb()
    .prepare("INSERT INTO settings (key, value) VALUES (?, '1') ON CONFLICT(key) DO UPDATE SET value = '1'")
    .run(LITE_KEY);
}

export function hiddenInLiteMode(): void {
  if (isLiteMode()) notFound();
}
