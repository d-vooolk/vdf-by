import type { WikiCarKey } from "./types";

const BASE = "/api/account/wiki";
const CRM_UPLOADS = "/api/uploads/wiki/";

export class WikiRequestError extends Error {}

export async function wikiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${BASE}${path}`, {
      ...init,
      headers: init?.body && !(init.body instanceof FormData) ? { "Content-Type": "application/json" } : undefined,
    });
  } catch {
    throw new WikiRequestError("Нет связи — проверьте интернет");
  }
  const data = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new WikiRequestError(data.error ?? "Что-то пошло не так — попробуйте ещё раз");
  return data;
}

export function carQuery(key: WikiCarKey): string {
  return new URLSearchParams({ markId: key.markId, modelId: key.modelId, generationId: key.generationId }).toString();
}

export function fileUrl(url: string | null): string | null {
  if (!url) return null;
  return url.startsWith(CRM_UPLOADS) ? `${BASE}/file/${url.slice(CRM_UPLOADS.length)}` : url;
}

export function carTitle(car: { markName: string; modelName: string; generationName: string | null }): string {
  return [car.markName, car.modelName, car.generationName].filter(Boolean).join(" ");
}

export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : "Что-то пошло не так — попробуйте ещё раз";
}

export function uploadFile(
  key: WikiCarKey,
  sectionId: string | null,
  file: File,
  onProgress: (percent: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append("markId", key.markId);
    form.append("modelId", key.modelId);
    form.append("generationId", key.generationId);
    if (sectionId) form.append("sectionId", sectionId);
    form.append("file", file);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${BASE}/media/`);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
        return;
      }
      let message = "Не удалось загрузить файл";
      try {
        message = (JSON.parse(xhr.responseText) as { error?: string }).error ?? message;
      } catch {
        if (xhr.status === 413) message = "Файл слишком большой";
      }
      reject(new WikiRequestError(message));
    };
    xhr.onerror = () => reject(new WikiRequestError("Нет связи — проверьте интернет"));
    xhr.send(form);
  });
}
