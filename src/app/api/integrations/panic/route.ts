import crypto from "node:crypto";

import { env } from "@/lib/env.mjs";
import { triggerPanic } from "@/lib/panic";

export const dynamic = "force-dynamic";

function keyMatches(given: string): boolean {
  const expected = env("CRM_INTEGRATION_KEY", "");
  if (!expected) return false;
  const a = crypto.createHash("sha256").update(given).digest();
  const b = crypto.createHash("sha256").update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  if (!keyMatches(request.headers.get("x-integration-key") ?? "")) {
    return Response.json({ error: "forbidden" }, { status: 401 });
  }
  let pin = "";
  try {
    const body = (await request.json()) as { pin?: unknown };
    if (typeof body.pin === "string") pin = body.pin.trim();
  } catch {
    pin = "";
  }
  const done = await triggerPanic(pin, { propagate: false });
  return Response.json(done ? { data: [], done: true } : { data: [] });
}
