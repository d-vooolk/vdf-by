import { getAdmin } from "@/lib/auth";
import { commonsQueries, getGenerationInfo } from "@/lib/car-photos";
import { searchCommons } from "@/lib/wikimedia";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const admin = await getAdmin();
  if (!admin) return Response.json({ error: "Нужно войти заново" }, { status: 401 });

  const params = new URL(request.url).searchParams;
  const info = getGenerationInfo(params.get("generation") ?? "");
  if (!info) return Response.json({ error: "Поколение не найдено" }, { status: 404 });

  const custom = (params.get("q") ?? "").trim();
  const queries = custom ? [custom] : commonsQueries(info);

  try {
    const candidates = await searchCommons(queries);
    return Response.json({
      query: queries[0],
      candidates: candidates.map((candidate) => ({
        ...candidate,
        thumb: `/admin/api/composer/thumb/?url=${encodeURIComponent(candidate.thumb)}`,
      })),
    });
  } catch (error) {
    return Response.json(
      { error: `Поиск на Wikimedia не удался: ${(error as Error).message}` },
      { status: 502 },
    );
  }
}
