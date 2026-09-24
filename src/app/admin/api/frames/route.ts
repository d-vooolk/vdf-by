import { AiError, aiConfigured } from "@/lib/ai";
import { getAdmin } from "@/lib/auth";
import {
  discoverStep,
  frameSummary,
  importNextFrame,
  readStep,
  rematchFrames,
  releaseStuck,
  retryFailed,
} from "@/lib/frame-import";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

interface FramesRequest {
  action?: unknown;
  categoryId?: unknown;
}

function categoryName(categoryId: string): string | null {
  const row = getDb()
    .prepare(
      `SELECT name FROM categories
        WHERE id = ? AND COALESCE(json_extract(data, '$.carFitment'), 0) = 1`,
    )
    .get(categoryId) as { name: string } | undefined;
  return row?.name ?? null;
}

export async function POST(request: Request) {
  if (!(await getAdmin())) return Response.json({ error: "Нужно войти заново" }, { status: 401 });

  const input = ((await request.json().catch(() => null)) ?? {}) as FramesRequest;
  const action = typeof input.action === "string" ? input.action : "";

  try {
    switch (action) {
      case "summary":
        return Response.json({ summary: frameSummary() });
      case "discover":
        return Response.json(await discoverStep());
      case "read":
        return Response.json(await readStep());
      case "rematch":
        return Response.json({ rematch: rematchFrames(), summary: frameSummary() });
      case "retry":
        return Response.json({ retried: retryFailed(), summary: frameSummary() });
      case "release":
        releaseStuck();
        return Response.json({ summary: frameSummary() });
      case "import": {
        if (!aiConfigured()) {
          return Response.json({ error: "Нейросеть не подключена: нет AI_API_KEY" }, { status: 400 });
        }
        const categoryId = typeof input.categoryId === "string" ? input.categoryId : "";
        const name = categoryName(categoryId);
        if (!name) {
          return Response.json(
            { error: "Выберите раздел с подбором по автомобилю" },
            { status: 400 },
          );
        }
        const outcome = await importNextFrame(categoryId, name);
        return Response.json({ outcome, summary: frameSummary() });
      }
      default:
        return Response.json({ error: "Неизвестное действие" }, { status: 400 });
    }
  } catch (error) {
    if (!(error instanceof AiError)) console.error("[frames]", error);
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
}
