"use client";

import { useContext, useEffect, useRef, useState } from "react";

import {
  UploadQueue,
  UploadTrackerContext,
  type QueueItem,
} from "@/components/admin/ImagePicker";
import { AlertIcon } from "@/components/icons";
import type { ProductVideo } from "@/lib/schema";
import { runPool, sendWithProgress } from "@/lib/upload-client";

const MAX_VIDEO_MB = 500;
const MAX_VIDEOS = 5;
const POSTER_MAX_WIDTH = 1280;
const UPLOAD_SHARE = 0.4;
const POLL_INTERVAL_MS = 1500;

interface VideoReply {
  error?: string;
  src?: string;
  poster?: string;
  job?: string;
}

interface JobReply {
  state?: "queued" | "processing" | "done" | "failed";
  progress?: number;
  src?: string;
  poster?: string;
  w?: number;
  h?: number;
  error?: string;
}

const pause = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

async function waitForJob(
  job: string,
  onProgress: (fraction: number) => void,
): Promise<JobReply> {
  let networkErrors = 0;
  for (;;) {
    await pause(POLL_INTERVAL_MS);
    let reply: JobReply;
    try {
      const response = await fetch(
        `/admin/api/upload/video/?${new URLSearchParams({ job })}`,
        { cache: "no-store" },
      );
      reply = (await response.json()) as JobReply;
      networkErrors = 0;
    } catch (error) {
      networkErrors += 1;
      if (networkErrors >= 10) throw error;
      continue;
    }
    if (reply.state === "done" || reply.state === "failed" || !reply.state) return reply;
    onProgress(reply.progress ?? 0);
  }
}

interface Frame {
  blob: Blob | null;
  w?: number;
  h?: number;
}

function captureFrame(file: File): Promise<Frame> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";

    const finish = (frame: Frame) => {
      URL.revokeObjectURL(url);
      video.removeAttribute("src");
      video.load();
      resolve(frame);
    };

    const timer = window.setTimeout(() => finish({ blob: null }), 15000);

    video.onloadedmetadata = () => {
      const moment = Number.isFinite(video.duration)
        ? Math.min(1, video.duration / 10)
        : 0;
      video.currentTime = moment;
    };
    video.onseeked = () => {
      const w = video.videoWidth;
      const h = video.videoHeight;
      if (!w || !h) {
        window.clearTimeout(timer);
        finish({ blob: null });
        return;
      }
      const scale = Math.min(1, POSTER_MAX_WIDTH / w);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(w * scale);
      canvas.height = Math.round(h * scale);
      canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => {
          window.clearTimeout(timer);
          finish({ blob, w, h });
        },
        "image/jpeg",
        0.85,
      );
    };
    video.onerror = () => {
      window.clearTimeout(timer);
      finish({ blob: null });
    };

    video.src = url;
  });
}

async function withBrowserPoster(
  file: File,
  src: string,
  failures: string[],
): Promise<ProductVideo> {
  const frame = await captureFrame(file);
  const video: ProductVideo = {
    src,
    ...(frame.w && frame.h ? { w: frame.w, h: frame.h } : {}),
  };

  if (!frame.blob) {
    failures.push(`${file.name}: браузер не смог показать кадр — видео загружено без обложки`);
    return video;
  }

  const poster = await sendWithProgress<VideoReply>(
    `/admin/api/upload/video/?${new URLSearchParams({ poster: src })}`,
    frame.blob,
    () => {},
    { "Content-Type": "application/octet-stream" },
  );
  if (poster.data.poster) video.poster = poster.data.poster;
  else failures.push(`${file.name}: обложка не сохранилась`);
  return video;
}

export function VideoPicker({
  value,
  onChange,
  folder,
}: {
  value: ProductVideo[];
  onChange: (value: ProductVideo[]) => void;
  folder: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [problems, setProblems] = useState<string[]>([]);
  const trackUpload = useContext(UploadTrackerContext);

  useEffect(() => {
    if (!uploading || !trackUpload) return;
    trackUpload(1);
    return () => trackUpload(-1);
  }, [uploading, trackUpload]);

  const full = value.length >= MAX_VIDEOS;

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    const failures: string[] = [];
    const picked = Array.from(files)
      .slice(0, MAX_VIDEOS - value.length)
      .filter((file) => {
        if (file.size > MAX_VIDEO_MB * 1024 * 1024) {
          failures.push(`${file.name}: больше ${MAX_VIDEO_MB} МБ`);
          return false;
        }
        return true;
      });

    setProblems(failures);
    if (!picked.length) {
      if (inputRef.current) inputRef.current.value = "";
      return;
    }

    setUploading(true);
    setQueue(
      picked.map((file) => ({
        name: file.name,
        size: file.size,
        loaded: 0,
        stage: "waiting",
        uploadShare: UPLOAD_SHARE,
      })),
    );

    const updateItem = (index: number, changes: Partial<QueueItem>) =>
      setQueue((current) =>
        current.map((item, i) => (i === index ? { ...item, ...changes } : item)),
      );

    const results: Array<ProductVideo | null> = picked.map(() => null);

    await runPool(picked, 1, async (file, index) => {
      updateItem(index, { stage: "sending" });
      try {
        const query = new URLSearchParams({ folder, name: file.name });
        const response = await sendWithProgress<VideoReply>(
          `/admin/api/upload/video/?${query}`,
          file,
          (progress) =>
            updateItem(
              index,
              progress.sent
                ? { loaded: file.size, stage: "processing" }
                : { loaded: Math.min(progress.loaded, file.size) },
            ),
          { "Content-Type": "application/octet-stream" },
        );

        if (response.status >= 400 || (!response.data.src && !response.data.job)) {
          failures.push(
            `${file.name}: ${response.data.error ?? `сервер ответил ${response.status}`}`,
          );
          updateItem(index, { stage: "failed" });
          return;
        }

        let video: ProductVideo;
        if (response.data.job) {
          updateItem(index, { stage: "processing", processed: 0 });
          const job = await waitForJob(response.data.job, (processed) =>
            updateItem(index, { processed }),
          );
          if (job.state !== "done" || !job.src) {
            failures.push(`${file.name}: ${job.error ?? "не удалось перекодировать"}`);
            updateItem(index, { stage: "failed" });
            return;
          }
          video = {
            src: job.src,
            ...(job.poster ? { poster: job.poster } : {}),
            ...(job.w && job.h ? { w: job.w, h: job.h } : {}),
          };
          if (!job.poster) failures.push(`${file.name}: видео загружено без обложки`);
        } else {
          video = await withBrowserPoster(file, response.data.src!, failures);
        }

        results[index] = video;
        updateItem(index, { stage: "done" });
      } catch (error) {
        failures.push(`${file.name}: ${(error as Error).message}`);
        updateItem(index, { stage: "failed" });
      }
    });

    const added = results.filter((video): video is ProductVideo => video !== null);
    if (added.length) onChange([...value, ...added].slice(0, MAX_VIDEOS));
    setProblems(failures);
    setUploading(false);
    setQueue([]);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="label mb-0">Видео</span>
        <span className="tnum text-xs text-brand-300">
          {value.length} / {MAX_VIDEOS}
        </span>
      </div>
      <p className="mb-2 text-xs text-brand-400">
        Любое видео, в том числе mov с айфона, до {MAX_VIDEO_MB} МБ. Сервер
        перекодирует его в mp4 до 1080p и возьмёт обложку из первой секунды.
        На странице товара видео встаёт в галерею после фото.
      </p>

      {value.length > 0 && (
        <ul className="mb-2 flex flex-wrap gap-2">
          {value.map((video, index) => (
            <li
              key={video.src}
              className="group relative h-20 w-32 overflow-hidden rounded-xl border border-brand-100 bg-brand-900"
            >
              {video.poster ? (
                <img
                  src={`/video/${video.poster}`}
                  alt={video.src}
                  title={video.src}
                  className="h-full w-full object-cover"
                />
              ) : (
                <video
                  src={`/video/${video.src}`}
                  preload="metadata"
                  muted
                  className="h-full w-full object-cover"
                />
              )}
              <span className="absolute inset-0 flex items-center justify-center text-2xl text-white/90">
                ▶
              </span>
              <button
                type="button"
                onClick={() => onChange(value.filter((_, i) => i !== index))}
                title="Убрать"
                className="absolute top-0 right-0 bg-red-600/90 px-1 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading || full}
        className="btn-secondary py-2 text-sm"
      >
        {uploading ? "Загружаем видео…" : "Загрузить видео"}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="video/*,.mov,.m4v,.mkv,.avi,.3gp"
        multiple
        hidden
        onChange={(event) => upload(event.target.files)}
      />

      {queue.length > 0 && <UploadQueue items={queue} />}

      {problems.length > 0 && (
        <ul className="mt-2 space-y-1">
          {problems.map((problem) => (
            <li key={problem} className="flex items-start gap-1.5 text-xs text-red-700">
              <AlertIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {problem}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
