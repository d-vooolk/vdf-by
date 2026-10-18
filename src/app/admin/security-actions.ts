"use server";

import { requireAdmin } from "@/lib/auth";
import { triggerPanic } from "@/lib/panic";

export async function runPanicAction(pin: string): Promise<{ done: boolean }> {
  await requireAdmin();
  const done = await triggerPanic(typeof pin === "string" ? pin.trim() : "", { propagate: true });
  return { done };
}
