import { fetch as undiciFetch, ProxyAgent } from "undici";

import { getDb } from "./db";
import { env, envNumber } from "./env.mjs";

export type AiTask = "rewrite" | "faq";

export const DEFAULT_PROMPTS: Record<AiTask, string> = {
  rewrite: `Ты — опытный SEO-копирайтер интернет-магазина автомобильного света в Беларуси (Минск, доставка по всей стране). Перепиши описание товара так, чтобы оно было уникальным, полезным покупателю и хорошо ранжировалось в Яндексе и Google.

Требования:
- Сохрани все факты, цифры и характеристики из исходника. Ничего не выдумывай: ни совместимость, ни гарантию, ни комплектацию, которых нет в данных.
- Проанализируй название товара и определи главный поисковый запрос. Используй его естественно в первом предложении и 1–2 раза дальше; добавь близкие формулировки и синонимы, которыми ищут такой товар. Без переспама.
- Первый абзац — 1–2 предложения о главном: что это и чем полезно. Он попадает в сниппет поисковой выдачи.
- Дальше 2–4 коротких абзаца: преимущества, для каких задач и машин подходит (только если это есть в данных), на что обратить внимание при выборе и установке.
- Живой, экспертный, спокойный тон. Без канцелярита, воды, восклицательных знаков и штампов вроде «широкий ассортимент» и «высокое качество».
- Пиши на русском языке. Объём — примерно как у исходника, но не меньше 600 символов.
- Формат: обычный текст, абзацы разделяй пустой строкой. Без Markdown, без заголовков, без списков со звёздочками, без эмодзи.
- Не упоминай другие магазины и сайты, откуда взят исходный текст.

Верни только готовый текст описания, без пояснений и вступлений.`,
  faq: `Ты — SEO-специалист интернет-магазина автомобильного света в Беларуси. Составь блок «Вопросы и ответы» для страницы товара.

Требования:
- 4–6 вопросов, которые реально задают покупатели такого товара: совместимость, установка, отличия, срок службы, комплектация, законность, уход.
- Вопрос формулируй словами покупателя, так, как его вводят в поиск. Используй главный запрос из названия товара и его вариации естественно, без переспама.
- Ответ — 1–3 предложения. Первая фраза сразу отвечает по существу.
- Опирайся только на данные о товаре. Если точного факта нет, отвечай общими правилами для такого типа товаров и предлагай уточнить у менеджера, но не выдумывай цифры и характеристики.
- Вопросы не должны повторять друг друга и дословно пересказывать описание.
- Пиши на русском языке, без Markdown и эмодзи.

Верни только JSON-массив без пояснений, в формате:
[{"q": "вопрос", "a": "ответ"}]`,
};

const PROMPT_KEYS: Record<AiTask, string> = {
  rewrite: "ai:prompt:rewrite",
  faq: "ai:prompt:faq",
};

export function getPrompts(): Record<AiTask, string> {
  const rows = getDb()
    .prepare("SELECT key, value FROM settings WHERE key IN (?, ?)")
    .all(PROMPT_KEYS.rewrite, PROMPT_KEYS.faq) as Array<{ key: string; value: string }>;
  const saved = new Map(rows.map((row) => [row.key, row.value]));
  return {
    rewrite: saved.get(PROMPT_KEYS.rewrite) || DEFAULT_PROMPTS.rewrite,
    faq: saved.get(PROMPT_KEYS.faq) || DEFAULT_PROMPTS.faq,
  };
}

export function savePrompt(task: AiTask, prompt: string | null): void {
  const db = getDb();
  const text = prompt?.trim() ?? "";
  if (!text || text === DEFAULT_PROMPTS[task].trim()) {
    db.prepare("DELETE FROM settings WHERE key = ?").run(PROMPT_KEYS[task]);
    return;
  }
  db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(PROMPT_KEYS[task], text);
}

export function aiConfigured(): boolean {
  return Boolean(env("AI_API_KEY", ""));
}

interface ChatResponse {
  choices?: Array<{ message?: { content?: string | null } }>;
  error?: { message?: string; code?: number | string };
}

export class AiError extends Error {}

const RATE_LIMIT_RETRY_MS = 6000;

let proxyAgent: { url: string; agent: ProxyAgent } | null = null;

function proxiedFetch(url: string, init: RequestInit): Promise<Response> {
  const proxyUrl = env("AI_PROXY", "");
  if (!proxyUrl) return fetch(url, init);
  if (proxyAgent?.url !== proxyUrl) {
    proxyAgent = { url: proxyUrl, agent: new ProxyAgent(proxyUrl) };
  }
  return undiciFetch(url, {
    ...(init as Parameters<typeof undiciFetch>[1]),
    dispatcher: proxyAgent.agent,
  }) as unknown as Promise<Response>;
}

export async function complete(system: string, user: string): Promise<string> {
  const key = env("AI_API_KEY", "");
  if (!key) {
    throw new AiError(
      "Нейросеть не подключена: в .env на сервере не задан AI_API_KEY",
    );
  }

  const baseUrl = env("AI_BASE_URL", "https://openrouter.ai/api/v1").replace(/\/+$/, "");
  const models = env(
    "AI_MODEL",
    "z-ai/glm-5.2:free,nvidia/nemotron-3-super-120b-a12b:free,google/gemma-4-31b-it:free",
  )
    .split(",")
    .map((model) => model.trim())
    .filter(Boolean);
  const timeout = envNumber("AI_TIMEOUT_MS", 90000);
  const isOpenRouter = baseUrl.includes("openrouter.ai");

  const body: Record<string, unknown> = {
    model: models[0],
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    temperature: 0.7,
  };
  if (isOpenRouter && models.length > 1) body.models = models;
  if (isOpenRouter) body.reasoning = { enabled: false };

  const startedAt = Date.now();
  const send = async (): Promise<{ response: Response; data: ChatResponse }> => {
    let response: Response;
    try {
      response = await proxiedFetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
          ...(isOpenRouter
            ? { "HTTP-Referer": "https://vdf.by", "X-Title": "VDF.BY admin" }
            : {}),
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(Math.max(1000, timeout - (Date.now() - startedAt))),
      });
    } catch (error) {
      const name = (error as Error).name;
      const cause = (error as { cause?: Error }).cause?.message;
      throw new AiError(
        name === "TimeoutError"
          ? "Нейросеть не ответила вовремя — попробуйте ещё раз"
          : `Не удалось связаться с нейросетью: ${cause ?? (error as Error).message}`,
      );
    }
    const data = (await response.json().catch(() => ({}))) as ChatResponse;
    return { response, data };
  };

  let { response, data } = await send();
  if (response.status === 429 && Date.now() - startedAt < timeout / 3) {
    await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_RETRY_MS));
    ({ response, data } = await send());
  }

  if (!response.ok || data.error) {
    const detail = data.error?.message ?? `HTTP ${response.status}`;
    if (response.status === 429) {
      throw new AiError(
        `Бесплатные модели сейчас перегружены — попробуйте через минуту (${detail})`,
      );
    }
    if (response.status === 401) {
      throw new AiError("Ключ AI_API_KEY не подошёл — проверьте его в .env");
    }
    throw new AiError(`Нейросеть вернула ошибку: ${detail}`);
  }

  const text = data.choices?.[0]?.message?.content?.trim() ?? "";
  if (!text) throw new AiError("Нейросеть вернула пустой ответ — попробуйте ещё раз");
  return text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
}

export function cleanPlainText(text: string): string {
  return text
    .replace(/^```[a-z]*\s*|```\s*$/gi, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/^#{1,6}[ \t]+/gm, "")
    .replace(/^[ \t]*[*•][ \t]+/gm, "— ")
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function parseFaq(text: string): Array<{ q: string; a: string }> {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start < 0 || end <= start) {
    throw new AiError("Нейросеть ответила не в том формате — попробуйте ещё раз");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    throw new AiError("Нейросеть ответила не в том формате — попробуйте ещё раз");
  }
  if (!Array.isArray(parsed)) {
    throw new AiError("Нейросеть ответила не в том формате — попробуйте ещё раз");
  }
  return parsed
    .map((item) => ({
      q: cleanPlainText(String((item as { q?: unknown })?.q ?? "")),
      a: cleanPlainText(String((item as { a?: unknown })?.a ?? "")),
    }))
    .filter((item) => item.q && item.a);
}
