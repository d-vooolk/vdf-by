import { getAdmin } from "@/lib/auth";
import { AiError, aiConfigured } from "@/lib/ai";
import { categoryPaths, invalidateCatalog } from "@/lib/catalog";
import { copyQueue, recordCopy, writeProductCopy } from "@/lib/product-copy";
import { revalidateProduct } from "@/lib/revalidate";
import { getCategoryRaw, getProductRaw, setProductDescription } from "@/lib/store";

export const dynamic = "force-dynamic";

const PING_MS = 15000;

function reject(error: string, status: number) {
  return Response.json({ error }, { status });
}

export async function POST(request: Request) {
  if (!(await getAdmin())) return reject("Нужно войти заново", 401);
  if (!aiConfigured()) return reject("Нейросеть не подключена: нет AI_API_KEY в .env", 400);

  const body = (await request.json().catch(() => null)) as { skip?: unknown } | null;
  const skip = new Set(
    Array.isArray(body?.skip) ? body.skip.filter((id): id is string => typeof id === "string") : [],
  );
  const queue = copyQueue(skip);
  const nextId = queue.ids[0];
  if (!nextId) return Response.json({ left: 0, done: queue.done, total: queue.total });

  const product = getProductRaw(nextId);
  if (!product) return Response.json({ failed: nextId, error: "Товар не найден", left: queue.ids.length - 1 });

  const encoder = new TextEncoder();
  const line = (event: Record<string, unknown>) => encoder.encode(`${JSON.stringify(event)}\n`);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const ping = setInterval(() => controller.enqueue(line({ ping: true })), PING_MS);
      controller.enqueue(
        line({ product: { id: product.id, title: product.title }, left: queue.ids.length, done: queue.done, total: queue.total }),
      );
      try {
        const result = await writeProductCopy({
          title: product.title,
          description: product.description ?? "",
          categoryName: getCategoryRaw(product.categoryId)?.name,
          brand: product.brand,
          specs: product.specs,
          options: product.optionGroups.map(
            (group) => `${group.name}: ${group.values.map((value) => value.label).join(", ")}`,
          ),
        });
        const saved = setProductDescription(product.id, result.text);
        if (!saved.ok) throw new AiError(saved.problems.join(" "));
        recordCopy(product.id, result);
        invalidateCatalog();
        revalidateProduct(product.slug, categoryPaths(product.categoryId));
        controller.enqueue(
          line({ saved: { id: product.id, score: result.score, reviews: result.reviews }, left: queue.ids.length - 1 }),
        );
      } catch (error) {
        if (!(error instanceof AiError)) console.error("[ai-copy]", error);
        controller.enqueue(
          line({
            failed: product.id,
            error: error instanceof AiError ? error.message : "внутренняя ошибка, подробности в логе",
            left: queue.ids.length - 1,
          }),
        );
      } finally {
        clearInterval(ping);
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
