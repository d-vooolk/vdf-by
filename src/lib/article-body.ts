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
