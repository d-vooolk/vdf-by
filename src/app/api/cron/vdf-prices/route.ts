import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { syncVdfPrices } from "@/lib/vdf-prices";

export const dynamic = "force-dynamic";

const KEY_FILE = path.join(process.cwd(), "var", "cron-key");

function authorized(request: Request): boolean {
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

export async function POST(request: Request) {
  if (!authorized(request)) return Response.json({ error: "forbidden" }, { status: 403 });
  const report = await syncVdfPrices();
  return Response.json(report, { status: report.ok ? 200 : 500 });
}
