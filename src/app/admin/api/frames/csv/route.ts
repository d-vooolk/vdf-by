import { getAdmin } from "@/lib/auth";
import { framesCsv } from "@/lib/frame-import";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!(await getAdmin())) return new Response("Нужно войти заново", { status: 401 });

  const kind = new URL(request.url).searchParams.get("kind") === "frames" ? "frames" : "types";
  const name = kind === "types" ? "ramki-po-tipam" : "ramki-vse";

  return new Response(framesCsv(kind), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
