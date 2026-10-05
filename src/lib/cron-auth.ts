import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const KEY_FILE = path.join(process.cwd(), "var", "cron-key");

export function cronAuthorized(request: Request): boolean {
  let expected: string;
  try {
    expected = fs.readFileSync(KEY_FILE, "utf8").trim();
  } catch {
    return false;
  }
  const given = request.headers.get("x-cron-key") ?? "";
  if (!expected || given.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}
