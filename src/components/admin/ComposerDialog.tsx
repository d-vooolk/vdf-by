"use client";

import { useEffect } from "react";

import { CloseIcon } from "@/components/icons";

import { ImageComposer, type ComposedImage, type ComposerProductImage } from "./ImageComposer";

interface ComposerDialogProps {
  initialGenerationId?: string;
  productImages: ComposerProductImage[];
  folder: string;
  onSaved: (image: ComposedImage) => void;
  onClose: () => void;
}

export function ComposerDialog({ initialGenerationId, productImages, folder, onSaved, onClose }: ComposerDialogProps) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-900/50 p-4">
      <div className="flex max-h-[92vh] w-full max-w-7xl flex-col rounded-card bg-brand-50 shadow-xl">
        <div className="flex items-center gap-3 border-b border-brand-100 bg-white p-4">
          <h2 className="text-sm font-bold text-brand-900">Картинка с автомобилем</h2>
          <button type="button" onClick={onClose} className="btn-ghost ml-auto px-2 py-1.5" aria-label="Закрыть">
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          <ImageComposer
            initialGenerationId={initialGenerationId}
            productImages={productImages}
            folder={folder}
            onSaved={onSaved}
          />
        </div>
      </div>
    </div>
  );
}
