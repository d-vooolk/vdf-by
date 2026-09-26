import { getAdmin } from "@/lib/auth";
import { exportXlsx } from "@/lib/vdf-catalog";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!(await getAdmin())) return new Response("Нужно войти заново", { status: 401 });

  const id = Number(new URL(request.url).searchParams.get("export"));
  if (!Number.isInteger(id) || id <= 0) return new Response("Не указана выгрузка", { status: 400 });

  try {
    const file = exportXlsx(id);
    return new Response(Buffer.from(file.data), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="vdf-${id}.xlsx"; filename*=UTF-8''${encodeURIComponent(file.name)}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return new Response((error as Error).message, { status: 404 });
  }
}
