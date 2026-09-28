#!/usr/bin/env node
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

import ort from "onnxruntime-node";
import sharp from "sharp";

sharp.cache(false);
sharp.concurrency(2);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MODELS_DIR = path.join(ROOT, "var", "models");
const IDLE_MS = 3 * 60 * 1000;

const MODELS = {
  cutout: {
    file: "isnet-general-use.onnx",
    url: "https://github.com/danielgatis/rembg/releases/download/v0.0.0/isnet-general-use.onnx",
    bytes: 178648008,
  },
  plates: {
    file: "yolo-v9-t-640-license-plates-end2end.onnx",
    url: "https://github.com/ankandrew/open-image-models/releases/download/assets/yolo-v9-t-640-license-plates-end2end.onnx",
    bytes: 7835770,
  },
  inpaint: {
    file: "lama_fp32.onnx",
    url: "https://huggingface.co/Carve/LaMa-ONNX/resolve/main/lama_fp32.onnx",
    bytes: 208044816,
  },
};

const CUTOUT_SIZE = 1024;
const PLATES_SIZE = 640;
const PLATE_SCORE = 0.4;
const ALPHA_LOW = 0.3;
const ALPHA_HIGH = 0.88;
const INPAINT_SIZE = 512;
const INPAINT_CONTEXT = 2.2;
const STROKE_THRESHOLD = 16;

const SESSION_OPTIONS = {
  intraOpNumThreads: 2,
  interOpNumThreads: 1,
  enableCpuMemArena: false,
  enableMemPattern: false,
  executionMode: "sequential",
};

const EXCLUSIVE_MODELS = ["cutout", "inpaint"];

const sessions = new Map();
const downloads = new Map();

async function download(model) {
  const target = path.join(MODELS_DIR, model.file);
  if (fs.existsSync(target) && fs.statSync(target).size === model.bytes) return target;

  await fsp.mkdir(MODELS_DIR, { recursive: true });
  const partial = `${target}.part`;
  const response = await fetch(model.url, { redirect: "follow" });
  if (!response.ok || !response.body) {
    throw new Error(`Не удалось скачать модель ${model.file}: ${response.status}`);
  }
  await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(partial));
  const size = (await fsp.stat(partial)).size;
  if (size !== model.bytes) {
    await fsp.rm(partial, { force: true });
    throw new Error(`Модель ${model.file} скачалась не полностью (${size} из ${model.bytes} байт)`);
  }
  await fsp.rename(partial, target);
  return target;
}

function ensureModel(name) {
  const model = MODELS[name];
  if (!downloads.has(name)) {
    downloads.set(
      name,
      download(model).catch((error) => {
        downloads.delete(name);
        throw error;
      }),
    );
  }
  return downloads.get(name);
}

async function releaseOthers(name) {
  if (!EXCLUSIVE_MODELS.includes(name)) return;
  for (const other of EXCLUSIVE_MODELS) {
    if (other === name || !sessions.has(other)) continue;
    const loaded = sessions.get(other);
    sessions.delete(other);
    await loaded.then((open) => open.release()).catch(() => {});
  }
}

async function session(name) {
  await releaseOthers(name);
  if (!sessions.has(name)) {
    sessions.set(
      name,
      ensureModel(name)
        .then((file) => ort.InferenceSession.create(file, SESSION_OPTIONS))
        .catch((error) => {
          sessions.delete(name);
          throw error;
        }),
    );
  }
  return sessions.get(name);
}

async function cutout(image) {
  const model = await session("cutout");
  const { width, height } = await sharp(image).metadata();
  const size = CUTOUT_SIZE;
  const pixels = await sharp(image).resize(size, size, { fit: "fill" }).removeAlpha().raw().toBuffer();

  let peak = 1;
  for (const value of pixels) if (value > peak) peak = value;

  const plane = size * size;
  const input = new Float32Array(3 * plane);
  for (let index = 0; index < plane; index += 1) {
    for (let channel = 0; channel < 3; channel += 1) {
      input[channel * plane + index] = pixels[index * 3 + channel] / peak - 0.5;
    }
  }

  const output = await model.run({
    [model.inputNames[0]]: new ort.Tensor("float32", input, [1, 3, size, size]),
  });
  const prediction = output[model.outputNames[0]].data;

  let low = Infinity;
  let high = -Infinity;
  for (let index = 0; index < plane; index += 1) {
    if (prediction[index] < low) low = prediction[index];
    if (prediction[index] > high) high = prediction[index];
  }
  const range = high - low || 1;

  const mask = Buffer.alloc(plane);
  for (let index = 0; index < plane; index += 1) {
    const value = (prediction[index] - low) / range;
    const curved = Math.min(1, Math.max(0, (value - ALPHA_LOW) / (ALPHA_HIGH - ALPHA_LOW)));
    mask[index] = Math.round(curved * 255);
  }

  const alpha = await sharp(mask, { raw: { width: size, height: size, channels: 1 } })
    .resize(width, height, { fit: "fill" })
    .extractChannel(0)
    .raw()
    .toBuffer();
  const rgb = await sharp(image).removeAlpha().raw().toBuffer();

  const rgba = Buffer.alloc(width * height * 4);
  for (let index = 0; index < width * height; index += 1) {
    rgba[index * 4] = rgb[index * 3];
    rgba[index * 4 + 1] = rgb[index * 3 + 1];
    rgba[index * 4 + 2] = rgb[index * 3 + 2];
    rgba[index * 4 + 3] = alpha[index];
  }

  return sharp(rgba, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

async function plates(image) {
  const model = await session("plates");
  const { width, height } = await sharp(image).metadata();
  const size = PLATES_SIZE;
  const ratio = Math.min(size / width, size / height);
  const scaledWidth = Math.round(width * ratio);
  const scaledHeight = Math.round(height * ratio);
  const padX = (size - scaledWidth) / 2;
  const padY = (size - scaledHeight) / 2;

  const pixels = await sharp(image)
    .resize(scaledWidth, scaledHeight, { fit: "fill" })
    .extend({
      top: Math.round(padY - 0.1),
      bottom: Math.round(padY + 0.1),
      left: Math.round(padX - 0.1),
      right: Math.round(padX + 0.1),
      background: { r: 114, g: 114, b: 114 },
    })
    .removeAlpha()
    .raw()
    .toBuffer();

  const plane = size * size;
  const input = new Float32Array(3 * plane);
  for (let index = 0; index < plane; index += 1) {
    for (let channel = 0; channel < 3; channel += 1) {
      input[channel * plane + index] = pixels[index * 3 + channel] / 255;
    }
  }

  const output = await model.run({
    [model.inputNames[0]]: new ort.Tensor("float32", input, [1, 3, size, size]),
  });
  const result = output[model.outputNames[0]];
  const [rows, columns] = result.dims;
  const boxes = [];
  for (let row = 0; row < rows; row += 1) {
    const [, x1, y1, x2, y2, , score] = result.data.slice(row * columns, (row + 1) * columns);
    if (score < PLATE_SCORE) continue;
    const left = Math.max(0, Math.round((x1 - padX) / ratio));
    const top = Math.max(0, Math.round((y1 - padY) / ratio));
    const right = Math.min(width, Math.round((x2 - padX) / ratio));
    const bottom = Math.min(height, Math.round((y2 - padY) / ratio));
    if (right - left < 4 || bottom - top < 4) continue;
    boxes.push({ left, top, width: right - left, height: bottom - top, score });
  }
  return boxes;
}

function strokeBounds(strokes, width, height) {
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (strokes[y * width + x] < STROKE_THRESHOLD) continue;
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
  }
  return right < 0 ? null : { left, top, width: right - left + 1, height: bottom - top + 1 };
}

function contextWindow(bounds, width, height) {
  const wanted = Math.max(INPAINT_SIZE, Math.round(Math.max(bounds.width, bounds.height) * INPAINT_CONTEXT));
  const side = Math.min(Math.max(width, height), wanted);
  const cropWidth = Math.min(width, side);
  const cropHeight = Math.min(height, side);
  const centerX = bounds.left + bounds.width / 2;
  const centerY = bounds.top + bounds.height / 2;
  return {
    left: Math.min(width - cropWidth, Math.max(0, Math.round(centerX - cropWidth / 2))),
    top: Math.min(height - cropHeight, Math.max(0, Math.round(centerY - cropHeight / 2))),
    width: cropWidth,
    height: cropHeight,
    side,
  };
}

async function inpaint({ image, mask }) {
  const model = await session("inpaint");
  const source = Buffer.from(image);
  const { width, height } = await sharp(source).metadata();
  const strokes = await sharp(Buffer.from(mask))
    .ensureAlpha()
    .extractChannel(3)
    .resize(width, height, { fit: "fill" })
    .raw()
    .toBuffer();

  const bounds = strokeBounds(strokes, width, height);
  if (!bounds) throw new Error("Закрасьте водяной знак кистью");

  const area = contextWindow(bounds, width, height);
  const size = INPAINT_SIZE;
  const padding = { right: area.side - area.width, bottom: area.side - area.height };

  const context = await sharp(source)
    .removeAlpha()
    .extract({ left: area.left, top: area.top, width: area.width, height: area.height })
    .extend({ ...padding, extendWith: "mirror" })
    .png()
    .toBuffer();
  const pixels = await sharp(context).resize(size, size, { fit: "fill" }).raw().toBuffer();

  const holeWindow = await sharp(strokes, { raw: { width, height, channels: 1 } })
    .extract({ left: area.left, top: area.top, width: area.width, height: area.height })
    .extend({ ...padding, background: { r: 0, g: 0, b: 0 } })
    .png()
    .toBuffer();
  const holes = await sharp(holeWindow)
    .resize(size, size, { fit: "fill" })
    .blur(2)
    .threshold(STROKE_THRESHOLD)
    .extractChannel(0)
    .raw()
    .toBuffer();

  const plane = size * size;
  const input = new Float32Array(3 * plane);
  const holeInput = new Float32Array(plane);
  for (let index = 0; index < plane; index += 1) {
    for (let channel = 0; channel < 3; channel += 1) {
      input[channel * plane + index] = pixels[index * 3 + channel] / 255;
    }
    holeInput[index] = holes[index] ? 1 : 0;
  }

  const output = await model.run({
    image: new ort.Tensor("float32", input, [1, 3, size, size]),
    mask: new ort.Tensor("float32", holeInput, [1, 1, size, size]),
  });
  const painted = output[model.outputNames[0]].data;

  const rgb = Buffer.alloc(3 * plane);
  for (let index = 0; index < plane; index += 1) {
    for (let channel = 0; channel < 3; channel += 1) {
      rgb[index * 3 + channel] = Math.min(255, Math.max(0, Math.round(painted[channel * plane + index])));
    }
  }

  const crop = { left: 0, top: 0, width: area.width, height: area.height };
  const patch = await sharp(rgb, { raw: { width: size, height: size, channels: 3 } })
    .resize(area.side, area.side, { fit: "fill", kernel: "cubic" })
    .extract(crop)
    .raw()
    .toBuffer();
  const blend = await sharp(holes, { raw: { width: size, height: size, channels: 1 } })
    .resize(area.side, area.side, { fit: "fill" })
    .extract(crop)
    .blur(1.5)
    .extractChannel(0)
    .raw()
    .toBuffer();

  const rgba = Buffer.alloc(area.width * area.height * 4);
  for (let index = 0; index < area.width * area.height; index += 1) {
    rgba[index * 4] = patch[index * 3];
    rgba[index * 4 + 1] = patch[index * 3 + 1];
    rgba[index * 4 + 2] = patch[index * 3 + 2];
    rgba[index * 4 + 3] = blend[index];
  }

  return sharp(source)
    .composite([
      {
        input: rgba,
        raw: { width: area.width, height: area.height, channels: 4 },
        left: area.left,
        top: area.top,
      },
    ])
    .webp({ quality: 95 })
    .toBuffer();
}

let composer = null;

async function compose(options) {
  composer ??= await import(pathToFileURL(path.join(ROOT, "src", "lib", "composer.ts")).href);
  return composer.composeProductImage({
    ...options,
    product: Buffer.from(options.product),
    car: Buffer.from(options.car),
  });
}

const TASKS = {
  cutout: (payload) => cutout(Buffer.from(payload)),
  plates: (payload) => plates(Buffer.from(payload)),
  inpaint,
  compose,
};

if (process.argv.includes("--download")) {
  for (const name of Object.keys(MODELS)) {
    const file = await ensureModel(name);
    console.log(`[ml] ${path.relative(ROOT, file)} на месте`);
  }
  process.exit(0);
}

if (!process.send) {
  console.error("[ml] Этот файл запускается сайтом. Скачать модели заранее: node scripts/ml-worker.mjs --download");
  process.exit(1);
}

let active = 0;
let idleTimer = null;
let queue = Promise.resolve();

function scheduleExit() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    if (active === 0) process.exit(0);
  }, IDLE_MS);
}

async function handle({ id, task, payload }) {
  try {
    const handler = TASKS[task];
    if (!handler) throw new Error(`Неизвестная задача ${task}`);
    const result = await handler(payload);
    process.send({ id, ok: true, result });
  } catch (error) {
    process.send({ id, ok: false, error: error instanceof Error ? error.message : String(error) });
  } finally {
    active -= 1;
    scheduleExit();
  }
}

process.on("message", (message) => {
  active += 1;
  clearTimeout(idleTimer);
  queue = queue.then(() => handle(message));
});

process.on("disconnect", () => process.exit(0));
scheduleExit();
