import { getAdmin } from "@/lib/auth";
import { removeBackground } from "@/lib/ml";

export const dynamic = "force-dynamic";

const MAX_BYTES = 20 * 1024 * 1024;

export async function POST(request: Request) {
  if (!(await getAdmin())) {
    return Response.json({ error: "Нужно войти заново" }, { status: 401 });
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get("image");
  if (!(file instanceof File) || !file.size) {
    return Response.json({ error: "Нет фото" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return Response.json({ error: "Фото больше 20 МБ" }, { status: 400 });
  }

  try {
    const image = await removeBackground(Buffer.from(await file.arrayBuffer()));
    return new Response(new Uint8Array(image), {
      headers: { "Content-Type": "image/png", "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("[cutout]", error);
    return Response.json({ error: `Не удалось убрать фон: ${(error as Error).message}` }, { status: 500 });
  }
}
