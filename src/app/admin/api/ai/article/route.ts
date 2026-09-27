import { getAdmin } from "@/lib/auth";
import { AiError, completeStream, promptFor } from "@/lib/ai";
import {
  describeArticleRequest,
  parseGeneratedArticle,
  pickCandidates,
  slugForTitle,
  type ArticleRequest,
  type GeneratedArticle,
} from "@/lib/article-ai";
import { attachProductPhotos } from "@/lib/article-photos";
import {
  ARTICLE_REVIEW_PROMPT,
  articleAiOptions,
  describeReview,
  parseReview,
  type ArticleReview,
} from "@/lib/article-review";

export const dynamic = "force-dynamic";

const MAX_TOPIC = 500;
const MAX_NOTES = 4000;
const MAX_BODY = 200000;
const PING_MS = 15000;

type Phase = "draft" | "review";

function reject(error: string, status: number) {
  return Response.json({ error }, { status });
}

function text(value: unknown, limit: number): string {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

function existingArticle(value: unknown): GeneratedArticle | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Record<string, unknown>;
  const body = text(source.body, MAX_BODY);
  const title = text(source.title, 200);
  if (!body || !title) return null;
  const faq = Array.isArray(source.faq)
    ? source.faq
        .map((item) => ({
          q: text((item as { q?: unknown })?.q, 500),
          a: text((item as { a?: unknown })?.a, 2000),
        }))
        .filter((item) => item.q && item.a)
    : [];
  return {
    title,
    body,
    excerpt: text(source.excerpt, 600) || undefined,
    seoTitle: text(source.seoTitle, 120) || undefined,
    seoDescription: text(source.seoDescription, 300) || undefined,
    faq,
  };
}

export async function POST(request: Request) {
  if (!(await getAdmin())) return reject("Нужно войти заново", 401);

  const payload = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!payload) return reject("Неверный запрос", 400);

  const mode = payload.mode === "review" ? "review" : "write";
  const input: ArticleRequest = {
    topic: text(payload.topic, MAX_TOPIC),
    notes: text(payload.notes, MAX_NOTES),
    keyword: text(payload.keyword, 200),
    prompt: text(payload.prompt, 8000),
  };
  const existing = mode === "review" ? existingArticle(payload.article) : null;
  if (mode === "review" && !existing) return reject("В статье нет текста — проверять нечего", 400);
  if (!input.topic) input.topic = existing?.title ?? "";
  if (!input.topic) return reject("Напишите тему статьи", 400);

  const candidates = pickCandidates(input);
  const options = articleAiOptions();

  const startPhase = (phase: Phase, article?: GeneratedArticle) =>
    phase === "draft"
      ? completeStream(promptFor("article", input.prompt), describeArticleRequest(input, candidates), "article", options)
      : completeStream(ARTICLE_REVIEW_PROMPT, describeReview(article!, input, candidates), "article", {
          ...options,
          temperature: 0.4,
        });

  const firstPhase: Phase = mode === "review" ? "review" : "draft";
  let pieces: AsyncGenerator<string>;
  let first: IteratorResult<string>;
  try {
    pieces = startPhase(firstPhase, existing ?? undefined);
    first = await pieces.next();
  } catch (error) {
    if (error instanceof AiError) return reject(error.message, 502);
    console.error("[ai]", error);
    return reject("Не получилось: внутренняя ошибка, подробности в логе сервера", 500);
  }

  const encoder = new TextEncoder();
  const line = (event: Record<string, unknown>) => encoder.encode(`${JSON.stringify(event)}\n`);
  let active = pieces;

  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: Record<string, unknown>) => controller.enqueue(line(event));
      const ping = setInterval(() => send({ ping: true }), PING_MS);

      const collect = async (
        phase: Phase,
        generator: AsyncGenerator<string>,
        head?: IteratorResult<string>,
      ): Promise<string> => {
        active = generator;
        let answer = "";
        for (let step = head ?? (await generator.next()); !step.done; step = await generator.next()) {
          answer += step.value;
          send({ phase, text: step.value });
        }
        return answer;
      };

      const finish = (article: GeneratedArticle, seoReview?: ArticleReview, warning?: string) =>
        send({
          done: {
            ...attachProductPhotos(article),
            slug: slugForTitle(article.title),
            topic: input.topic,
            notes: input.notes || undefined,
            keyword: input.keyword || undefined,
            ...(seoReview ? { seoReview } : {}),
          },
          ...(warning ? { warning } : {}),
        });

      try {
        let draft: GeneratedArticle;
        if (mode === "write") {
          draft = attachProductPhotos(parseGeneratedArticle(await collect("draft", pieces, first), input));
          if (draft.body.length < 500) {
            send({ error: "Нейросеть вернула слишком короткий текст — попробуйте ещё раз" });
            return;
          }
          send({ status: "Черновик готов. Нейросеть проверяет его как SEO-редактор и исправляет недочёты…" });
        } else {
          draft = existing!;
        }

        let reviewAnswer: string;
        try {
          reviewAnswer =
            mode === "review"
              ? await collect("review", pieces, first)
              : await collect("review", startPhase("review", draft));
        } catch (error) {
          if (mode === "review") throw error;
          if (!(error instanceof AiError)) console.error("[ai]", error);
          finish(draft, undefined, `Проверка не удалась (${(error as Error).message}) — сохранён черновик без правок`);
          return;
        }

        const { article, review } = parseReview(reviewAnswer, draft, input);
        finish(article, review);
      } catch (error) {
        if (!(error instanceof AiError)) console.error("[ai]", error);
        send({
          error:
            error instanceof AiError ? error.message : "Генерация оборвалась, подробности в логе сервера",
        });
      } finally {
        clearInterval(ping);
        controller.close();
      }
    },
    cancel() {
      void active.return(undefined);
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
