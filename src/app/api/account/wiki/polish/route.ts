import { AiError } from "@/lib/ai";
import { forbidden, wikiCustomer } from "@/lib/crm-wiki";
import { takeHit } from "@/lib/rate-limit";
import { MAX_POLISH_TEXT, polishText } from "@/lib/text-polish";

export const dynamic = "force-dynamic";

const HOURLY_LIMIT = 40;
const HOUR_MS = 60 * 60 * 1000;

export async function POST(request: Request) {
  const customer = await wikiCustomer();
  if (!customer) return forbidden();
  let text = "";
  try {
    const body = (await request.json()) as { text?: unknown };
    if (typeof body.text === "string") text = body.text.trim();
  } catch {
    text = "";
  }
  if (!text) return Response.json({ error: "Нет текста" }, { status: 400 });
  if (text.length > MAX_POLISH_TEXT) {
    return Response.json({ error: `Текст длиннее ${MAX_POLISH_TEXT} знаков — поправьте его частями` }, { status: 400 });
  }
  if (!takeHit(`wiki-polish:${customer.id}`, HOURLY_LIMIT, HOUR_MS)) {
    return Response.json({ error: "Слишком часто — попробуйте через час" }, { status: 429 });
  }
  try {
    return Response.json({ text: await polishText(text) });
  } catch (error) {
    const message = error instanceof AiError ? error.message : "Нейросеть не ответила — попробуйте ещё раз";
    if (!(error instanceof AiError)) console.error("[wiki-polish]", error);
    return Response.json({ error: message }, { status: 502 });
  }
}
