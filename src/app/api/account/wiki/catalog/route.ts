import { getProductBySlug, getSite } from "@/lib/catalog";
import { forbidden, wikiCustomer } from "@/lib/crm-wiki";
import { pickUrl } from "@/lib/image-types";
import { getImage } from "@/lib/images";
import type { Product } from "@/lib/schema";
import { searchProducts } from "@/lib/search";
import { buildSearchIndex } from "@/lib/search-index";

export const dynamic = "force-dynamic";

const LIMIT = 30;
const THUMB_WIDTH = 96;

export async function GET(request: Request) {
  if (!(await wikiCustomer())) return forbidden();
  const query = (new URL(request.url).searchParams.get("q") ?? "").trim().slice(0, 80);
  if (query.length < 2) return Response.json({ items: [] });
  const base = getSite().url.replace(/\/+$/, "");
  const items = searchProducts(buildSearchIndex(), query, LIMIT)
    .map((match) => getProductBySlug(match.s))
    .filter((product): product is Product => Boolean(product))
    .map((product) => ({
      id: product.id,
      title: product.title,
      url: `${base}/product/${product.slug}/`,
      image: pickUrl(getImage(product.images[0]), THUMB_WIDTH) ?? null,
    }));
  return Response.json({ items });
}
