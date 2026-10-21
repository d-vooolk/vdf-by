import crypto from "node:crypto";

import { env } from "./env.mjs";

export function crmKeyMatches(given: string): boolean {
  const expected = env("CRM_INTEGRATION_KEY", "");
  if (!expected) return false;
  const a = crypto.createHash("sha256").update(given).digest();
  const b = crypto.createHash("sha256").update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}
