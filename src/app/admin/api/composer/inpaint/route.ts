import { getAdmin } from "@/lib/auth";
import { removeWatermark } from "@/lib/ml";

export const dynamic = "force-dynamic";

const MAX_BYTES = 20 * 1024 * 1024;

export async function POST(request: Request) {
  if (!(await getAdmin())) {
    return Response.json({ error: "Нужно войти заново" }, { status: 401 });
  }

  const form = await request.formData().catch(() => null);
  const image = form?.get("image");
  const mask = form?.get("mask");
  if (!(image instanceof File) || !image.size) {
    return Response.json({ error: "Нет фото" }, { status: 400 });
  }
  if (!(mask instanceof File) || !mask.size) {
    return Response.json({ error: "Закрасьте водяной знак кистью" }, { status: 400 });
  }
  if (image.size + mask.size > MAX_BYTES) {
    return Response.json({ error: "Фото больше 20 МБ" }, { status: 400 });
  }

  try {
    const result = await removeWatermark(
      Buffer.from(await image.arrayBuffer()),
      Buffer.from(await mask.arrayBuffer()),
    );
    return new Response(new Uint8Array(result), {
      headers: { "Content-Type": "image/webp", "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("[inpaint]", error);
    return Response.json({ error: `Не удалось убрать водяной знак: ${(error as Error).message}` }, { status: 500 });
  }
}
