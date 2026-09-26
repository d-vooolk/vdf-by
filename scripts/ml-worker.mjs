#!/usr/bin/env node
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

import ort from "onnxruntime-node";
import sharp from "sharp";

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
};

const CUTOUT_SIZE = 1024;
const PLATES_SIZE = 640;
const PLATE_SCORE = 0.4;
const ALPHA_LOW = 0.3;
const ALPHA_HIGH = 0.88;

const SESSION_OPTIONS = {
  intraOpNumThreads: 2,
  interOpNumThreads: 1,
  enableCpuMemArena: false,
  enableMemPattern: false,
  executionMode: "sequential",
};

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

async function session(name) {
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

const TASKS = { cutout, plates };

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

function scheduleExit() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    if (active === 0) process.exit(0);
  }, IDLE_MS);
}

process.on("message", async (message) => {
  const { id, task, image } = message;
  active += 1;
  clearTimeout(idleTimer);
  try {
    const handler = TASKS[task];
    if (!handler) throw new Error(`Неизвестная задача ${task}`);
    const result = await handler(Buffer.from(image));
    process.send({ id, ok: true, result });
  } catch (error) {
    process.send({ id, ok: false, error: error instanceof Error ? error.message : String(error) });
  } finally {
    active -= 1;
    scheduleExit();
  }
});

process.on("disconnect", () => process.exit(0));
scheduleExit();
