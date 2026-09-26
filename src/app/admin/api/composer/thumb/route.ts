import { getAdmin } from "@/lib/auth";
import { commonsFetch, isCommonsThumb } from "@/lib/wikimedia";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const admin = await getAdmin();
  if (!admin) return new Response("Нужно войти заново", { status: 401 });

  const url = new URL(request.url).searchParams.get("url") ?? "";
  if (!isCommonsThumb(url)) return new Response("Недопустимый адрес", { status: 400 });

  const upstream = await commonsFetch(url).catch(() => null);
  if (!upstream?.ok) return new Response("Не удалось загрузить превью", { status: 502 });

  return new Response(upstream.body, {
    headers: {
      "Content-Type": upstream.headers.get("Content-Type") ?? "image/jpeg",
      "Cache-Control": "private, max-age=86400",
    },
  });
}
