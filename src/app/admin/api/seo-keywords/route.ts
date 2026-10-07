import { getAdmin } from "@/lib/auth";
import { keywordsCsv, readKeywords } from "@/lib/seo-keywords";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await getAdmin())) return new Response("Нужно войти заново", { status: 401 });
  return new Response(keywordsCsv(readKeywords(), "https://vdf.by"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="vdf-keywords.csv"',
    },
  });
}
