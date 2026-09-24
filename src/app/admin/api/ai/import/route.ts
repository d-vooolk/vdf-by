import { getAdmin } from "@/lib/auth";
import {
  AiError,
  aiConfigured,
  complete,
  completeStream,
  describeProduct,
  finishRewrite,
  parseFaq,
  promptFor,
} from "@/lib/ai";
import { extractDonorContent, WRITE_FROM_TITLE } from "@/lib/ai-import";
import { downloadDonorImages, type DonorImagesResult } from "@/lib/donor-images";
import { DonorPageError, fetchDonorPage } from "@/lib/donor-page";

export const dynamic = "force-dynamic";

interface ImportRequest {
  url?: unknown;
  categoryName?: unknown;
  brand?: unknown;
  options?: unknown;
  faq?: unknown;
  photos?: unknown;
  folder?: unknown;
}

const text = (value: unknown) => (typeof value === "string" ? value : "");

function messageOf(error: unknown): string {
  if (error instanceof AiError || error instanceof DonorPageError) return error.message;
  console.error("[ai-import]", error);
  return "Не получилось: внутренняя ошибка, подробности в логе сервера";
}

export async function POST(request: Request) {
  if (!(await getAdmin())) return Response.json({ error: "Нужно войти заново" }, { status: 401 });
  if (!aiConfigured()) {
    return Response.json({ error: "Нейросеть не подключена: нет AI_API_KEY" }, { status: 400 });
  }

  const input = ((await request.json().catch(() => null)) ?? {}) as ImportRequest;
  const url = text(input.url).trim();
  if (!url) return Response.json({ error: "Вставьте ссылку на товар" }, { status: 400 });

  const withPhotos = input.photos === true;
  const folder = text(input.folder) || "misc/new";
  const categoryName = text(input.categoryName) || undefined;
  const brand = text(input.brand) || undefined;
  const options = Array.isArray(input.options) ? input.options.map(text).filter(Boolean) : [];
  const existingFaq = Array.isArray(input.faq)
    ? input.faq.map((item) => ({
        q: text((item as { q?: unknown })?.q),
        a: text((item as { a?: unknown })?.a),
      }))
    : [];

  const encoder = new TextEncoder();
  let cancelled = false;

  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: Record<string, unknown>) => {
        if (!cancelled) controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };

      let photos: Promise<DonorImagesResult> | null = null;
      const finishPhotos = async () => {
        if (!photos) return;
        send({ stage: "photos" });
        const result = await photos;
        photos = null;
        if (result.images.length) send({ images: result.images });
        if (result.problems.length) send({ photoWarning: result.problems.join("; ") });
      };

      try {
        send({ stage: "fetch" });
        const page = await fetchDonorPage(url);
        send({ title: page.title });
        if (withPhotos) {
          photos = downloadDonorImages(page.images, folder, page.url).catch((error) => ({
            images: [],
            problems: [`Фото не загрузились: ${messageOf(error)}`],
          }));
        }

        send({ stage: "extract" });
        const content = await extractDonorContent(page);
        send({ specs: content.specs });

        const fromTitle = !content.description;
        send({ stage: "rewrite", fromTitle });
        const product = {
          title: page.title,
          description: content.description,
          categoryName,
          brand,
          specs: content.specs,
          options,
        };
        const rewritePrompt = promptFor("rewrite", undefined) + (fromTitle ? WRITE_FROM_TITLE : "");
        let draft = "";
        for await (const piece of completeStream(
          rewritePrompt,
          describeProduct(product, false),
          "rewrite",
        )) {
          if (cancelled) return;
          draft += piece;
          send({ text: piece });
        }
        const description = finishRewrite(draft);
        send({ description });

        send({ stage: "faq" });
        try {
          const answer = await complete(
            promptFor("faq", undefined),
            describeProduct({ ...product, description, faq: existingFaq }, true),
            "faq",
          );
          const items = parseFaq(answer);
          if (items.length) send({ faq: items });
          else send({ warning: "Вопросы-ответы не получились — сгенерируйте их кнопкой ниже" });
        } catch (error) {
          send({ warning: `Вопросы-ответы не получились: ${messageOf(error)}` });
        }

        await finishPhotos();
        send({ done: true });
      } catch (error) {
        send({ error: messageOf(error) });
        await finishPhotos().catch(() => {});
      } finally {
        if (!cancelled) controller.close();
      }
    },
    cancel() {
      cancelled = true;
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
