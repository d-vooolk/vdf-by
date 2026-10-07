import { recordProductView } from "@/lib/product-views";

export const dynamic = "force-dynamic";

const REPEAT_MS = 6 * 60 * 60 * 1000;
const MAX_TRACKED = 20000;
const BOTS = /bot|crawl|spider|slurp|preview|headless|lighthouse|pagespeed|yandex|google|bing|facebookexternalhit|curl|wget|python|scrapy/i;
const seen = new Map<string, number>();

function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

function repeated(key: string, now: number): boolean {
  const last = seen.get(key);
  if (last !== undefined && now - last < REPEAT_MS) return true;
  if (seen.size >= MAX_TRACKED) {
    for (const [entry, time] of seen) if (now - time >= REPEAT_MS) seen.delete(entry);
    if (seen.size >= MAX_TRACKED) seen.clear();
  }
  seen.set(key, now);
  return false;
}

export async function POST(request: Request) {
  const userAgent = request.headers.get("user-agent") ?? "";
  if (!userAgent || BOTS.test(userAgent)) return new Response(null, { status: 204 });

  const productId = (await request.text().catch(() => "")).trim().slice(0, 120);
  if (!productId) return new Response(null, { status: 204 });

  if (!repeated(`${clientIp(request)}|${productId}`, Date.now())) recordProductView(productId);
  return new Response(null, { status: 204 });
}
