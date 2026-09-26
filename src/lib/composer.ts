import path from "node:path";

import sharp, { type Sharp } from "sharp";

export const CANVAS = 1600;

const FONT_FILE = path.join(process.cwd(), "assets", "fonts", "Inter-Bold.ttf");
const LOGO_FILE = path.join(process.cwd(), "public", "brand", "logo.png");

const BAND = 108;
const EDGE = 8;
const BAND_COLOR = "#1c2743";
const EDGE_COLOR = "#f59e0b";
const LOW = 0.66;
const HIGH = 0.46;
const PRODUCT_TOP = 120;
const PRODUCT_SIDE = 80;
const PRODUCT_GAP = 36;
const LOGO_WIDTH = 300;
const LOGO_MARGIN = 44;

export type Slope = "up" | "down";

export interface ComposeOptions {
  product: Buffer;
  car: Buffer;
  label: string;
  mirrorProduct: boolean;
  mirrorCar: boolean;
  slope: Slope;
  productScale: number;
  carShift: number;
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

function bandShapes(left: number, right: number): string {
  const half = BAND / 2;
  const stripe = (offset: number, thickness: number, color: string) =>
    polygon(
      [
        [0, left + offset],
        [CANVAS, right + offset],
        [CANVAS, right + offset + thickness],
        [0, left + offset + thickness],
      ],
      color,
    );
  return [
    stripe(-half - EDGE, EDGE, EDGE_COLOR),
    stripe(-half, BAND, BAND_COLOR),
    stripe(half, EDGE, EDGE_COLOR),
  ].join("");
}

async function labelLayer(
  label: string,
  left: number,
  right: number,
): Promise<{ input: Buffer; top: number; left: number } | null> {
  const text = label.trim();
  if (!text) return null;

  const length = Math.hypot(CANVAS, right - left);
  const angle = (Math.atan2(right - left, CANVAS) * 180) / Math.PI;

  const rendered = await sharp({
    text: {
      text: `<span foreground="#ffffff">${escapeMarkup(text)}</span>`,
      font: "Inter Bold",
      fontfile: FONT_FILE,
      width: Math.round(length * 0.84),
      height: Math.round(BAND * 0.46),
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

async function logoLayer(opacity: number): Promise<Buffer> {
  const { data, info } = await sharp(LOGO_FILE)
    .resize({ width: LOGO_WIDTH })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  for (let index = 3; index < data.length; index += 4) {
    data[index] = Math.round(data[index] * opacity);
  }
  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png()
    .toBuffer();
}

export async function composeProductImage(options: ComposeOptions): Promise<Buffer> {
  const { left, right } = divider(options.slope);

  const [car, product, label, logo] = await Promise.all([
    carLayer(options.car, options.mirrorCar, options.carShift, left, right),
    productLayer(options.product, options.mirrorProduct, options.productScale, left, right),
    labelLayer(options.label, left, right),
    logoLayer(0.85),
  ]);
  const logoHeight = (await sharp(logo).metadata()).height ?? 50;

  const logoOnProduct =
    options.slope === "up"
      ? { input: logo, top: LOGO_MARGIN, left: LOGO_MARGIN }
      : { input: logo, top: LOGO_MARGIN, left: CANVAS - LOGO_WIDTH - LOGO_MARGIN };
  const logoOnCar = {
    input: logo,
    top: CANVAS - logoHeight - LOGO_MARGIN,
    left: options.slope === "up" ? CANVAS - LOGO_WIDTH - LOGO_MARGIN : LOGO_MARGIN,
  };

  return sharp({
    create: { width: CANVAS, height: CANVAS, channels: 3, background: "#ffffff" },
  })
    .composite([
      { input: car, top: 0, left: 0 },
      product,
      { input: svg(bandShapes(left, right)), top: 0, left: 0 },
      ...(label ? [label] : []),
      logoOnProduct,
      logoOnCar,
    ])
    .jpeg({ quality: 90, mozjpeg: true })
    .toBuffer();
}
