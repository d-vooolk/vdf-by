import fsp from "node:fs/promises";
import path from "node:path";

import { getAdmin } from "@/lib/auth";
import { largestVariantUrl } from "@/lib/image-types";
import { getImage } from "@/lib/images";

export const dynamic = "force-dynamic";

const TYPES: Record<string, string> = {
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".jpg": "image/jpeg",
  ".png": "image/png",
};

export async function GET(request: Request) {
  if (!(await getAdmin())) return new Response("Нужно войти заново", { status: 401 });

  const url = largestVariantUrl(getImage(new URL(request.url).searchParams.get("path") ?? ""));
  if (!url) return new Response("Фото не найдено", { status: 404 });

  const file = path.join(/*turbopackIgnore: true*/ process.cwd(), "public", url.replace(/^\//, ""));
  const data = await fsp.readFile(file).catch(() => null);
  if (!data) return new Response("Файл фото не найден", { status: 404 });

  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": TYPES[path.extname(file)] ?? "application/octet-stream",
      "Cache-Control": "private, max-age=300",
    },
  });
}
