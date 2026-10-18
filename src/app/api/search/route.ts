import { searchProducts } from "@/lib/search";
import { buildSearchIndex } from "@/lib/search-index";

export const dynamic = "force-dynamic";

const LIMIT = 8;

export function GET(request: Request) {
  const query = (new URL(request.url).searchParams.get("q") ?? "").slice(0, 80);
  const matches = searchProducts(buildSearchIndex(), query, Infinity);
  const items = matches.slice(0, LIMIT).map(({ s, t, c, p, a, i }) => ({ s, t, c, p, a, ...(i ? { i } : {}) }));
  return Response.json({ total: matches.length, items }, { headers: { "x-robots-tag": "noindex" } });
}
