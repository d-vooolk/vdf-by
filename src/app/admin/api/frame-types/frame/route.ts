import sharp from "sharp";

import { getAdmin } from "@/lib/auth";
import { parseComposerSettings } from "@/lib/composer";
import { getFrameType, isFrameCategory, readFrameImage, saveFrameComposer } from "@/lib/frame-types";

export const dynamic = "force-dynamic";

const MAX_BYTES = 20 * 1024 * 1024;

function unauthorized() {
  return Response.json({ error: "Нужно войти заново" }, { status: 401 });
}

export async function GET(request: Request) {
  if (!(await getAdmin())) return unauthorized();
  const params = new URL(request.url).searchParams;
  const image = readFrameImage(params.get("category") ?? "", params.get("type") ?? "");
  if (!image) return new Response("Фото рамки не сохранено", { status: 404 });
  return new Response(new Uint8Array(image), {
    headers: { "Content-Type": "image/png", "Cache-Control": "no-store" },
  });
}

export async function POST(request: Request) {
  if (!(await getAdmin())) return unauthorized();

  const form = await request.formData().catch(() => null);
  const categoryId = String(form?.get("categoryId") ?? "");
  const type = String(form?.get("type") ?? "");
  const file = form?.get("image");
  if (!isFrameCategory(categoryId) || !getFrameType(categoryId, type)) {
    return Response.json({ error: "Тип рамки не найден" }, { status: 404 });
  }
  if (!(file instanceof File) || !file.size) {
    return Response.json({ error: "Загрузите фото рамки" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return Response.json({ error: "Фото рамки больше 20 МБ" }, { status: 400 });
  }

  let settings: unknown;
  try {
    settings = JSON.parse(String(form?.get("settings") ?? "{}"));
  } catch {
    return Response.json({ error: "Настройки оформления не прочитались" }, { status: 400 });
  }

  try {
    const image = await sharp(Buffer.from(await file.arrayBuffer())).rotate().png().toBuffer();
    saveFrameComposer(categoryId, type, image, parseComposerSettings(settings));
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: `Фото рамки не сохранилось: ${(error as Error).message}` }, { status: 400 });
  }
}
