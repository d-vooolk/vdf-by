import path from "node:path";

import sharp, { type Sharp } from "sharp";

export const CANVAS = 1600;

const FONT_FILE = path.join(process.cwd(), "assets", "fonts", "Montserrat-ExtraBold.ttf");
const LOGO_FILE = path.join(process.cwd(), "public", "brand", "logo.png");

const MARGIN = 48;
const RADIUS = 34;
const BAND = 116;
const BAND_RADIUS = 26;
const GAP = 28;
const HIGH = 0.44;
const LOW = 0.6;
const LIME = "#a2db00";
const LIME_LIGHT = "#c4f03a";
const BAND_TEXT = "#0d0f0a";
const TEXT_HEIGHT = 0.4;
const TEXT_WIDTH = 0.82;
const FIELD_CENTER = "#3a3c3f";
const FIELD_EDGE = "#121314";
const FIELD_NOISE = 10;
const PRODUCT_PAD = 56;
const CAR_ZOOM_MIN = 1;
const CAR_ZOOM_MAX = 1.8;
const WATERMARK_WIDTH = 230;
const WATERMARK_OPACITY = 0.22;
const WATERMARK_STEP_X = 680;
const WATERMARK_STEP_Y = 380;
const WATERMARK_ANGLE = -12;

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
  const near = MARGIN;
  const far = CANVAS - MARGIN;
  const edge = (offset: number): [Point, Point] => [
    [near, lineAt(near) + offset],
    [far, lineAt(far) + offset],
  ];
  const [cardLeft, cardRight] = edge(-BAND / 2 - GAP);
  const [bandTopLeft, bandTopRight] = edge(-BAND / 2);
  const [bandBottomLeft, bandBottomRight] = edge(BAND / 2);
  const [carLeft, carRight] = edge(BAND / 2 + GAP);
  return {
    lineAt,
    productCard: [[near, near], [far, near], cardRight, cardLeft],
    band: [bandTopLeft, bandTopRight, bandBottomRight, bandBottomLeft],
    carCard: [carLeft, carRight, [far, far], [near, far]],
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
  const boxTop = MARGIN + PRODUCT_PAD;
  const boxWidth = CANVAS - (MARGIN + PRODUCT_PAD) * 2;
  const boxHeight = bottom - PRODUCT_PAD - boxTop;
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

const fieldLayer = cached(async () => {
  const gradient = svg(
    `<defs><radialGradient id="f" cx="0.5" cy="0.45" r="0.75">` +
      `<stop offset="0" stop-color="${FIELD_CENTER}"/><stop offset="1" stop-color="${FIELD_EDGE}"/>` +
      `</radialGradient></defs><rect width="${CANVAS}" height="${CANVAS}" fill="url(#f)"/>`,
  );
  const noise = Buffer.alloc(CANVAS * CANVAS * 4);
  let seed = 20261017;
  for (let index = 0; index < noise.length; index += 4) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const light = seed & 0x10000 ? 255 : 0;
    noise[index] = light;
    noise[index + 1] = light;
    noise[index + 2] = light;
    noise[index + 3] = (seed >>> 24) % FIELD_NOISE;
  }
  return sharp(gradient)
    .composite([{ input: noise, raw: { width: CANVAS, height: CANVAS, channels: 4 } }])
    .png()
    .toBuffer();
});

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
  const logo = await sharp(paint(Buffer.from(raw), 255), rawInfo).png().toBuffer();
  const shadow = await sharp(paint(Buffer.from(raw), 0), rawInfo).blur(2.5).png().toBuffer();
  const { data, info } = await sharp(shadow)
    .composite([{ input: logo }])
    .raw()
    .toBuffer({ resolveWithObject: true });
  for (let index = 3; index < data.length; index += 4) {
    data[index] = Math.round(data[index] * WATERMARK_OPACITY);
  }
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
  const car = await coverRegion(options.car, CANVAS - MARGIN * 2, CANVAS - MARGIN - shape.carTop, {
    mirror: options.mirrorCar,
    shiftX: options.carShiftX,
    shiftY: options.carShift,
    zoom: options.carZoom,
  });
  const productCard = roundedPath(shape.productCard, RADIUS);
  const carCard = roundedPath(shape.carCard, RADIUS);
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
    clip([{ input: car, top: shape.carTop, left: MARGIN }], carCard),
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

function cardShadow(shape: Layout): Buffer {
  return svg(
    `<defs><filter id="s" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="18"/></filter></defs>` +
      `<g filter="url(#s)" opacity="0.6" transform="translate(0 12)">` +
      `<path d="${roundedPath(shape.productCard, RADIUS)}" fill="#000"/>` +
      `<path d="${roundedPath(shape.carCard, RADIUS)}" fill="#000"/></g>`,
  );
}

function bandLayer(shape: Layout): Buffer {
  const outline = roundedPath(shape.band, BAND_RADIUS);
  const [topLeft, topRight] = shape.band;
  const top = Math.min(topLeft[1], topRight[1]);
  const bottom = Math.max(topLeft[1], topRight[1]) + BAND;
  return svg(
    `<defs>` +
      `<filter id="glow" x="-10%" y="-60%" width="120%" height="220%"><feGaussianBlur stdDeviation="24"/></filter>` +
      `<linearGradient id="fill" gradientUnits="userSpaceOnUse" x1="0" y1="${top}" x2="0" y2="${bottom}">` +
      `<stop offset="0" stop-color="${LIME_LIGHT}"/><stop offset="0.5" stop-color="${LIME}"/>` +
      `<stop offset="1" stop-color="${LIME}"/></linearGradient>` +
      `</defs>` +
      `<path d="${outline}" fill="${LIME}" opacity="0.65" filter="url(#glow)"/>` +
      `<path d="${outline}" fill="url(#fill)"/>` +
      `<line x1="${topLeft[0] + BAND_RADIUS}" y1="${topLeft[1] + 2}" x2="${topRight[0] - BAND_RADIUS}" ` +
      `y2="${topRight[1] + 2}" stroke="#ffffff" stroke-opacity="0.4" stroke-width="2"/>`,
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

export async function composeProductImage(options: ComposeOptions): Promise<Buffer> {
  const shape = layout(options.slope);

  const [field, product, label] = await Promise.all([
    fieldLayer(),
    productLayer(options.product, options.mirrorProduct, options.productScale, shape.productBottom),
    labelLayer(options.label, shape),
  ]);
  const cards = await cardsLayer(options, shape, product);

  return sharp(field)
    .composite([
      { input: cardShadow(shape), top: 0, left: 0 },
      { input: cards, top: 0, left: 0 },
      { input: bandLayer(shape), top: 0, left: 0 },
      ...(label ? [label] : []),
    ])
    .flatten({ background: FIELD_EDGE })
    .jpeg({ quality: 90, mozjpeg: true })
    .toBuffer();
}
