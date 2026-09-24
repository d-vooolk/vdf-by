export interface UploadProgress {
  loaded: number;
  total: number;
  sent: boolean;
}

export interface UploadResponse<T> {
  status: number;
  data: T;
}

export function sendWithProgress<T>(
  url: string,
  body: XMLHttpRequestBodyInit,
  onProgress: (progress: UploadProgress) => void,
  headers: Record<string, string> = {},
): Promise<UploadResponse<T>> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", url);
    for (const [name, value] of Object.entries(headers)) {
      request.setRequestHeader(name, value);
    }
    request.responseType = "json";

    request.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      onProgress({ loaded: event.loaded, total: event.total, sent: false });
    };
    request.upload.onload = () => {
      onProgress({ loaded: 1, total: 1, sent: true });
    };
    request.onload = () => {
      resolve({
        status: request.status,
        data: (request.response ?? {}) as T,
      });
    };
    request.onerror = () => reject(new Error("Соединение прервалось"));
    request.ontimeout = () => reject(new Error("Сервер не ответил вовремя"));

    request.send(body);
  });
}

export async function runPool<T>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<void>,
): Promise<void> {
  let next = 0;
  const lanes = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      await worker(items[index], index);
    }
  });
  await Promise.all(lanes);
}
