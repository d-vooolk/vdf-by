import { AiError } from "@/lib/ai";
import { crmKeyMatches } from "@/lib/integration-key";
import { MAX_POLISH_TEXT, polishText } from "@/lib/text-polish";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!crmKeyMatches(request.headers.get("x-integration-key") ?? "")) {
    return Response.json({ error: "forbidden" }, { status: 401 });
  }
  let text = "";
  try {
    const body = (await request.json()) as { text?: unknown };
    if (typeof body.text === "string") text = body.text.trim();
  } catch {
    text = "";
  }
  if (!text) return Response.json({ error: "Нет текста" }, { status: 400 });
  if (text.length > MAX_POLISH_TEXT) {
    return Response.json({ error: `Текст длиннее ${MAX_POLISH_TEXT} знаков` }, { status: 400 });
  }
  try {
    return Response.json({ text: await polishText(text) });
  } catch (error) {
    const message = error instanceof AiError ? error.message : "Нейросеть не ответила — попробуйте ещё раз";
    if (!(error instanceof AiError)) console.error("[text-polish]", error);
    return Response.json({ error: message }, { status: 502 });
  }
}
