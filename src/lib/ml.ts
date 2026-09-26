import { fork, type ChildProcess } from "node:child_process";
import path from "node:path";

import sharp from "sharp";

const TASK_TIMEOUT_MS = 10 * 60 * 1000;
const PLATE_MARGIN = 0.18;

export interface PlateBox {
  left: number;
  top: number;
  width: number;
  height: number;
  score: number;
}

interface Pending {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

interface WorkerReply {
  id: number;
  ok: boolean;
  result?: unknown;
  error?: string;
}

const state = globalThis as unknown as {
  __mlWorker?: ChildProcess | null;
  __mlPending?: Map<number, Pending>;
  __mlNextId?: number;
};

function pending(): Map<number, Pending> {
  state.__mlPending ??= new Map();
  return state.__mlPending;
}

function failAll(reason: string) {
  for (const [id, entry] of pending()) {
    clearTimeout(entry.timer);
    entry.reject(new Error(reason));
    pending().delete(id);
  }
}

function worker(): ChildProcess {
  const current = state.__mlWorker;
  if (current && current.connected) return current;

  const script = path.join(/*turbopackIgnore: true*/ process.cwd(), "scripts", "ml-worker.mjs");
  const child = fork(script, [], {
    serialization: "advanced",
    stdio: ["ignore", "inherit", "inherit", "ipc"],
  });

  child.on("message", (message: WorkerReply) => {
    const entry = pending().get(message.id);
    if (!entry) return;
    clearTimeout(entry.timer);
    pending().delete(message.id);
    if (message.ok) entry.resolve(message.result);
    else entry.reject(new Error(message.error ?? "Нейросеть вернула ошибку"));
  });

  child.on("exit", (code) => {
    if (state.__mlWorker === child) state.__mlWorker = null;
    failAll(code ? `Процесс нейросети завершился с кодом ${code}` : "Процесс нейросети завершился");
  });

  child.on("error", (error) => {
    if (state.__mlWorker === child) state.__mlWorker = null;
    failAll(`Не удалось запустить нейросеть: ${error.message}`);
  });

  state.__mlWorker = child;
  return child;
}

function run<T>(task: "cutout" | "plates", image: Buffer): Promise<T> {
  const id = (state.__mlNextId = (state.__mlNextId ?? 0) + 1);
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      pending().delete(id);
      reject(new Error("Нейросеть не ответила за 10 минут"));
    }, TASK_TIMEOUT_MS);
    pending().set(id, { resolve: resolve as (value: unknown) => void, reject, timer });
    worker().send({ id, task, image: new Uint8Array(image) });
  });
}

async function upright(image: Buffer): Promise<Buffer> {
  return sharp(image).rotate().toColourspace("srgb").png().toBuffer();
}

export async function removeBackground(image: Buffer): Promise<Buffer> {
  const result = await run<Uint8Array>("cutout", await upright(image));
  return Buffer.from(result);
}

export async function findPlates(image: Buffer): Promise<PlateBox[]> {
  return run<PlateBox[]>("plates", await upright(image));
}

export interface BlurRegion {
  left: number;
  top: number;
  width: number;
  height: number;
}

export async function blurRegions(image: Buffer, regions: BlurRegion[]): Promise<Buffer> {
  const source = await upright(image);
  if (!regions.length) return source;

  const { width = 0, height = 0 } = await sharp(source).metadata();
  const patches = await Promise.all(
    regions.map(async (region) => {
      const marginX = Math.round(region.width * PLATE_MARGIN);
      const marginY = Math.round(region.height * PLATE_MARGIN);
      const left = Math.max(0, Math.round(region.left) - marginX);
      const top = Math.max(0, Math.round(region.top) - marginY);
      const right = Math.min(width, Math.round(region.left + region.width) + marginX);
      const bottom = Math.min(height, Math.round(region.top + region.height) + marginY);
      const patchWidth = right - left;
      const patchHeight = bottom - top;
      if (patchWidth < 2 || patchHeight < 2) return null;

      const tiny = Math.max(2, Math.round(patchWidth / 24));
      const input = await sharp(source)
        .extract({ left, top, width: patchWidth, height: patchHeight })
        .resize(tiny, Math.max(1, Math.round((tiny * patchHeight) / patchWidth)), { fit: "fill" })
        .resize(patchWidth, patchHeight, { fit: "fill", kernel: "cubic" })
        .blur(Math.max(2, patchHeight / 6))
        .png()
        .toBuffer();
      return { input, left, top };
    }),
  );

  return sharp(source)
    .composite(patches.filter((patch): patch is NonNullable<typeof patch> => patch !== null))
    .png()
    .toBuffer();
}

export async function blurPlates(image: Buffer): Promise<{ image: Buffer; count: number }> {
  const boxes = await findPlates(image);
  return { image: await blurRegions(image, boxes), count: boxes.length };
}
