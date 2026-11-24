"use client";

import { useState } from "react";

import { CloseIcon, TrashIcon } from "@/components/icons";

import { fileUrl } from "./api";
import type { WikiMedia } from "./types";

export function WikiMediaGrid({ media, onRemove }: { media: WikiMedia[]; onRemove?: (id: string) => void }) {
  const [open, setOpen] = useState<WikiMedia | null>(null);
  const photos = media.filter((item) => item.type === "PHOTO");
  const videos = media.filter((item) => item.type === "VIDEO");

  return (
    <>
      {photos.length > 0 && (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5">
          {photos.map((item) => (
            <div key={item.id} className="group relative">
              <button
                type="button"
                onClick={() => setOpen(item)}
                className="photo-bed block aspect-square w-full overflow-hidden rounded-control"
              >
                <img
                  src={fileUrl(item.thumbUrl ?? item.mediumUrl ?? item.url) ?? ""}
                  alt={item.originalName}
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
              </button>
              {onRemove && (
                <button
                  type="button"
                  onClick={() => onRemove(item.id)}
                  className="absolute top-1 right-1 rounded-full bg-white/90 p-1.5 text-red-600 shadow"
                  aria-label="Удалить фото"
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {videos.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {videos.map((item) => (
            <div key={item.id} className="relative">
              <video
                src={fileUrl(item.url) ?? ""}
                controls
                preload="metadata"
                playsInline
                className="aspect-video w-full rounded-control bg-black"
              />
              {onRemove && (
                <button
                  type="button"
                  onClick={() => onRemove(item.id)}
                  className="absolute top-2 right-2 rounded-full bg-white/90 p-1.5 text-red-600 shadow"
                  aria-label="Удалить видео"
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4"
          onClick={() => setOpen(null)}
        >
          <img
            src={fileUrl(open.url) ?? ""}
            alt={open.originalName}
            className="max-h-full max-w-full object-contain"
          />
          <button
            type="button"
            onClick={() => setOpen(null)}
            className="absolute top-4 right-4 rounded-full bg-white/90 p-2 text-brand-900"
            aria-label="Закрыть"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>
      )}
    </>
  );
}
