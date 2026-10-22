import QRCode from "qrcode";

import { getSite } from "./catalog";
import { getDb } from "./db";
import { isFrameCategory } from "./frame-category";
import { frameMembershipOf } from "./frame-membership";
import { buildFrameSku } from "./frame-sku";
import { getFrameType } from "./frame-types";
import { largestVariantUrl } from "./image-types";
import { getImage } from "./images";
import { getProductRaw } from "./product-store";

const FRAME_SET_TITLE = "Комплект переходных рамок";
const MAX_LOGOS = 2;
const CARS_TEXT_LIMIT = 120;

export interface LabelData {
  title: string;
  cars: string;
  logos: string[];
  sku: string;
  link: string;
}

interface CarRow {
  markId: string;
  markName: string;
  logo: string | null;
  modelName: string;
}

const CAR_COLUMNS = `k.id AS markId, k.name AS markName, k.logo AS logo, m.name AS modelName`;
const CAR_JOINS = `JOIN car_generations g ON g.id = c.generation_id
         JOIN car_models      m ON m.id = g.model_id
         JOIN car_marks       k ON k.id = m.mark_id`;

function productCarRows(productId: string): CarRow[] {
  return getDb()
    .prepare(
      `SELECT DISTINCT ${CAR_COLUMNS}
         FROM product_cars c
         ${CAR_JOINS}
        WHERE c.product_id = ?
        ORDER BY k.name, m.name`,
    )
    .all(productId) as CarRow[];
}

function frameTypeCarRows(categoryId: string, type: string): CarRow[] {
  return getDb()
    .prepare(
      `SELECT DISTINCT ${CAR_COLUMNS}
         FROM (SELECT pc.generation_id
                 FROM product_cars pc
                 JOIN frame_type_products f ON f.product_id = pc.product_id
                WHERE f.category_id = @categoryId AND f.type = @type
               UNION
               SELECT generation_id FROM frame_type_cars WHERE category_id = @categoryId AND type = @type) c
         ${CAR_JOINS}
        ORDER BY k.name, m.name`,
    )
    .all({ categoryId, type }) as CarRow[];
}

function markLogos(rows: CarRow[]): string[] {
  const marks = new Map<string, string | null>();
  for (const row of rows) marks.set(row.markId, row.logo);
  if (!marks.size || marks.size > MAX_LOGOS) return [];
  return [...marks.values()]
    .map((logo) => (logo ? largestVariantUrl(getImage(logo)) : null))
    .filter((url): url is string => Boolean(url));
}

function carsSummary(rows: CarRow[]): string {
  const byMark = new Map<string, string[]>();
  for (const row of rows) {
    const models = byMark.get(row.markName) ?? [];
    if (!models.includes(row.modelName)) models.push(row.modelName);
    byMark.set(row.markName, models);
  }
  const parts = [...byMark].map(([mark, models]) => `${mark} ${models.join(", ")}`);
  let text = "";
  for (const [index, part] of parts.entries()) {
    const next = text ? `${text}; ${part}` : part;
    if (next.length > CARS_TEXT_LIMIT && text) {
      return `${text} и ещё ${parts.length - index}`;
    }
    text = next;
  }
  return text;
}

function siteRoot(): string {
  return getSite().url.replace(/\/+$/, "");
}

function withTypePrefix(type: string, title: string): string {
  const trimmed = title.trim();
  if (!trimmed) return type;
  return trimmed.toUpperCase().startsWith(`${type} `) ? trimmed : `${type} ${trimmed}`;
}

export function productLabel(id: string): LabelData | null {
  const product = getProductRaw(id);
  if (!product) return null;
  const membership = frameMembershipOf(product.id);
  const frameType =
    membership && membership.categoryId === product.categoryId && isFrameCategory(membership.categoryId)
      ? membership.type
      : "";
  return {
    title: frameType ? withTypePrefix(frameType, product.title) : product.title,
    cars: "",
    logos: markLogos(productCarRows(product.id)),
    sku: product.sku ?? "",
    link: `${siteRoot()}/product/${product.slug}/`,
  };
}

export function frameTypeLabel(categoryId: string, type: string): LabelData | null {
  if (!isFrameCategory(categoryId)) return null;
  const group = getFrameType(categoryId, type);
  if (!group) return null;
  const cars = frameTypeCarRows(categoryId, group.type);
  const name = group.name.trim();
  const suffix = name && name.toUpperCase() !== group.type ? ` ${name}` : "";
  return {
    title: `${FRAME_SET_TITLE} ТИП ${group.type}${suffix}`,
    cars: carsSummary(cars),
    logos: markLogos(cars),
    sku: buildFrameSku({ number: "", storage: group.storageCode, type: group.type }),
    link: `${siteRoot()}/poisk/?q=${encodeURIComponent(group.type)}`,
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const LABEL_CSS = `
@page { size: 58mm 40mm; margin: 0; }
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { width: 58mm; height: 39.5mm; overflow: hidden; background: #fff; color: #000; }
body { font-family: Arial, Helvetica, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.label { width: 58mm; height: 39.5mm; padding: 0.7mm 1.3mm 1.5mm; overflow: hidden; break-after: avoid; break-inside: avoid; }
.frame {
  height: 100%; border: 0.35mm solid #000; border-radius: 1.2mm; padding: 1.2mm 1.6mm;
  display: flex; gap: 1.4mm;
}
.marks {
  flex: none; width: 9mm; display: flex; flex-direction: column; justify-content: center; gap: 1.5mm;
  border-right: 0.25mm solid #000; padding-right: 1.2mm;
}
.marks img { display: block; width: 100%; height: auto; max-height: 12mm; object-fit: contain; filter: grayscale(1) contrast(1.6); }
.main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 0.7mm; }
.logo { display: block; height: 4.2mm; margin: 0 auto 0.8mm; filter: brightness(0); }
.title {
  font-size: 2.7mm; line-height: 1.15; font-weight: 700; text-align: center;
  display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 4; overflow: hidden;
  overflow-wrap: anywhere;
}
.cars {
  font-size: 1.95mm; line-height: 1.15; text-align: center;
  display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 3; overflow: hidden;
  overflow-wrap: anywhere;
}
.spacer { flex: 1; }
.bottom { display: flex; align-items: flex-end; justify-content: space-between; gap: 1.5mm; }
.sku { min-width: 0; font-size: 2.3mm; line-height: 1.2; }
.sku b { display: block; font-size: 2.9mm; overflow-wrap: anywhere; }
.qr { width: 15mm; height: 15mm; flex: none; }
.qr svg { display: block; width: 100%; height: 100%; shape-rendering: crispEdges; }
.site { font-size: 2.4mm; font-weight: 700; text-align: center; letter-spacing: 0.1mm; }
.with-cars .logo { height: 3.2mm; margin-bottom: 0.4mm; }
.with-cars .title { font-size: 2.5mm; -webkit-line-clamp: 2; }
.with-cars .qr { width: 12mm; height: 12mm; }
.with-cars .site { font-size: 2.1mm; }
.with-marks .logo { height: 3.4mm; margin-bottom: 0.4mm; }
.with-marks .title { font-size: 2.4mm; -webkit-line-clamp: 3; }
.with-marks.with-cars .title { -webkit-line-clamp: 2; }
`;

const NUMBER_LABEL_CSS = `
@page { size: 58mm 40mm; margin: 0; }
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { width: 58mm; height: 39.5mm; overflow: hidden; background: #fff; color: #000; }
body { font-family: Arial, Helvetica, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.label { width: 58mm; height: 39.5mm; padding: 0.7mm 1.3mm 1.5mm; overflow: hidden; break-after: avoid; break-inside: avoid; }
.number {
  height: 100%; display: flex; align-items: center; justify-content: center;
  font-weight: 700; line-height: 1; white-space: nowrap; letter-spacing: -0.02em;
}
`;

function boldGlyphWidthEm(char: string): number {
  if (/\d/.test(char)) return 0.56;
  if (char === " ") return 0.28;
  if (/[-.,:;/|()]/.test(char)) return 0.34;
  if (/[ШЩЖЮМФЫ]/.test(char)) return 0.9;
  if (char !== char.toLowerCase()) return 0.74;
  return 0.6;
}

function bigTextFontSize(text: string): number {
  const usableWidthMm = 53;
  const maxHeightMm = 34;
  const widthEm = [...text].reduce((sum, char) => sum + boldGlyphWidthEm(char), 0);
  return Math.min(maxHeightMm, usableWidthMm / Math.max(widthEm, 1));
}

export function productStorageCode(id: string): string | null {
  const product = getProductRaw(id);
  if (!product) return null;
  return product.storageCode?.trim() ?? "";
}

export function frameTypeStorageCode(categoryId: string, type: string): string | null {
  if (!isFrameCategory(categoryId)) return null;
  const group = getFrameType(categoryId, type);
  if (!group) return null;
  return group.storageCode.trim();
}

export function renderBigTextHtml(text: string): string {
  const fontSize = bigTextFontSize(text).toFixed(1);
  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<title>${escapeHtml(text)}</title>
<style>${NUMBER_LABEL_CSS}</style>
</head>
<body>
<div class="label"><div class="number" style="font-size:${fontSize}mm">${escapeHtml(text)}</div></div>
</body>
</html>`;
}

export async function renderLabelHtml(label: LabelData): Promise<string> {
  const qr = await QRCode.toString(label.link, {
    type: "svg",
    margin: 0,
    errorCorrectionLevel: "M",
    color: { dark: "#000000", light: "#ffffff" },
  });
  const host = new URL(siteRoot()).host;
  const sku = label.sku
    ? `<div class="sku">Артикул<b>${escapeHtml(label.sku)}</b></div>`
    : `<div class="sku"></div>`;
  const marks = label.logos.length
    ? `<div class="marks">${label.logos.map((url) => `<img src="${escapeHtml(url)}" alt="">`).join("")}</div>`
    : "";
  const cars = label.cars ? `<div class="cars">${escapeHtml(label.cars)}</div>` : "";
  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<title>${escapeHtml(label.title)}</title>
<style>${LABEL_CSS}</style>
</head>
<body>
<div class="${["label", label.cars && "with-cars", label.logos.length && "with-marks"].filter(Boolean).join(" ")}"><div class="frame">
${marks}<div class="main">
<img class="logo" src="/brand/logo.png" alt="VDF.BY">
<div class="title">${escapeHtml(label.title)}</div>
${cars}<div class="spacer"></div>
<div class="bottom">${sku}<div class="qr">${qr}</div></div>
<div class="site">${escapeHtml(host)}</div>
</div>
</div></div>
</body>
</html>`;
}
