import QRCode from "qrcode";

import { getSite } from "./catalog";
import { isFrameCategory } from "./frame-category";
import { frameMembershipOf } from "./frame-membership";
import { buildFrameSku } from "./frame-sku";
import { getFrameType } from "./frame-types";
import { getProductRaw } from "./store";

export interface LabelData {
  title: string;
  sku: string;
  link: string;
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
    sku: product.sku ?? "",
    link: `${siteRoot()}/product/${product.slug}/`,
  };
}

export function frameTypeLabel(categoryId: string, type: string): LabelData | null {
  if (!isFrameCategory(categoryId)) return null;
  const group = getFrameType(categoryId, type);
  if (!group) return null;
  return {
    title: withTypePrefix(group.type, group.name),
    sku: buildFrameSku({ number: "", suffix: group.suffix, type: group.type }),
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
html, body { width: 58mm; height: 40mm; background: #fff; color: #000; }
body { font-family: Arial, Helvetica, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.label { width: 58mm; height: 40mm; padding: 1.5mm; overflow: hidden; }
.frame {
  height: 100%; border: 0.35mm solid #000; border-radius: 1.2mm; padding: 1.2mm 1.6mm;
  display: grid; grid-template-rows: auto 1fr auto auto; row-gap: 0.8mm;
}
.logo { display: block; height: 4.2mm; margin: 0 auto 1.5mm; filter: brightness(0); }
.title {
  font-size: 2.7mm; line-height: 1.15; font-weight: 700; text-align: center;
  display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 4; overflow: hidden;
  overflow-wrap: anywhere;
}
.bottom { display: flex; align-items: flex-end; justify-content: space-between; gap: 1.5mm; }
.sku { min-width: 0; font-size: 2.3mm; line-height: 1.2; }
.sku b { display: block; font-size: 2.9mm; overflow-wrap: anywhere; }
.qr { width: 15mm; height: 15mm; flex: none; }
.qr svg { display: block; width: 100%; height: 100%; shape-rendering: crispEdges; }
.site { font-size: 2.4mm; font-weight: 700; text-align: center; letter-spacing: 0.1mm; }
`;

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
  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<title>${escapeHtml(label.title)}</title>
<style>${LABEL_CSS}</style>
</head>
<body>
<div class="label"><div class="frame">
<img class="logo" src="/brand/logo.png" alt="VDF.BY">
<div class="title">${escapeHtml(label.title)}</div>
<div class="bottom">${sku}<div class="qr">${qr}</div></div>
<div class="site">${escapeHtml(host)}</div>
</div></div>
</body>
</html>`;
}
