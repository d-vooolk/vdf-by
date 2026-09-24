import { getAdmin } from "@/lib/auth";
import {
  AiError,
  completeStream,
  describeProduct,
  finishRewrite,
  promptFor,
  type AiProductInput,
} from "@/lib/ai";

export const dynamic = "force-dynamic";

function reject(error: string, status: number) {
  return Response.json({ error }, { status });
}

export async function POST(request: Request) {
  if (!(await getAdmin())) return reject("Нужно войти заново", 401);

  const input = (await request.json().catch(() => null)) as AiProductInput | null;
  if (!input || typeof input.title !== "string" || typeof input.description !== "string") {
    return reject("Неверный запрос", 400);
  }
  if (!input.title.trim()) return reject("Сначала заполните название", 400);
  if (!input.description.trim()) {
    return reject("Вставьте исходное описание — переписывать нечего", 400);
  }

  let pieces: AsyncGenerator<string>;
  let first: IteratorResult<string>;
  try {
    pieces = completeStream(promptFor("rewrite", input.prompt), describeProduct(input, false), "rewrite");
    first = await pieces.next();
  } catch (error) {
    if (error instanceof AiError) return reject(error.message, 502);
    console.error("[ai]", error);
    return reject("Не получилось: внутренняя ошибка, подробности в логе сервера", 500);
  }

  const encoder = new TextEncoder();
  const line = (event: Record<string, unknown>) => encoder.encode(`${JSON.stringify(event)}\n`);

  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      let text = "";
      try {
        for (let step = first; !step.done; step = await pieces.next()) {
          text += step.value;
          controller.enqueue(line({ text: step.value }));
        }
        controller.enqueue(line({ done: finishRewrite(text) }));
      } catch (error) {
        if (!(error instanceof AiError)) console.error("[ai]", error);
        controller.enqueue(
          line({
            error:
              error instanceof AiError
                ? error.message
                : "Генерация оборвалась, подробности в логе сервера",
          }),
        );
      } finally {
        controller.close();
      }
    },
    cancel() {
      void pieces.return(undefined);
    },
  });

  return new Response(body, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
