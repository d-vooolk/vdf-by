import { toSlug } from "./slug.mjs";

export type ArticleBlock =
  | { type: "h2" | "h3"; text: string; id: string }
  | { type: "p"; text: string }
  | { type: "tip"; text: string }
  | { type: "ul" | "ol"; items: string[] }
  | { type: "table"; head: string[]; rows: string[][] }
  | { type: "image"; path: string; alt: string; heading: string }
  | { type: "placeholder"; text: string }
  | { type: "products"; slugs: string[] };

export type InlinePart =
  | { type: "text"; text: string }
  | { type: "bold"; text: string }
  | { type: "link"; text: string; href: string };

const IMAGE_LINE = /^!\[([^\]]*)\]\(([^)\s]+)\)$/;
const PLACEHOLDER_LINE = /^\[\[\s*фото\s*:\s*([\s\S]+?)\s*\]\]$/i;
const PRODUCT_LINE = /^\{\{\s*товар\s*:\s*([a-z0-9-]+)\s*\}\}$/i;
const HEADING_LINE = /^(#{2,3})\s+(.+)$/;
const LIST_ITEM = /^(?:[-*•]|\d+[.)])\s+(.+)$/;
const ORDERED_ITEM = /^\d+[.)]\s+/;
const TABLE_DIVIDER = /^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?$/;
const INLINE = /\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g;

export const PRODUCT_LINK = /^\/product\/([a-z0-9-]+)\/?$/;

function tableCells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function uniqueId(text: string, taken: Set<string>): string {
  const base = toSlug(text) || "razdel";
  let id = base;
  for (let n = 2; taken.has(id); n += 1) id = `${base}-${n}`;
  taken.add(id);
  return id;
}

export function parseArticleBody(body: string): ArticleBlock[] {
  const lines = body.replace(/\r\n/g, "\n").split("\n");
  const blocks: ArticleBlock[] = [];
  const ids = new Set<string>();
  let paragraph: string[] = [];
  let heading = "";

  const flush = () => {
    if (paragraph.length) blocks.push({ type: "p", text: paragraph.join(" ") });
    paragraph = [];
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();

    if (!line) {
      flush();
      continue;
    }

    const headingMatch = line.match(HEADING_LINE);
    if (headingMatch) {
      flush();
      const text = headingMatch[2].replace(/\*\*/g, "").trim();
      heading = text;
      blocks.push({ type: headingMatch[1].length === 2 ? "h2" : "h3", text, id: uniqueId(text, ids) });
      continue;
    }

    const image = line.match(IMAGE_LINE);
    if (image) {
      flush();
      blocks.push({ type: "image", alt: image[1].trim(), path: image[2], heading });
      continue;
    }

    const placeholder = line.match(PLACEHOLDER_LINE);
    if (placeholder) {
      flush();
      blocks.push({ type: "placeholder", text: placeholder[1] });
      continue;
    }

    const product = line.match(PRODUCT_LINE);
    if (product) {
      flush();
      blocks.push({ type: "products", slugs: [product[1].toLowerCase()] });
      continue;
    }

    if (line.startsWith(">")) {
      flush();
      const quote = [line.replace(/^>\s?/, "")];
      while (lines[index + 1]?.trim().startsWith(">")) {
        index += 1;
        quote.push(lines[index].trim().replace(/^>\s?/, ""));
      }
      blocks.push({ type: "tip", text: quote.join(" ").trim() });
      continue;
    }

    if (line.startsWith("|") && TABLE_DIVIDER.test(lines[index + 1]?.trim() ?? "")) {
      flush();
      const head = tableCells(line);
      const rows: string[][] = [];
      index += 1;
      while (lines[index + 1]?.trim().startsWith("|")) {
        index += 1;
        rows.push(tableCells(lines[index]));
      }
      blocks.push({ type: "table", head, rows });
      continue;
    }

    const item = line.match(LIST_ITEM);
    if (item) {
      flush();
      const ordered = ORDERED_ITEM.test(line);
      const items = [item[1]];
      while (lines[index + 1] !== undefined) {
        const next = lines[index + 1].trim().match(LIST_ITEM);
        if (!next || ORDERED_ITEM.test(lines[index + 1].trim()) !== ordered) break;
        index += 1;
        items.push(next[1]);
      }
      blocks.push({ type: ordered ? "ol" : "ul", items });
      continue;
    }

    paragraph.push(line);
  }

  flush();
  return mergeProductRuns(blocks);
}

function mergeProductRuns(blocks: ArticleBlock[]): ArticleBlock[] {
  const merged: ArticleBlock[] = [];
  for (const block of blocks) {
    const last = merged[merged.length - 1];
    if (block.type === "products" && last?.type === "products") {
      for (const slug of block.slugs) if (!last.slugs.includes(slug)) last.slugs.push(slug);
      continue;
    }
    merged.push(block);
  }
  return merged;
}

export function parseInline(text: string): InlinePart[] {
  const parts: InlinePart[] = [];
  let cursor = 0;
  for (const match of text.matchAll(INLINE)) {
    const start = match.index ?? 0;
    if (start > cursor) parts.push({ type: "text", text: text.slice(cursor, start) });
    if (match[1] !== undefined) parts.push({ type: "bold", text: match[1] });
    else parts.push({ type: "link", text: match[2], href: match[3] });
    cursor = start + match[0].length;
  }
  if (cursor < text.length) parts.push({ type: "text", text: text.slice(cursor) });
  return parts;
}

export function inlineText(text: string): string {
  return parseInline(text)
    .map((part) => part.text)
    .join("");
}

function blockTexts(blocks: ArticleBlock[]): string[] {
  return blocks.flatMap((block) => {
    switch (block.type) {
      case "h2":
      case "h3":
      case "p":
      case "tip":
        return [block.text];
      case "ul":
      case "ol":
        return block.items;
      case "table":
        return [...block.head, ...block.rows.flat()];
      default:
        return [];
    }
  });
}

export function articleLinks(body: string): string[] {
  return blockTexts(parseArticleBody(body)).flatMap((text) =>
    parseInline(text).flatMap((part) => (part.type === "link" ? [part.href] : [])),
  );
}

export function articleProductSlugs(body: string): string[] {
  const slugs = new Set<string>();
  for (const block of parseArticleBody(body)) {
    if (block.type === "products") for (const slug of block.slugs) slugs.add(slug);
  }
  for (const href of articleLinks(body)) {
    const match = href.match(PRODUCT_LINK);
    if (match) slugs.add(match[1]);
  }
  return [...slugs];
}

export function articleImagePaths(body: string): string[] {
  return parseArticleBody(body).flatMap((block) => (block.type === "image" ? [block.path] : []));
}

export function articlePlaceholders(body: string): string[] {
  return parseArticleBody(body).flatMap((block) => (block.type === "placeholder" ? [block.text] : []));
}

export function articleHeadings(body: string): Array<{ text: string; id: string }> {
  return parseArticleBody(body).flatMap((block) =>
    block.type === "h2" ? [{ text: inlineText(block.text), id: block.id }] : [],
  );
}

export function articlePlainText(body: string): string {
  return blockTexts(parseArticleBody(body)).map(inlineText).join("\n");
}

export function readingMinutes(body: string): number {
  const words = articlePlainText(body).split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 180));
}

export function replacePlaceholder(body: string, text: string, replacement: string): string {
  const lines = body.split("\n");
  const index = lines.findIndex((line) => {
    const match = line.trim().match(PLACEHOLDER_LINE);
    return match?.[1] === text;
  });
  if (index < 0) return body;
  lines[index] = replacement;
  return lines.join("\n");
}

export function imageLine(path: string, alt: string): string {
  const clean = alt.replace(/[[\]\n]/g, " ").replace(/\s+/g, " ").trim().slice(0, 150);
  return `![${clean}](${path})`;
}

export function productLine(slug: string): string {
  return `{{товар:${slug}}}`;
}

export interface ProductPhotos {
  slug: string;
  title: string;
  paths: string[];
}

export const PRODUCT_PHOTO_LINE = /^\{\{\s*фото\s+товара\s*:\s*([a-z0-9-]+)\s*\}\}$/i;

function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/ё/g, "е")
    .split(/[^a-zа-я0-9]+/i)
    .filter((word) => word.length >= 3)
    .map((word) => word.slice(0, 5));
}

function overlap(a: string, b: string): number {
  const target = new Set(words(b));
  return words(a).filter((word) => target.has(word)).length;
}

export function fillPlaceholders(
  body: string,
  products: ProductPhotos[],
  mode: "match" | "all",
): { body: string; used: string[] } {
  const taken = new Set(articleImagePaths(body));
  const queues = new Map(
    products.map((product) => [product.slug, product.paths.filter((path) => !taken.has(path))]),
  );
  const used: string[] = [];
  const picks = new Map<string, number>();
  let turn = 0;

  const next = (product: ProductPhotos) => {
    const queue = queues.get(product.slug) ?? [];
    const path = queue.shift();
    if (path) used.push(path);
    return path;
  };

  const lines = body.split("\n").map((line) => {
    const match = line.trim().match(PLACEHOLDER_LINE);
    if (!match) return line;
    const available = products.filter((product) => (queues.get(product.slug) ?? []).length);
    if (!available.length) return line;

    const ranked = available
      .map((product) => {
        const score = overlap(match[1], product.title);
        return { product, score, rank: score - (picks.get(product.slug) ?? 0) * 0.75 };
      })
      .sort((a, b) => b.rank - a.rank);
    const best = ranked.find((entry) => entry.score > 0);
    let product = best ? best.product : null;
    if (!product && mode === "all") {
      product = available[turn % available.length];
      turn += 1;
    }
    if (!product) return line;

    const path = next(product);
    if (path) picks.set(product.slug, (picks.get(product.slug) ?? 0) + 1);
    return path ? imageLine(path, product.title) : line;
  });

  return { body: lines.join("\n"), used };
}
