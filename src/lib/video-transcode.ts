import { spawn } from "node:child_process";
import os from "node:os";

import sharp from "sharp";

const MAX_SIDE = 1920;
const POSTER_WIDTH = 1280;
const TRANSCODE_TIMEOUT_MS = 30 * 60 * 1000;

export class FfmpegMissingError extends Error {
  constructor() {
    super("На сервере не установлен ffmpeg");
  }
}

export interface VideoInfo {
  duration: number;
  hdr: boolean;
  hasVideo: boolean;
}

export interface Poster {
  jpeg: Buffer;
  w: number;
  h: number;
}

const ffmpegBinary = () => process.env.FFMPEG_PATH?.trim() || "ffmpeg";

interface RunResult {
  code: number | null;
  stdout: Buffer;
  stderr: string;
}

function runFfmpeg(
  args: string[],
  options: { onStdoutLine?: (line: string) => void; lowPriority?: boolean; timeoutMs?: number } = {},
): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegBinary(), args, { stdio: ["ignore", "pipe", "pipe"] });
    const stdout: Buffer[] = [];
    let stderr = "";
    let pending = "";

    if (options.lowPriority && child.pid) {
      try {
        os.setPriority(child.pid, 15);
      } catch {}
    }

    const timer = options.timeoutMs
      ? setTimeout(() => child.kill("SIGKILL"), options.timeoutMs)
      : null;

    child.stdout.on("data", (chunk: Buffer) => {
      if (!options.onStdoutLine) {
        stdout.push(chunk);
        return;
      }
      pending += chunk.toString("latin1");
      const lines = pending.split("\n");
      pending = lines.pop() ?? "";
      for (const line of lines) options.onStdoutLine(line.trim());
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr = (stderr + chunk.toString("utf8")).slice(-20000);
    });
    child.on("error", (error: NodeJS.ErrnoException) => {
      if (timer) clearTimeout(timer);
      reject(error.code === "ENOENT" ? new FfmpegMissingError() : error);
    });
    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      resolve({ code, stdout: Buffer.concat(stdout), stderr });
    });
  });
}

let availability: Promise<boolean> | null = null;

export function ffmpegAvailable(): Promise<boolean> {
  availability ??= runFfmpeg(["-hide_banner", "-version"])
    .then((result) => result.code === 0)
    .catch(() => false)
    .then((available) => {
      if (!available) availability = null;
      return available;
    });
  return availability;
}

export async function probeVideo(file: string): Promise<VideoInfo> {
  const { stderr } = await runFfmpeg(["-hide_banner", "-nostdin", "-i", file]);
  const duration = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  const videoLine = stderr.split("\n").find((line) => /Stream #.*Video:/.test(line)) ?? "";
  return {
    duration: duration
      ? Number(duration[1]) * 3600 + Number(duration[2]) * 60 + Number(duration[3])
      : 0,
    hdr: /arib-std-b67|smpte2084|bt2020/.test(videoLine),
    hasVideo: videoLine !== "",
  };
}

const scaleFilter =
  `scale='trunc(min(1,${MAX_SIDE}/max(iw,ih))*iw/2)*2':'trunc(min(1,${MAX_SIDE}/max(iw,ih))*ih/2)*2'`;

const toneMapFilter = [
  "zscale=t=linear:npl=100",
  "format=gbrpf32le",
  "zscale=p=bt709",
  "tonemap=tonemap=hable:desat=0",
  "zscale=t=bt709:m=bt709:r=tv",
].join(",");

function transcodeArgs(input: string, output: string, toneMap: boolean): string[] {
  const filters = [scaleFilter, ...(toneMap ? [toneMapFilter] : []), "format=yuv420p"];
  return [
    "-hide_banner",
    "-nostdin",
    "-y",
    "-i", input,
    "-map", "0:v:0",
    "-map", "0:a:0?",
    "-map_metadata", "-1",
    "-vf", filters.join(","),
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-crf", "23",
    "-profile:v", "high",
    ...(toneMap
      ? ["-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709"]
      : []),
    "-c:a", "aac",
    "-b:a", "128k",
    "-ac", "2",
    "-threads", "2",
    "-movflags", "+faststart",
    "-f", "mp4",
    "-progress", "pipe:1",
    "-nostats",
    output,
  ];
}

function shortError(stderr: string): string {
  const lines = stderr
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.slice(-3).join(" / ") || "ffmpeg завершился с ошибкой";
}

export async function transcodeVideo(
  input: string,
  output: string,
  info: VideoInfo,
  onProgress: (fraction: number) => void,
): Promise<void> {
  const attempt = (toneMap: boolean) =>
    runFfmpeg(transcodeArgs(input, output, toneMap), {
      lowPriority: true,
      timeoutMs: TRANSCODE_TIMEOUT_MS,
      onStdoutLine: (line) => {
        const match = line.match(/^out_time_(?:us|ms)=(\d+)/);
        if (match && info.duration > 0) {
          onProgress(Math.min(1, Number(match[1]) / 1e6 / info.duration));
        }
      },
    });

  let result = await attempt(info.hdr);
  if (result.code !== 0 && info.hdr) result = await attempt(false);
  if (result.code !== 0) throw new Error(shortError(result.stderr));
}

export async function extractPoster(file: string, duration: number): Promise<Poster | null> {
  const moment = duration > 0 ? Math.min(1, duration / 10) : 0;
  const { code, stdout } = await runFfmpeg([
    "-hide_banner",
    "-nostdin",
    "-ss", moment.toFixed(2),
    "-i", file,
    "-frames:v", "1",
    "-f", "image2pipe",
    "-c:v", "png",
    "pipe:1",
  ]);
  if (code !== 0 || !stdout.length) return null;

  const frame = sharp(stdout);
  const meta = await frame.metadata();
  if (!meta.width || !meta.height) return null;
  const jpeg = await frame
    .resize({ width: POSTER_WIDTH, withoutEnlargement: true })
    .jpeg({ quality: 80, mozjpeg: true })
    .toBuffer();
  return { jpeg, w: meta.width, h: meta.height };
}
