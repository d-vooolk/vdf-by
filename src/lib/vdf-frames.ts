export const VDF_ORIGIN = "https://vdf-light.ru";
export const VDF_FRAME_ROOT = "frame";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36";
const TIMEOUT_MS = 20000;
const ATTEMPTS = 4;
export const VDF_PAUSE_MS = 1200;

export class VdfError extends Error {}

export interface VdfFrameLink {
  url: string;
  article: string;
  modelFrame: string;
  name: string;
}

export interface VdfFrame {
  url: string;
  article: string;
  modelFrame: string;
  frameType: string;
  name: string;
  mark: string;
  model: string;
  years: number[];
  cars: string[];
  categoryPath: string[];
  description: string;
  specs: Array<{ name: string; value: string }>;
  images: string[];
}

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

const WRAPPERS = new Set([
  "ShallowReactive",
  "Reactive",
  "Ref",
  "ShallowRef",
  "EmptyRef",
  "EmptyShallowRef",
  "NuxtError",
]);

export function nuxtPayload(html: string): Json {
  const script = html.match(/<script[^>]*id="__NUXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!script) throw new VdfError("На странице нет данных Nuxt — сайт поменял устройство");
  const flat = JSON.parse(script[1]) as Json[];
  const resolved = new Map<number, Json>();

  const resolve = (index: Json): Json => {
    if (typeof index !== "number" || index < 0 || index >= flat.length) return null;
    if (resolved.has(index)) return resolved.get(index) ?? null;
    const value = flat[index];
    if (value === null || typeof value !== "object") {
      resolved.set(index, value);
      return value;
    }
    if (Array.isArray(value)) {
      const [tag] = value;
      if (typeof tag === "string" && WRAPPERS.has(tag)) {
        const inner = resolve(value[1]);
        resolved.set(index, inner);
        return inner;
      }
      if (tag === "Set") {
        const items = value.slice(1).map(resolve);
        resolved.set(index, items);
        return items;
      }
      if (tag === "Date") {
        resolved.set(index, value[1]);
        return value[1];
      }
      const items: Json[] = [];
      resolved.set(index, items);
      for (const item of value) items.push(resolve(item));
      return items;
    }
    const object: { [key: string]: Json } = {};
    resolved.set(index, object);
    for (const [key, item] of Object.entries(value)) object[key] = resolve(item);
    return object;
  };

  return resolve(0);
}

function field(value: Json | undefined, key: string): Json | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value[key] : undefined;
}

function text(value: Json | undefined): string {
  return typeof value === "string" ? value.trim() : typeof value === "number" ? String(value) : "";
}

function list(value: Json | undefined): Json[] {
  return Array.isArray(value) ? value : [];
}

function dataEntry(payload: Json, prefix: string): Json | undefined {
  const data = field(payload, "data");
  if (!data || typeof data !== "object" || Array.isArray(data)) return undefined;
  const key = Object.keys(data).find((name) => name.startsWith(prefix));
  return key ? data[key] : undefined;
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  laquo: "«",
  raquo: "»",
  mdash: "—",
  ndash: "–",
  hellip: "…",
};

export function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6])>/gi, "\n\n")
    .replace(/<li[^>]*>/gi, "— ")
    .replace(/<[^>]+>/g, "")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, body: string) => {
      if (body[0] === "#") {
        const code =
          body[1].toLowerCase() === "x" ? parseInt(body.slice(2), 16) : Number(body.slice(1));
        return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : entity;
      }
      return ENTITIES[body.toLowerCase()] ?? entity;
    })
    .replace(/\r/g, "")
    .replace(/[ \t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function fetchVdfHtml(path: string): Promise<string> {
  const url = new URL(path, VDF_ORIGIN).toString();
  let lastError = "";
  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "text/html,application/xhtml+xml",
          "Accept-Language": "ru-RU,ru;q=0.9",
        },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (response.status === 404) throw new VdfError(`Страница не найдена: ${url}`);
      if (response.ok) return await response.text();
      await response.body?.cancel();
      lastError = `HTTP ${response.status}`;
      if (response.status === 429) {
        const retryAfter = Number(response.headers.get("retry-after"));
        await pause(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 20000 * attempt);
        continue;
      }
    } catch (error) {
      if (error instanceof VdfError) throw error;
      lastError = (error as Error).message;
    }
    await pause(1500 * attempt);
  }
  throw new VdfError(`Не удалось открыть ${url}: ${lastError}`);
}

export function frameTypeOf(modelFrame: string, article: string): string {
  const source = modelFrame || article;
  return source.match(/(\d{3})\s*$/)?.[1] ?? "";
}

export interface VdfCategoryPage {
  children: string[];
  products: VdfFrameLink[];
  total: number;
}

export async function readVdfCategory(slug: string): Promise<VdfCategoryPage> {
  const payload = nuxtPayload(await fetchVdfHtml(`/catalog/${slug}`));
  const category = dataEntry(payload, "catalog-category-");
  const products = dataEntry(payload, "catalog-products-");
  return {
    children: list(field(category, "children"))
      .map((child) => text(field(child, "slug_url")))
      .filter(Boolean),
    products: list(field(products, "results")).map((item) => ({
      url: text(field(item, "url")),
      article: text(field(item, "article")) || text(field(item, "model_frame")),
      modelFrame: text(field(item, "model_frame")),
      name: text(field(item, "name")),
    })),
    total: Number(field(products, "count")) || 0,
  };
}

export async function readVdfFrame(url: string): Promise<VdfFrame> {
  const path = new URL(url, VDF_ORIGIN).pathname;
  const payload = nuxtPayload(await fetchVdfHtml(path));
  const product = dataEntry(payload, "product-");
  if (!product) throw new VdfError(`На странице ${path} нет карточки товара`);

  const article = text(field(product, "article"));
  const modelFrame = text(field(product, "model_frame"));
  const years = text(field(product, "year"))
    .split(/[;,\s]+/)
    .map(Number)
    .filter((year) => Number.isInteger(year) && year > 1900);
  const categoryPath = list(field(field(product, "category"), "path")).map((step) =>
    text(field(step, "name")),
  );

  return {
    url: `${VDF_ORIGIN}${path}`,
    article,
    modelFrame,
    frameType: frameTypeOf(modelFrame, article),
    name: text(field(product, "name")),
    mark: text(field(product, "mark_auto")),
    model: text(field(product, "model_auto")),
    years,
    cars: list(field(product, "compatible_cars")).map(text).filter(Boolean),
    categoryPath,
    description: htmlToText(text(field(product, "description"))),
    specs: list(field(product, "attributes"))
      .map((attribute) => ({
        name: text(field(attribute, "name")).replace(/:\s*$/, ""),
        value: text(field(attribute, "value")),
      }))
      .filter((spec) => spec.name && spec.value),
    images: list(field(product, "images"))
      .filter((image) => text(field(image, "media_type")) !== "video")
      .map((image) => text(field(image, "image")))
      .filter(Boolean)
      .map((image) => new URL(image, VDF_ORIGIN).toString()),
  };
}
