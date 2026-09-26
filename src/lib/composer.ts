import path from "node:path";

import sharp, { type Sharp } from "sharp";

export const CANVAS = 1600;

const FONT_FILE = path.join(process.cwd(), "assets", "fonts", "Inter-Bold.ttf");
const LOGO_FILE = path.join(process.cwd(), "public", "brand", "logo.png");

const BAND = 96;
const GLASS_BLUR = 22;
const GLASS_TINT = "#0b1020";
const GLASS_OPACITY = 0.76;
const ACCENT_LIGHT = "#fcd34d";
const ACCENT = "#f59e0b";
const ACCENT_LINE = 4;
const HAIRLINE = 1.5;
const SHADOW_DEPTH = 48;
const BEAM_GAP = 14;
const BEAMS: Array<{ thickness: number; share: number; opacity: number }> = [
  { thickness: 9, share: 0.46, opacity: 1 },
  { thickness: 4, share: 0.3, opacity: 0.75 },
];
const TEXT_HEIGHT = 0.34;
const TEXT_TRACKING = 3200;
const LOW = 0.66;
const HIGH = 0.46;
const PRODUCT_TOP = 120;
const PRODUCT_SIDE = 80;
const PRODUCT_GAP = 36;
const WATERMARK_WIDTH = 230;
const WATERMARK_OPACITY = 0.2;
const WATERMARK_STEP_X = 680;
const WATERMARK_STEP_Y = 380;
const WATERMARK_ANGLE = -30;

export type Slope = "up" | "down";

export const BACKGROUNDS = {
  white: "#ffffff",
  black: "#000000",
  graphite: "#2b2f36",
} as const;

export type Background = keyof typeof BACKGROUNDS;

export function isBackground(value: unknown): value is Background {
  return typeof value === "string" && value in BACKGROUNDS;
}

export interface ComposeOptions {
  product: Buffer;
  car: Buffer;
  label: string;
  mirrorProduct: boolean;
  mirrorCar: boolean;
  slope: Slope;
  productScale: number;
  carShift: number;
  background: Background;
}

function escapeMarkup(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function divider(slope: Slope): { left: number; right: number } {
  const low = Math.round(CANVAS * LOW);
  const high = Math.round(CANVAS * HIGH);
  return slope === "up" ? { left: low, right: high } : { left: high, right: low };
}

function polygon(points: Array<[number, number]>, fill: string): string {
  return `<polygon points="${points.map(([x, y]) => `${x},${y}`).join(" ")}" fill="${fill}"/>`;
}

function svg(body: string): Buffer {
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS}" height="${CANVAS}">${body}</svg>`,
  );
}

async function coverRegion(car: Buffer, height: number, shift: number): Promise<Sharp> {
  const upright = await sharp(car).rotate().png().toBuffer({ resolveWithObject: true });
  const scale = Math.max(CANVAS / upright.info.width, height / upright.info.height);
  const width = Math.ceil(upright.info.width * scale);
  const scaledHeight = Math.ceil(upright.info.height * scale);
  const share = Math.min(Math.max(shift, 0), 1);
  const resized = await sharp(upright.data).resize(width, scaledHeight).png().toBuffer();
  return sharp(resized).extract({
    left: Math.floor((width - CANVAS) / 2),
    top: Math.round((scaledHeight - height) * share),
    width: CANVAS,
    height,
  });
}

async function carLayer(
  car: Buffer,
  mirror: boolean,
  shift: number,
  left: number,
  right: number,
): Promise<Buffer> {
  const top = Math.min(left, right) - BAND;
  const height = CANVAS - top;
  let image = await coverRegion(car, height, shift);
  if (mirror) image = image.flop();
  const photo = await image.png().toBuffer();

  const below = polygon(
    [
      [0, left],
      [CANVAS, right],
      [CANVAS, CANVAS],
      [0, CANVAS],
    ],
    "#fff",
  );

  return sharp({
    create: { width: CANVAS, height: CANVAS, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([
      { input: photo, top, left: 0 },
      { input: svg(below), blend: "dest-in" },
    ])
    .png()
    .toBuffer();
}

async function trimmed(product: Buffer): Promise<Sharp> {
  const upright = await sharp(product).rotate().ensureAlpha().png().toBuffer();
  try {
    const cut = await sharp(upright).trim({ threshold: 24 }).png().toBuffer();
    return sharp(cut);
  } catch {
    return sharp(upright);
  }
}

async function productLayer(
  product: Buffer,
  mirror: boolean,
  scale: number,
  left: number,
  right: number,
): Promise<{ input: Buffer; top: number; left: number }> {
  const boxWidth = CANVAS - PRODUCT_SIDE * 2;
  const bottom = Math.min(left, right) - BAND / 2 - PRODUCT_GAP;
  const boxHeight = bottom - PRODUCT_TOP;
  const factor = Math.min(Math.max(scale, 0.5), 1.3);

  let image = await trimmed(product);
  if (mirror) image = image.flop();
  const { data, info } = await image
    .resize(Math.round(boxWidth * factor), Math.round(boxHeight * factor), {
      fit: "inside",
      withoutEnlargement: false,
    })
    .png()
    .toBuffer({ resolveWithObject: true });

  return {
    input: data,
    left: Math.round((CANVAS - info.width) / 2),
    top: Math.max(0, Math.round(PRODUCT_TOP + (boxHeight - info.height) / 2)),
  };
}

function strip(left: number, right: number, from: number, to: number): Array<[number, number]> {
  return [
    [0, left + from],
    [CANVAS, right + from],
    [CANVAS, right + to],
    [0, left + to],
  ];
}

function bandShadow(left: number, right: number): Buffer {
  const half = BAND / 2;
  return svg(
    `<defs><filter id="s" x="-10%" y="-50%" width="120%" height="200%"><feGaussianBlur stdDeviation="16"/></filter></defs>` +
      `<g filter="url(#s)" opacity="0.5">${polygon(strip(left, right, half - 6, half + SHADOW_DEPTH), "#000")}</g>`,
  );
}

async function glassBand(base: Buffer, left: number, right: number): Promise<Buffer> {
  const half = BAND / 2;
  const tinted = await sharp(base)
    .blur(GLASS_BLUR)
    .composite([
      {
        input: svg(`<rect width="${CANVAS}" height="${CANVAS}" fill="${GLASS_TINT}" fill-opacity="${GLASS_OPACITY}"/>`),
      },
    ])
    .png()
    .toBuffer();
  return sharp(tinted)
    .ensureAlpha()
    .composite([{ input: svg(polygon(strip(left, right, -half, half), "#fff")), blend: "dest-in" }])
    .png()
    .toBuffer();
}

function bandEdges(left: number, right: number): Buffer {
  const half = BAND / 2;
  return svg(
    `<defs><linearGradient id="a" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="${CANVAS}" y2="0">` +
      `<stop offset="0" stop-color="${ACCENT_LIGHT}" stop-opacity="0"/>` +
      `<stop offset="0.2" stop-color="${ACCENT_LIGHT}"/>` +
      `<stop offset="0.5" stop-color="${ACCENT}"/>` +
      `<stop offset="0.8" stop-color="${ACCENT_LIGHT}"/>` +
      `<stop offset="1" stop-color="${ACCENT_LIGHT}" stop-opacity="0"/>` +
      `</linearGradient></defs>` +
      polygon(strip(left, right, -half - ACCENT_LINE, -half), "url(#a)") +
      `<g opacity="0.22">${polygon(strip(left, right, half, half + HAIRLINE), "#fff")}</g>`,
  );
}

function segment(
  left: number,
  right: number,
  fromX: number,
  toX: number,
  fromOffset: number,
  toOffset: number,
): Array<[number, number]> {
  const y = (x: number) => left + ((right - left) * x) / CANVAS;
  return [
    [fromX, y(fromX) + fromOffset],
    [toX, y(toX) + fromOffset],
    [toX, y(toX) + toOffset],
    [fromX, y(fromX) + toOffset],
  ];
}

function bandBeams(left: number, right: number): Buffer {
  const half = BAND / 2;
  const gradients: string[] = [];
  const shapes: string[] = [];

  let above = -half - ACCENT_LINE - BEAM_GAP;
  let below = half + HAIRLINE + BEAM_GAP;
  BEAMS.forEach((beam, index) => {
    const length = CANVAS * beam.share;
    gradients.push(
      `<linearGradient id="u${index}" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="${length}" y2="0">` +
        `<stop offset="0" stop-color="${ACCENT}" stop-opacity="${beam.opacity}"/>` +
        `<stop offset="0.55" stop-color="${ACCENT_LIGHT}" stop-opacity="${beam.opacity * 0.8}"/>` +
        `<stop offset="1" stop-color="${ACCENT_LIGHT}" stop-opacity="0"/>` +
        `</linearGradient>` +
        `<linearGradient id="d${index}" gradientUnits="userSpaceOnUse" x1="${CANVAS}" y1="0" x2="${CANVAS - length}" y2="0">` +
        `<stop offset="0" stop-color="${ACCENT}" stop-opacity="${beam.opacity}"/>` +
        `<stop offset="0.55" stop-color="${ACCENT_LIGHT}" stop-opacity="${beam.opacity * 0.8}"/>` +
        `<stop offset="1" stop-color="${ACCENT_LIGHT}" stop-opacity="0"/>` +
        `</linearGradient>`,
    );
    shapes.push(
      polygon(segment(left, right, 0, length, above - beam.thickness, above), `url(#u${index})`),
      polygon(segment(left, right, CANVAS - length, CANVAS, below, below + beam.thickness), `url(#d${index})`),
    );
    above -= beam.thickness + BEAM_GAP * 0.6;
    below += beam.thickness + BEAM_GAP * 0.6;
  });

  return svg(`<defs>${gradients.join("")}</defs>${shapes.join("")}`);
}

function labelMarkup(label: string): string {
  const text = label.trim().toUpperCase();
  const period = text.match(/\s+((?:С\s+)?\d{4}(?:\s*[–-]\s*\d{4})?)$/);
  const main = period ? text.slice(0, period.index).trim() : text;
  const [mark, ...rest] = main.split(/\s+/);
  const parts = [`<span foreground="${ACCENT_LIGHT}">${escapeMarkup(mark ?? "")}</span>`];
  if (rest.length) parts.push(`<span foreground="#ffffff">${escapeMarkup(rest.join(" "))}</span>`);
  if (period) {
    parts.push(`<span foreground="#ffffff" fgalpha="58%">·  ${escapeMarkup(period[1])}</span>`);
  }
  return `<span letter_spacing="${TEXT_TRACKING}">${parts.join("  ")}</span>`;
}

async function labelLayer(
  label: string,
  left: number,
  right: number,
): Promise<{ input: Buffer; top: number; left: number } | null> {
  if (!label.trim()) return null;

  const length = Math.hypot(CANVAS, right - left);
  const angle = (Math.atan2(right - left, CANVAS) * 180) / Math.PI;

  const rendered = await sharp({
    text: {
      text: labelMarkup(label),
      font: "Inter Bold",
      fontfile: FONT_FILE,
      width: Math.round(length * 0.8),
      height: Math.round(BAND * TEXT_HEIGHT),
      align: "centre",
      rgba: true,
    },
  })
    .png()
    .toBuffer();

  const rotated = await sharp(rendered)
    .rotate(angle, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer({ resolveWithObject: true });

  return {
    input: rotated.data,
    left: Math.round(CANVAS / 2 - rotated.info.width / 2),
    top: Math.round((left + right) / 2 - rotated.info.height / 2),
  };
}

async function watermarkTile(): Promise<{ data: Buffer; width: number; height: number }> {
  const logo = await sharp(LOGO_FILE).resize({ width: WATERMARK_WIDTH }).ensureAlpha().png().toBuffer();
  const pad = 6;
  const shadow = await sharp(logo)
    .tint("#0b1020")
    .extend({ top: pad, bottom: pad, left: pad, right: pad, background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .blur(2.5)
    .png()
    .toBuffer();
  const { data, info } = await sharp(shadow)
    .composite([{ input: logo, top: pad, left: pad }])
    .raw()
    .toBuffer({ resolveWithObject: true });
  for (let index = 3; index < data.length; index += 4) {
    data[index] = Math.round(data[index] * WATERMARK_OPACITY);
  }
  return { data, width: info.width, height: info.height };
}

let watermarkCache: Promise<Buffer> | null = null;

async function buildWatermark(): Promise<Buffer> {
  const tile = await watermarkTile();
  const tileImage = await sharp(tile.data, {
    raw: { width: tile.width, height: tile.height, channels: 4 },
  })
    .png()
    .toBuffer();

  const field = Math.ceil(CANVAS * 1.6);
  const tiles: Array<{ input: Buffer; top: number; left: number }> = [];
  for (let row = 0, top = 0; top < field; row += 1, top += WATERMARK_STEP_Y) {
    const offset = row % 2 ? WATERMARK_STEP_X / 2 : 0;
    for (let left = -offset; left < field; left += WATERMARK_STEP_X) {
      if (left + tile.width <= 0) continue;
      tiles.push({ input: tileImage, top, left: Math.max(0, Math.round(left)) });
    }
  }

  const rotated = await sharp({
    create: { width: field, height: field, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite(tiles)
    .png()
    .toBuffer()
    .then((buffer) =>
      sharp(buffer)
        .rotate(WATERMARK_ANGLE, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toBuffer({ resolveWithObject: true }),
    );

  return sharp(rotated.data)
    .extract({
      left: Math.round((rotated.info.width - CANVAS) / 2),
      top: Math.round((rotated.info.height - CANVAS) / 2),
      width: CANVAS,
      height: CANVAS,
    })
    .png()
    .toBuffer();
}

function watermarkLayer(): Promise<Buffer> {
  watermarkCache ??= buildWatermark().catch((error) => {
    watermarkCache = null;
    throw error;
  });
  return watermarkCache;
}

export async function composeProductImage(options: ComposeOptions): Promise<Buffer> {
  const { left, right } = divider(options.slope);

  const [car, product, label, watermark] = await Promise.all([
    carLayer(options.car, options.mirrorCar, options.carShift, left, right),
    productLayer(options.product, options.mirrorProduct, options.productScale, left, right),
    labelLayer(options.label, left, right),
    watermarkLayer(),
  ]);

  const base = await sharp({
    create: { width: CANVAS, height: CANVAS, channels: 3, background: BACKGROUNDS[options.background] },
  })
    .composite([
      { input: car, top: 0, left: 0 },
      product,
      { input: watermark, top: 0, left: 0 },
      { input: bandShadow(left, right), top: 0, left: 0 },
    ])
    .png()
    .toBuffer();

  return sharp(base)
    .composite([
      { input: await glassBand(base, left, right), top: 0, left: 0 },
      { input: bandEdges(left, right), top: 0, left: 0 },
      { input: bandBeams(left, right), top: 0, left: 0 },
      ...(label ? [label] : []),
    ])
    .jpeg({ quality: 90, mozjpeg: true })
    .toBuffer();
}
