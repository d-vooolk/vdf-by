import { randomUUID } from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";

import sharp from "sharp";

import { getAdmin } from "@/lib/auth";
import { safeImagePath } from "@/lib/image-pipeline.mjs";
import {
  extractPoster,
  ffmpegAvailable,
  FfmpegMissingError,
  probeVideo,
  transcodeVideo,
} from "@/lib/video-transcode";

export const dynamic = "force-dynamic";

const MAX_VIDEO_BYTES = 500 * 1024 * 1024;
const MAX_POSTER_BYTES = 8 * 1024 * 1024;
const POSTER_WIDTH = 1280;
const PLAYABLE_EXTENSIONS = new Set(["mp4", "webm"]);
const TRANSCODABLE_EXTENSIONS = new Set(["mp4", "webm", "mov", "m4v", "mkv", "avi", "3gp"]);
const JOB_TTL_MS = 60 * 60 * 1000;

const videoRoot = () => path.join(process.cwd(), "public", "video");
const incomingRoot = () => path.join(process.cwd(), "var", "video-incoming");

type Job =
  | { state: "queued" | "processing"; progress: number; updatedAt: number }
  | { state: "done"; src: string; poster?: string; w?: number; h?: number; updatedAt: number }
  | { state: "failed"; error: string; updatedAt: number };

interface JobRegistry {
  jobs: Map<string, Job>;
  tail: Promise<void>;
}

const registry: JobRegistry = ((globalThis as { __videoJobs?: JobRegistry }).__videoJobs ??= {
  jobs: new Map(),
  tail: Promise.resolve(),
});

function forgetOldJobs() {
  const now = Date.now();
  for (const [id, job] of registry.jobs) {
    if (now - job.updatedAt > JOB_TTL_MS && (job.state === "done" || job.state === "failed")) {
      registry.jobs.delete(id);
    }
  }
}

function looksLikeVideo(head: Buffer, extension: string): boolean {
  if (extension === "webm" || extension === "mkv") {
    return head.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
  }
  if (extension === "avi") {
    return head.subarray(0, 4).toString("latin1") === "RIFF";
  }
  const box = head.subarray(4, 8).toString("latin1");
  return ["ftyp", "moov", "mdat", "wide", "free", "skip"].includes(box);
}

function sourceExtension(filename: string): string {
  return path.extname(filename).slice(1).toLowerCase();
}

function targetPath(folder: string, filename: string, extension: string): string {
  const asImage = safeImagePath(folder, `${path.basename(filename, path.extname(filename))}.jpg`);
  return `${asImage.slice(0, -".jpg".length)}.${extension}`;
}

async function exists(file: string): Promise<boolean> {
  return fsp
    .access(file)
    .then(() => true)
    .catch(() => false);
}

const reserved = new Set<string>();

async function freeName(relative: string): Promise<string> {
  const extension = path.extname(relative);
  const base = relative.slice(0, -extension.length);
  let candidate = relative;
  let counter = 2;
  while (
    reserved.has(candidate) ||
    (await exists(path.join(/*turbopackIgnore: true*/ videoRoot(), candidate))) ||
    (await exists(path.join(/*turbopackIgnore: true*/ videoRoot(), `${candidate.slice(0, -extension.length)}.jpg`)))
  ) {
    candidate = `${base}-${counter}${extension}`;
    counter += 1;
  }
  reserved.add(candidate);
  return candidate;
}

async function readLimited(
  body: ReadableStream<Uint8Array>,
  limit: number,
  onChunk: (chunk: Buffer) => Promise<void>,
): Promise<boolean> {
  let size = 0;
  for await (const piece of body as unknown as AsyncIterable<Uint8Array>) {
    size += piece.byteLength;
    if (size > limit) return false;
    await onChunk(Buffer.from(piece));
  }
  return size > 0;
}

async function receive(
  body: ReadableStream<Uint8Array>,
  destination: string,
): Promise<{ complete: boolean; head: Buffer }> {
  await fsp.mkdir(path.dirname(destination), { recursive: true });
  const out = fs.createWriteStream(destination);
  const write = (chunk: Buffer) =>
    new Promise<void>((resolve, reject) =>
      out.write(chunk, (error) => (error ? reject(error) : resolve())),
    );
  let head = Buffer.alloc(0);

  try {
    const complete = await readLimited(body, MAX_VIDEO_BYTES, async (chunk) => {
      if (head.length < 16) head = Buffer.concat([head, chunk]).subarray(0, 16);
      await write(chunk);
    });
    await new Promise<void>((resolve, reject) =>
      out.end((error?: Error | null) => (error ? reject(error) : resolve())),
    );
    return { complete, head };
  } catch (error) {
    out.destroy();
    throw error;
  }
}

export async function GET(request: Request) {
  const admin = await getAdmin();
  if (!admin) {
    return Response.json({ error: "Нужно войти заново" }, { status: 401 });
  }
  const id = new URL(request.url).searchParams.get("job") ?? "";
  const job = registry.jobs.get(id);
  if (!job) {
    return Response.json(
      { state: "failed", error: "Задача перекодирования не найдена — возможно, сервер перезапускался" },
      { status: 404 },
    );
  }
  return Response.json(job);
}

export async function POST(request: Request) {
  const admin = await getAdmin();
  if (!admin) {
    return Response.json({ error: "Нужно войти заново" }, { status: 401 });
  }
  if (!request.body) {
    return Response.json({ error: "Файл не пришёл" }, { status: 400 });
  }

  const url = new URL(request.url);
  const posterFor = url.searchParams.get("poster");
  if (posterFor !== null) return savePoster(posterFor, request.body);

  const folder = url.searchParams.get("folder") ?? "";
  const name = url.searchParams.get("name") ?? "";
  const extension = sourceExtension(name);
  const canTranscode = await ffmpegAvailable();

  if (!TRANSCODABLE_EXTENSIONS.has(extension)) {
    return Response.json(
      { error: "Поддерживаются видео mp4, mov, webm, m4v, mkv, avi, 3gp" },
      { status: 400 },
    );
  }
  if (!canTranscode && !PLAYABLE_EXTENSIONS.has(extension)) {
    return Response.json(
      {
        error:
          "Видео с айфона (mov) сервер перекодирует через ffmpeg, а он не установлен. Установите ffmpeg на сервер или загрузите mp4",
      },
      { status: 400 },
    );
  }

  const incoming = path.join(
    /*turbopackIgnore: true*/ incomingRoot(),
    `${randomUUID()}.${extension}`,
  );

  try {
    const { complete, head } = await receive(request.body, incoming);
    if (!complete) {
      await fsp.rm(incoming, { force: true });
      return Response.json(
        { error: `Видео больше ${MAX_VIDEO_BYTES / 1024 / 1024} МБ или пустое` },
        { status: 413 },
      );
    }
    if (!looksLikeVideo(head, extension)) {
      await fsp.rm(incoming, { force: true });
      return Response.json({ error: "Файл не похож на видео" }, { status: 400 });
    }
  } catch (error) {
    await fsp.rm(incoming, { force: true });
    console.error("[upload-video]", name, error);
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }

  if (!canTranscode) {
    const target = await freeName(targetPath(folder, name, extension));
    try {
      const finalPath = path.join(/*turbopackIgnore: true*/ videoRoot(), target);
      await fsp.mkdir(path.dirname(finalPath), { recursive: true });
      await fsp.rename(incoming, finalPath);
    } catch (error) {
      await fsp.rm(incoming, { force: true });
      console.error("[upload-video]", target, error);
      return Response.json({ error: (error as Error).message }, { status: 500 });
    } finally {
      reserved.delete(target);
    }
    return Response.json({ ok: true, src: target });
  }

  forgetOldJobs();
  const id = randomUUID();
  const target = await freeName(targetPath(folder, name, "mp4"));
  registry.jobs.set(id, { state: "queued", progress: 0, updatedAt: Date.now() });

  const run = () => processUpload(id, incoming, target);
  registry.tail = registry.tail.then(run, run);

  return Response.json({ ok: true, job: id }, { status: 202 });
}

async function processUpload(id: string, incoming: string, target: string) {
  const finalPath = path.join(/*turbopackIgnore: true*/ videoRoot(), target);
  const partialPath = `${finalPath}.part`;
  const setJob = (job: Job) => registry.jobs.set(id, job);

  try {
    setJob({ state: "processing", progress: 0, updatedAt: Date.now() });
    const info = await probeVideo(incoming);
    if (!info.hasVideo) throw new Error("в файле нет видеодорожки");

    await fsp.mkdir(path.dirname(finalPath), { recursive: true });
    await transcodeVideo(incoming, partialPath, info, (progress) =>
      setJob({ state: "processing", progress, updatedAt: Date.now() }),
    );
    await fsp.rename(partialPath, finalPath);

    const poster = await extractPoster(finalPath, info.duration).catch(() => null);
    const posterName = target.replace(/\.mp4$/, ".jpg");
    if (poster) {
      await fsp.writeFile(path.join(/*turbopackIgnore: true*/ videoRoot(), posterName), poster.jpeg);
    }

    setJob({
      state: "done",
      src: target,
      ...(poster ? { poster: posterName, w: poster.w, h: poster.h } : {}),
      updatedAt: Date.now(),
    });
  } catch (error) {
    await fsp.rm(partialPath, { force: true });
    console.error("[upload-video]", target, error);
    setJob({
      state: "failed",
      error:
        error instanceof FfmpegMissingError
          ? error.message
          : `не удалось перекодировать: ${(error as Error).message}`,
      updatedAt: Date.now(),
    });
  } finally {
    reserved.delete(target);
    await fsp.rm(incoming, { force: true });
  }
}

async function savePoster(videoSrc: string, body: ReadableStream<Uint8Array>) {
  const normalized = videoSrc.replace(/\\/g, "/");
  if (!/^[a-z0-9._/-]+\.(mp4|webm)$/.test(normalized) || normalized.includes("..")) {
    return Response.json({ error: "Неверный путь к видео" }, { status: 400 });
  }
  if (!(await exists(path.join(/*turbopackIgnore: true*/ videoRoot(), normalized)))) {
    return Response.json({ error: "Видео не найдено" }, { status: 404 });
  }

  const chunks: Buffer[] = [];
  const complete = await readLimited(body, MAX_POSTER_BYTES, async (chunk) => {
    chunks.push(chunk);
  });
  if (!complete) {
    return Response.json({ error: "Обложка слишком большая" }, { status: 413 });
  }

  const poster = normalized.replace(/\.(mp4|webm)$/, ".jpg");
  try {
    await sharp(Buffer.concat(chunks), { failOn: "error" })
      .resize({ width: POSTER_WIDTH, withoutEnlargement: true })
      .jpeg({ quality: 80, mozjpeg: true })
      .toFile(path.join(/*turbopackIgnore: true*/ videoRoot(), poster));
  } catch (error) {
    return Response.json(
      { error: `Обложка не сохранилась: ${(error as Error).message}` },
      { status: 400 },
    );
  }

  return Response.json({ ok: true, poster });
}
