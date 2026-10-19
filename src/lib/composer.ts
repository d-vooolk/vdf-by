import path from "node:path";

import sharp, { type Sharp } from "sharp";

import { flagMarkup, isMarket, type Market } from "./market-flags.mjs";

export const CANVAS = 1600;

const FONT_FILE = path.join(process.cwd(), "assets", "fonts", "Montserrat-ExtraBold.ttf");
const LOGO_FILE = path.join(process.cwd(), "public", "brand", "logo.png");

const BAND = 116;
const BAND_RADIUS = 26;
const BAND_INSET = 28;
const GAP = 10;
const HIGH = 0.44;
const LOW = 0.6;
const BAND_COLOR = "#1e362d";
const BAND_COLOR_LIGHT = "#2f4a3d";
const BAND_EDGE = "#b8a586";
const BAND_TEXT = "#c8b48e";
const TEXT_HEIGHT = 0.4;
const TEXT_WIDTH = 0.82;
const PRODUCT_PAD = 18;
const CAR_ZOOM_MIN = 1;
const CAR_ZOOM_MAX = 1.8;
const WATERMARK_WIDTH = 230;
const WATERMARK_OPACITY = 0.14;
const WATERMARK_SHADOW_OPACITY = 0.1;
const WATERMARK_STEP_X = 680;
const WATERMARK_STEP_Y = 380;
const WATERMARK_ANGLE = -12;
const FLAG_WIDTH = 210;
const FLAG_HEIGHT = 140;
const FLAG_INSET = 44;
const FLAG_RADIUS = 14;
const FLAG_BORDER = 6;

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
  carShiftX: number;
  carZoom: number;
  background: Background;
  market: Market | "";
}

export type ComposerSettings = Omit<ComposeOptions, "product" | "car" | "label">;

export const DEFAULT_COMPOSER_SETTINGS: ComposerSettings = {
  mirrorProduct: false,
  mirrorCar: false,
  slope: "down",
  productScale: 1,
  carShift: 0.5,
  carShiftX: 0.5,
  carZoom: 1,
  background: "white",
  market: "",
};

function finiteOr(value: unknown, fallback: number): number {
  const number = Number(value);
  return value !== null && value !== "" && Number.isFinite(number) ? number : fallback;
}

export function parseComposerSettings(raw: unknown): ComposerSettings {
  const value = (raw ?? {}) as Record<string, unknown>;
  const defaults = DEFAULT_COMPOSER_SETTINGS;
  return {
    mirrorProduct: value.mirrorProduct === true,
    mirrorCar: value.mirrorCar === true,
    slope: value.slope === "up" ? "up" : value.slope === "down" ? "down" : defaults.slope,
    productScale: finiteOr(value.productScale, defaults.productScale),
    carShift: finiteOr(value.carShift, defaults.carShift),
    carShiftX: finiteOr(value.carShiftX, defaults.carShiftX),
    carZoom: finiteOr(value.carZoom, defaults.carZoom),
    background: isBackground(value.background) ? value.background : defaults.background,
    market: isMarket(value.market) ? value.market : defaults.market,
  };
}

function escapeMarkup(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function divider(slope: Slope): { left: number; right: number } {
  const low = Math.round(CANVAS * LOW);
  const high = Math.round(CANVAS * HIGH);
  return slope === "up" ? { left: low, right: high } : { left: high, right: low };
}

type Point = [number, number];

function svg(body: string): Buffer {
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS}" height="${CANVAS}">${body}</svg>`,
  );
}

function roundedPath(points: Point[], radius: number): string {
  const toward = (from: Point, to: Point): Point => {
    const length = Math.hypot(to[0] - from[0], to[1] - from[1]);
    const step = Math.min(radius, length / 2) / length;
    return [from[0] + (to[0] - from[0]) * step, from[1] + (to[1] - from[1]) * step];
  };
  const format = ([x, y]: Point) => `${x.toFixed(1)},${y.toFixed(1)}`;
  const parts = points.map((corner, index) => {
    const previous = points[(index + points.length - 1) % points.length];
    const next = points[(index + 1) % points.length];
    return `${index === 0 ? "M" : "L"}${format(toward(corner, previous))} Q${format(corner)} ${format(toward(corner, next))}`;
  });
  return `${parts.join(" ")} Z`;
}

interface Layout {
  lineAt: (x: number) => number;
  productCard: Point[];
  band: Point[];
  carCard: Point[];
  productBottom: number;
  carTop: number;
}

function layout(slope: Slope): Layout {
  const { left, right } = divider(slope);
  const lineAt = (x: number) => left + ((right - left) * x) / CANVAS;
  const edge = (near: number, far: number, offset: number): [Point, Point] => [
    [near, lineAt(near) + offset],
    [far, lineAt(far) + offset],
  ];
  const [cardLeft, cardRight] = edge(0, CANVAS, -BAND / 2 - GAP);
  const [carLeft, carRight] = edge(0, CANVAS, BAND / 2 + GAP);
  const [bandTopLeft, bandTopRight] = edge(BAND_INSET, CANVAS - BAND_INSET, -BAND / 2);
  const [bandBottomLeft, bandBottomRight] = edge(BAND_INSET, CANVAS - BAND_INSET, BAND / 2);
  return {
    lineAt,
    productCard: [[0, 0], [CANVAS, 0], cardRight, cardLeft],
    band: [bandTopLeft, bandTopRight, bandBottomRight, bandBottomLeft],
    carCard: [carLeft, carRight, [CANVAS, CANVAS], [0, CANVAS]],
    productBottom: Math.min(cardLeft[1], cardRight[1]),
    carTop: Math.floor(Math.min(carLeft[1], carRight[1])),
  };
}

const clampShare = (value: number) => Math.min(Math.max(value, 0), 1);

interface CarFraming {
  mirror: boolean;
  shiftX: number;
  shiftY: number;
  zoom: number;
}

async function coverRegion(car: Buffer, width: number, height: number, framing: CarFraming): Promise<Buffer> {
  const upright = await sharp(car).rotate().png().toBuffer({ resolveWithObject: true });
  const zoom = Math.min(Math.max(framing.zoom, CAR_ZOOM_MIN), CAR_ZOOM_MAX);
  const scale = Math.max(width / upright.info.width, height / upright.info.height) * zoom;
  const scaledWidth = Math.max(width, Math.ceil(upright.info.width * scale));
  const scaledHeight = Math.max(height, Math.ceil(upright.info.height * scale));
  let resized = sharp(upright.data).resize(scaledWidth, scaledHeight, { fit: "fill" });
  if (framing.mirror) resized = resized.flop();
  return sharp(await resized.png().toBuffer())
    .extract({
      left: Math.round((scaledWidth - width) * (1 - clampShare(framing.shiftX))),
      top: Math.round((scaledHeight - height) * (1 - clampShare(framing.shiftY))),
      width,
      height,
    })
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
  bottom: number,
): Promise<{ input: Buffer; top: number; left: number }> {
  const boxTop = PRODUCT_PAD;
  const boxWidth = CANVAS - PRODUCT_PAD * 2;
  const boxHeight = bottom - PRODUCT_PAD - boxTop;
  const factor = Math.min(Math.max(scale, 0.5), 1.3);

  let image = await trimmed(product);
  if (mirror) image = image.flop();
  const { data, info } = await image
    .resize(Math.min(CANVAS, Math.round(boxWidth * factor)), Math.min(CANVAS, Math.round(boxHeight * factor)), {
      fit: "inside",
      withoutEnlargement: false,
    })
    .png()
    .toBuffer({ resolveWithObject: true });

  return {
    input: data,
    left: Math.round((CANVAS - info.width) / 2),
    top: Math.max(0, Math.round(boxTop + (boxHeight - info.height) / 2)),
  };
}

function cached(build: () => Promise<Buffer>): () => Promise<Buffer> {
  let cache: Promise<Buffer> | null = null;
  return () => {
    cache ??= build().catch((error) => {
      cache = null;
      throw error;
    });
    return cache;
  };
}

function paint(data: Buffer, value: number): Buffer {
  for (let index = 0; index < data.length; index += 4) {
    data[index] = value;
    data[index + 1] = value;
    data[index + 2] = value;
  }
  return data;
}

async function watermarkTile(): Promise<{ data: Buffer; width: number; height: number }> {
  const pad = 6;
  const { data: raw, info: size } = await sharp(LOGO_FILE)
    .resize({ width: WATERMARK_WIDTH })
    .ensureAlpha()
    .extend({ top: pad, bottom: pad, left: pad, right: pad, background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const rawInfo = { raw: { width: size.width, height: size.height, channels: 4 as const } };
  const shadow = await sharp(paint(Buffer.from(raw), 0), rawInfo).blur(2.5).raw().toBuffer();
  const faded = (data: Buffer, opacity: number) => {
    for (let index = 3; index < data.length; index += 4) data[index] = Math.round(data[index] * opacity);
    return sharp(data, rawInfo).png().toBuffer();
  };
  const { data, info } = await sharp(await faded(shadow, WATERMARK_SHADOW_OPACITY))
    .composite([{ input: await faded(paint(Buffer.from(raw), 255), WATERMARK_OPACITY) }])
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

const watermarkLayer = cached(async () => {
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
});

function transparent(): Sharp {
  return sharp({
    create: { width: CANVAS, height: CANVAS, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  });
}

async function cardsLayer(
  options: ComposeOptions,
  shape: Layout,
  product: { input: Buffer; top: number; left: number },
): Promise<Buffer> {
  const car = await coverRegion(options.car, CANVAS, CANVAS - shape.carTop, {
    mirror: options.mirrorCar,
    shiftX: options.carShiftX,
    shiftY: options.carShift,
    zoom: options.carZoom,
  });
  const productCard = roundedPath(shape.productCard, 0);
  const carCard = roundedPath(shape.carCard, 0);
  const clip = (layers: Array<{ input: Buffer; top: number; left: number }>, outline: string) =>
    transparent()
      .composite([...layers, { input: svg(`<path d="${outline}" fill="#fff"/>`), blend: "dest-in" }])
      .png()
      .toBuffer();
  const [productSide, carSide] = await Promise.all([
    clip(
      [{ input: svg(`<path d="${productCard}" fill="${BACKGROUNDS[options.background]}"/>`), top: 0, left: 0 }, product],
      productCard,
    ),
    clip([{ input: car, top: shape.carTop, left: 0 }], carCard),
  ]);
  const clipped = await transparent()
    .composite([
      { input: productSide, top: 0, left: 0 },
      { input: carSide, top: 0, left: 0 },
    ])
    .png()
    .toBuffer();
  return sharp(clipped)
    .composite([{ input: await watermarkLayer(), blend: "atop" }])
    .png()
    .toBuffer();
}

function bandLayer(shape: Layout): Buffer {
  const outline = roundedPath(shape.band, BAND_RADIUS);
  const [topLeft, topRight] = shape.band;
  const top = Math.min(topLeft[1], topRight[1]);
  const bottom = Math.max(topLeft[1], topRight[1]) + BAND;
  return svg(
    `<defs>` +
      `<filter id="shade" x="-10%" y="-60%" width="120%" height="220%"><feGaussianBlur stdDeviation="16"/></filter>` +
      `<linearGradient id="fill" gradientUnits="userSpaceOnUse" x1="0" y1="${top}" x2="0" y2="${bottom}">` +
      `<stop offset="0" stop-color="${BAND_COLOR_LIGHT}"/><stop offset="0.55" stop-color="${BAND_COLOR}"/>` +
      `<stop offset="1" stop-color="${BAND_COLOR}"/></linearGradient>` +
      `</defs>` +
      `<path d="${outline}" fill="#000000" opacity="0.35" filter="url(#shade)" transform="translate(0 10)"/>` +
      `<path d="${outline}" fill="url(#fill)"/>` +
      `<path d="${outline}" fill="none" stroke="${BAND_EDGE}" stroke-opacity="0.6" stroke-width="2"/>` +
      `<line x1="${topLeft[0] + BAND_RADIUS}" y1="${topLeft[1] + 3}" x2="${topRight[0] - BAND_RADIUS}" ` +
      `y2="${topRight[1] + 3}" stroke="#ffffff" stroke-opacity="0.18" stroke-width="2"/>`,
  );
}

async function labelLayer(
  label: string,
  shape: Layout,
): Promise<{ input: Buffer; top: number; left: number } | null> {
  if (!label.trim()) return null;

  const [topLeft, topRight] = shape.band;
  const length = Math.hypot(topRight[0] - topLeft[0], topRight[1] - topLeft[1]);
  const angle = (Math.atan2(topRight[1] - topLeft[1], topRight[0] - topLeft[0]) * 180) / Math.PI;

  const rendered = await sharp({
    text: {
      text: `<span foreground="${BAND_TEXT}">${escapeMarkup(label.trim().toUpperCase())}</span>`,
      font: "Montserrat ExtraBold",
      fontfile: FONT_FILE,
      width: Math.round(length * TEXT_WIDTH),
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
    top: Math.round(shape.lineAt(CANVAS / 2) - rotated.info.height / 2),
  };
}

function flagLayer(market: Market | ""): Buffer | null {
  if (!market) return null;
  const outerWidth = FLAG_WIDTH + FLAG_BORDER * 2;
  const outerHeight = FLAG_HEIGHT + FLAG_BORDER * 2;
  const x = CANVAS - FLAG_INSET - outerWidth;
  const y = FLAG_INSET;
  return svg(
    `<defs>` +
      `<filter id="flagShadow" x="-20%" y="-20%" width="140%" height="160%"><feGaussianBlur stdDeviation="9"/></filter>` +
      `<clipPath id="flagClip"><rect x="${x + FLAG_BORDER}" y="${y + FLAG_BORDER}" width="${FLAG_WIDTH}" height="${FLAG_HEIGHT}" rx="${FLAG_RADIUS - FLAG_BORDER / 2}"/></clipPath>` +
      `</defs>` +
      `<rect x="${x}" y="${y + 8}" width="${outerWidth}" height="${outerHeight}" rx="${FLAG_RADIUS}" fill="#000" opacity="0.28" filter="url(#flagShadow)"/>` +
      `<rect x="${x}" y="${y}" width="${outerWidth}" height="${outerHeight}" rx="${FLAG_RADIUS}" fill="#ffffff"/>` +
      `<g clip-path="url(#flagClip)"><svg x="${x + FLAG_BORDER}" y="${y + FLAG_BORDER}" width="${FLAG_WIDTH}" height="${FLAG_HEIGHT}" viewBox="0 0 30 20" preserveAspectRatio="none">${flagMarkup(market)}</svg></g>` +
      `<rect x="${x + FLAG_BORDER}" y="${y + FLAG_BORDER}" width="${FLAG_WIDTH}" height="${FLAG_HEIGHT}" rx="${FLAG_RADIUS - FLAG_BORDER / 2}" fill="none" stroke="#000" stroke-opacity="0.12" stroke-width="2"/>`,
  );
}

export async function composeProductImage(options: ComposeOptions): Promise<Buffer> {
  const shape = layout(options.slope);

  const [product, label] = await Promise.all([
    productLayer(options.product, options.mirrorProduct, options.productScale, shape.productBottom),
    labelLayer(options.label, shape),
  ]);
  const cards = await cardsLayer(options, shape, product);
  const flag = flagLayer(options.market);

  return sharp({ create: { width: CANVAS, height: CANVAS, channels: 3, background: "#ffffff" } })
    .composite([
      { input: cards, top: 0, left: 0 },
      ...(flag ? [{ input: flag, top: 0, left: 0 }] : []),
      { input: bandLayer(shape), top: 0, left: 0 },
      ...(label ? [label] : []),
    ])
    .flatten({ background: "#ffffff" })
    .jpeg({ quality: 90, mozjpeg: true })
    .toBuffer();
}
