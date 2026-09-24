import { lookup } from "node:dns/promises";
import net from "node:net";

const MAX_BYTES = 4 * 1024 * 1024;
const MAX_REDIRECTS = 5;
const MAX_LINES = 500;
const MAX_LINE_LENGTH = 1200;
const MAX_IMAGE_CANDIDATES = 40;
const IMAGE_PATH = /\.(?:jpe?g|png|webp|avif)$/i;
const NOT_PRODUCT_IMAGE =
  /logo|icon|sprite|favicon|banner|avatar|social|placeholder|no[-_]?(?:image|photo)|loader|flag|payment|rating|star|arrow/i;
const TIMEOUT_MS = 20000;
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36";

export class DonorPageError extends Error {}

export interface DonorPage {
  url: string;
  title: string;
  structuredDescription: string;
  lines: string[];
  images: string[];
}

const NAMED_ENTITIES: Record<string, string> = {
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
  bull: "•",
  middot: "·",
  deg: "°",
  times: "×",
  minus: "−",
  plusmn: "±",
  copy: "©",
  reg: "®",
  trade: "™",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
  bdquo: "„",
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, body: string) => {
    if (body[0] === "#") {
      const code = body[1] === "x" || body[1] === "X" ? parseInt(body.slice(2), 16) : Number(body.slice(1));
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : entity;
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? entity;
  });
}

function stripTags(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function isPrivateAddress(address: string): boolean {
  if (net.isIPv4(address)) {
    const [a, b] = address.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    );
  }
  const lower = address.toLowerCase();
  if (lower.startsWith("::ffff:")) return isPrivateAddress(lower.slice(7));
  return (
    lower === "::" ||
    lower === "::1" ||
    lower.startsWith("fc") ||
    lower.startsWith("fd") ||
    lower.startsWith("fe8") ||
    lower.startsWith("fe9") ||
    lower.startsWith("fea") ||
    lower.startsWith("feb")
  );
}

export async function assertPublicUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new DonorPageError("Это не похоже на ссылку — скопируйте адрес страницы целиком");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new DonorPageError("Нужна ссылка, которая начинается с http:// или https://");
  }
  const addresses = await lookup(url.hostname, { all: true }).catch(() => {
    throw new DonorPageError(`Сайт ${url.hostname} не найден`);
  });
  if (addresses.some((entry) => isPrivateAddress(entry.address))) {
    throw new DonorPageError("Эта ссылка ведёт во внутреннюю сеть — такие адреса не загружаются");
  }
  return url;
}

function charsetOf(contentType: string, head: string): string {
  const fromHeader = contentType.match(/charset=["']?([\w-]+)/i)?.[1];
  if (fromHeader) return fromHeader;
  return head.match(/<meta[^>]+charset=["']?([\w-]+)/i)?.[1] ?? "utf-8";
}

function decodeBody(bytes: Uint8Array, contentType: string): string {
  const head = new TextDecoder("latin1").decode(bytes.subarray(0, 4096));
  const charset = charsetOf(contentType, head);
  try {
    return new TextDecoder(charset).decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
}

async function download(raw: string): Promise<{ url: string; html: string }> {
  let url = await assertPublicUrl(raw);

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    let response: Response;
    try {
      response = await fetch(url, {
        redirect: "manual",
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "text/html,application/xhtml+xml",
          "Accept-Language": "ru-RU,ru;q=0.9",
        },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      const name = (error as Error).name;
      throw new DonorPageError(
        name === "TimeoutError"
          ? "Сайт-донор не ответил за 20 секунд"
          : `Не удалось открыть страницу: ${(error as { cause?: Error }).cause?.message ?? (error as Error).message}`,
      );
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      await response.body?.cancel();
      if (!location) throw new DonorPageError("Сайт-донор прислал пустое перенаправление");
      url = await assertPublicUrl(new URL(location, url).toString());
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new DonorPageError(
        response.status === 403
          ? "Сайт-донор не пустил сервер (403) — возможно, у него защита от ботов"
          : `Сайт-донор ответил ошибкой ${response.status}`,
      );
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (contentType && !/html|xml/i.test(contentType)) {
      await response.body?.cancel();
      throw new DonorPageError("По ссылке не страница, а файл — нужна ссылка на страницу товара");
    }
    const declared = Number(response.headers.get("content-length") ?? 0);
    if (declared > MAX_BYTES) {
      await response.body?.cancel();
      throw new DonorPageError("Страница слишком большая");
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > MAX_BYTES) throw new DonorPageError("Страница слишком большая");
    return { url: url.toString(), html: decodeBody(bytes, contentType) };
  }

  throw new DonorPageError("Слишком много перенаправлений");
}

interface StructuredProduct {
  name?: string;
  description?: string;
  image?: unknown;
  sku?: unknown;
}

function findProduct(node: unknown): StructuredProduct | null {
  if (!node || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findProduct(item);
      if (found) return found;
    }
    return null;
  }
  const record = node as Record<string, unknown>;
  const type = record["@type"];
  if (type === "Product" || (Array.isArray(type) && type.includes("Product"))) {
    return record as StructuredProduct;
  }
  return findProduct(record["@graph"]);
}

function structuredProduct(html: string): StructuredProduct | null {
  const blocks = html.matchAll(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  );
  for (const [, body] of blocks) {
    try {
      const found = findProduct(JSON.parse(body.trim()));
      if (found) return found;
    } catch {}
  }
  return null;
}

function metaContent(html: string, property: string): string {
  const pattern = new RegExp(
    `<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']*)["']`,
    "i",
  );
  return decodeEntities(html.match(pattern)?.[1] ?? "").trim();
}

const BLOCK_TAGS =
  "address|article|aside|blockquote|br|dd|details|div|dl|dt|figcaption|figure|footer|form|h[1-6]|header|hr|li|main|nav|ol|p|pre|section|summary|table|tbody|td|tfoot|th|thead|tr|ul";

function visibleLines(html: string): string[] {
  const text = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg|template|iframe|head)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(new RegExp(`<\\/?(?:${BLOCK_TAGS})\\b[^>]*>`, "gi"), "\n")
    .replace(/<[^>]+>/g, " ");

  const lines: string[] = [];
  for (const raw of decodeEntities(text).split("\n")) {
    const line = raw.replace(/\s+/g, " ").replace(/ ([.,;:!?)»])/g, "$1").trim();
    if (!line) continue;
    if (lines[lines.length - 1] === line) continue;
    lines.push(line.slice(0, MAX_LINE_LENGTH));
    if (lines.length >= MAX_LINES) break;
  }
  return lines;
}

function structuredImages(image: unknown): string[] {
  if (!image) return [];
  if (typeof image === "string") return [image];
  if (Array.isArray(image)) return image.flatMap(structuredImages);
  if (typeof image === "object") {
    const record = image as Record<string, unknown>;
    return structuredImages(record.contentUrl ?? record.url);
  }
  return [];
}

function largestFromSrcset(srcset: string): string {
  let best = "";
  let bestSize = -1;
  for (const part of srcset.split(",")) {
    const [candidate, descriptor = ""] = part.trim().split(/\s+/);
    const size = parseFloat(descriptor) || 0;
    if (candidate && size >= bestSize) {
      best = candidate;
      bestSize = size;
    }
  }
  return best;
}

function attribute(tag: string, name: string): string {
  const match = tag.match(new RegExp(`\\s${name}=["']([^"']+)["']`, "i"));
  return match ? decodeEntities(match[1]) : "";
}

function stemOf(pathname: string): string {
  return (pathname.split("/").pop() ?? "")
    .toLowerCase()
    .replace(/\.(?:jpe?g|png|webp|avif)/g, "")
    .replace(/[-_.]?\d*$/, "");
}

function commonPrefix(a: string, b: string): number {
  let length = 0;
  while (length < a.length && a[length] === b[length]) length += 1;
  return length;
}

function folderOf(pathname: string): string {
  return pathname.slice(0, pathname.lastIndexOf("/") + 1);
}

function belongsToProduct(candidate: URL, primary: URL[], sku: string): boolean {
  if (sku.length >= 4 && candidate.pathname.toLowerCase().includes(sku)) return true;
  const stem = stemOf(candidate.pathname);
  return primary.some(
    (main) =>
      main.host === candidate.host &&
      (folderOf(main.pathname) === folderOf(candidate.pathname) ||
        commonPrefix(stemOf(main.pathname), stem) >= 5),
  );
}

function imageCandidates(html: string, base: string, product: StructuredProduct | null): string[] {
  const primaryRaw: string[] = [...structuredImages(product?.image)];
  for (const [tag] of html.matchAll(/<meta\b[^>]+(?:og:image|twitter:image)[^>]*>/gi)) {
    primaryRaw.push(attribute(tag, "content"));
  }
  const raw: string[] = [...primaryRaw];
  for (const [, href] of html.matchAll(/<a\b[^>]+href=["']([^"']+)["']/gi)) {
    raw.push(decodeEntities(href));
  }
  for (const [tag] of html.matchAll(/<(?:img|source)\b[^>]*>/gi)) {
    for (const name of ["data-zoom-image", "data-large", "data-full", "data-original", "data-src", "data-lazy", "src"]) {
      raw.push(attribute(tag, name));
    }
    for (const name of ["data-srcset", "srcset"]) {
      const srcset = attribute(tag, name);
      if (srcset) raw.push(largestFromSrcset(srcset));
    }
  }
  for (const [, found] of html.matchAll(
    /["'(]((?:https?:)?(?:\/|\\u002F|\\\/)[^"'()\s<>]+?\.(?:jpe?g|png|webp|avif))(?=["'?)#])/gi,
  )) {
    raw.push(found.replace(/\\u002F/gi, "/").replace(/\\\//g, "/"));
  }

  const toUrl = (candidate: string): URL | null => {
    if (!candidate) return null;
    try {
      const url = new URL(candidate, base);
      if (url.protocol !== "https:" && url.protocol !== "http:") return null;
      if (!IMAGE_PATH.test(url.pathname) || NOT_PRODUCT_IMAGE.test(url.pathname)) return null;
      url.hash = "";
      return url;
    } catch {
      return null;
    }
  };

  const primary = primaryRaw.map(toUrl).filter((url): url is URL => url !== null);
  const sku = typeof product?.sku === "string" ? product.sku.trim().toLowerCase() : "";

  const seen = new Set<string>();
  const result: string[] = [];
  for (const candidate of raw) {
    const url = toUrl(candidate);
    if (!url) continue;
    const key = url.toString();
    if (seen.has(key)) continue;
    if (primary.length && !belongsToProduct(url, primary, sku)) continue;
    seen.add(key);
    result.push(key);
    if (result.length >= MAX_IMAGE_CANDIDATES) break;
  }
  return result;
}

export async function fetchDonorPage(raw: string): Promise<DonorPage> {
  const { url, html } = await download(raw);
  const product = structuredProduct(html);
  const h1 = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1];

  const title =
    (product?.name && stripTags(product.name)) ||
    (h1 && stripTags(h1)) ||
    metaContent(html, "og:title") ||
    stripTags(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "");

  const lines = visibleLines(html);
  if (!title && lines.length === 0) {
    throw new DonorPageError("На странице не нашлось текста — возможно, сайт собирает её скриптами");
  }

  return {
    url,
    title,
    structuredDescription: product?.description ? stripTags(product.description) : "",
    lines,
    images: imageCandidates(html, url, product),
  };
}
