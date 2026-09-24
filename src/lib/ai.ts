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

export interface AiProductInput {
  title: string;
  description: string;
  categoryName?: string;
  brand?: string;
  specs?: Array<{ name: string; value: string }>;
  options?: string[];
  faq?: Array<{ q: string; a: string }>;
  prompt?: string;
}

export const MAX_PROMPT = 8000;
const MAX_SOURCE = 20000;

export function describeProduct(input: AiProductInput, withFaq: boolean): string {
  const lines = [`Название товара: ${input.title.trim()}`];
  if (input.categoryName) lines.push(`Раздел каталога: ${input.categoryName}`);
  if (input.brand?.trim()) lines.push(`Бренд: ${input.brand.trim()}`);

  const specs = (input.specs ?? []).filter((spec) => spec.name.trim() && spec.value.trim());
  if (specs.length) {
    lines.push("Характеристики:");
    for (const spec of specs) lines.push(`- ${spec.name.trim()}: ${spec.value.trim()}`);
  }
  if (input.options?.length) lines.push(`Варианты: ${input.options.join("; ")}`);

  lines.push("", "Описание:", input.description.trim().slice(0, MAX_SOURCE) || "(описания нет)");

  const faq = (input.faq ?? []).filter((item) => item.q.trim());
  if (withFaq && faq.length) {
    lines.push("", "Эти вопросы уже есть на странице, не повторяй их:");
    for (const item of faq) lines.push(`- ${item.q.trim()}`);
  }
  return lines.join("\n");
}

export function promptFor(task: AiTask, custom: string | undefined): string {
  const text = custom?.trim().slice(0, MAX_PROMPT);
  return text || getPrompts()[task];
}

export function aiConfigured(): boolean {
  return Boolean(env("AI_API_KEY", ""));
}

export type AiLogTask = AiTask | "check" | "import";

interface Usage {
  prompt_tokens?: number;
  completion_tokens?: number;
  cost?: number;
}

interface ResponseMeta {
  model?: string;
  provider?: string;
  usage?: Usage;
  error?: { message?: string; code?: number | string };
}

interface ChatResponse extends ResponseMeta {
  choices?: Array<{ message?: { content?: string | null } }>;
}

interface StreamChunk extends ResponseMeta {
  choices?: Array<{ delta?: { content?: string | null } }>;
}

export interface AiTrace {
  task: AiLogTask;
  startedAt: number;
  model: string;
  provider: string;
  firstTokenMs: number | null;
  usage: Usage;
}

export class AiError extends Error {}

const DEFAULT_MODELS =
  "nvidia/nemotron-3-super-120b-a12b:free,google/gemma-4-31b-it:free,z-ai/glm-5.2:free";
const LOG_RETENTION_MS = 180 * 24 * 60 * 60 * 1000;

export interface AiConfig {
  keyConfigured: boolean;
  baseUrl: string;
  models: string[];
  proxy: string;
  isOpenRouter: boolean;
  timeout: number;
}

export function aiConfig(): AiConfig {
  const baseUrl = env("AI_BASE_URL", "https://openrouter.ai/api/v1").replace(/\/+$/, "");
  return {
    keyConfigured: aiConfigured(),
    baseUrl,
    models: env("AI_MODEL", DEFAULT_MODELS)
      .split(",")
      .map((model) => model.trim())
      .filter(Boolean),
    proxy: env("AI_PROXY", ""),
    isOpenRouter: baseUrl.includes("openrouter.ai"),
    timeout: envNumber("AI_TIMEOUT_MS", 90000),
  };
}

let proxyAgent: { url: string; agent: ProxyAgent } | null = null;

export function aiFetch(url: string, init: RequestInit): Promise<Response> {
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

function failure(status: number, detail: string): AiError {
  if (status === 429) {
    return new AiError(`Модели сейчас перегружены — попробуйте через минуту (${detail})`);
  }
  if (status === 401) return new AiError("Ключ AI_API_KEY не подошёл — проверьте его в .env");
  if (status === 402) {
    return new AiError(`На счёте OpenRouter закончились деньги — пополните баланс (${detail})`);
  }
  return new AiError(`Нейросеть вернула ошибку: ${detail}`);
}

function startTrace(task: AiLogTask): AiTrace {
  return { task, startedAt: Date.now(), model: "", provider: "", firstTokenMs: null, usage: {} };
}

function noteMeta(trace: AiTrace, meta: ResponseMeta) {
  if (!trace.model && meta.model) trace.model = meta.model;
  if (!trace.provider && meta.provider) trace.provider = meta.provider;
  if (meta.usage) trace.usage = meta.usage;
}

function record(trace: AiTrace, error: string | null) {
  try {
    const db = getDb();
    db.prepare(
      `INSERT INTO ai_requests
         (created_at, task, model, provider, duration_ms, first_token_ms,
          tokens_in, tokens_out, cost, ok, error)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      trace.startedAt,
      trace.task,
      trace.model,
      trace.provider,
      Date.now() - trace.startedAt,
      trace.firstTokenMs,
      trace.usage.prompt_tokens ?? null,
      trace.usage.completion_tokens ?? null,
      trace.usage.cost ?? null,
      error === null ? 1 : 0,
      error ?? "",
    );
    db.prepare("DELETE FROM ai_requests WHERE created_at < ?").run(Date.now() - LOG_RETENTION_MS);
  } catch (logError) {
    console.error("[ai] журнал запросов", logError);
  }
}

async function request(system: string, user: string, stream: boolean): Promise<Response> {
  const key = env("AI_API_KEY", "");
  if (!key) {
    throw new AiError(
      "Нейросеть не подключена: в .env на сервере не задан AI_API_KEY",
    );
  }

  const { baseUrl, models, timeout, isOpenRouter } = aiConfig();

  const body: Record<string, unknown> = {
    model: models[0],
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    temperature: 0.7,
    stream,
  };
  if (isOpenRouter) {
    if (models.length > 1) body.models = models;
    body.reasoning = { enabled: false };
    body.provider = { sort: "throughput" };
    body.usage = { include: true };
  } else if (stream) {
    body.stream_options = { include_usage: true };
  }

  const send = async () => {
    try {
      return await aiFetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
          ...(isOpenRouter
            ? { "HTTP-Referer": "https://vdf.by", "X-Title": "VDF.BY admin" }
            : {}),
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeout),
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
  };

  let response = await send();
  if (response.status === 429) {
    await response.body?.cancel();
    response = await send();
  }

  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as ChatResponse;
    throw failure(response.status, data.error?.message ?? `HTTP ${response.status}`);
  }
  return response;
}

function stripThinking(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
}

export async function completeTraced(
  system: string,
  user: string,
  task: AiLogTask,
): Promise<{ text: string; trace: AiTrace }> {
  const trace = startTrace(task);
  try {
    const response = await request(system, user, false);
    const data = (await response.json().catch(() => ({}))) as ChatResponse;
    noteMeta(trace, data);
    if (data.error) {
      throw failure(Number(data.error.code) || 500, data.error.message ?? "неизвестная ошибка");
    }

    const text = data.choices?.[0]?.message?.content?.trim() ?? "";
    if (!text) throw new AiError("Нейросеть вернула пустой ответ — попробуйте ещё раз");
    trace.firstTokenMs = Date.now() - trace.startedAt;
    record(trace, null);
    return { text: stripThinking(text), trace };
  } catch (error) {
    record(trace, (error as Error).message);
    throw error;
  }
}

export async function complete(system: string, user: string, task: AiLogTask): Promise<string> {
  return (await completeTraced(system, user, task)).text;
}

export async function* completeStream(
  system: string,
  user: string,
  task: AiLogTask,
): AsyncGenerator<string> {
  const trace = startTrace(task);
  let outcome: string | null = "генерация прервана";
  let produced = false;

  try {
    const response = await request(system, user, true);
    if (!response.body) throw new AiError("Нейросеть вернула пустой ответ — попробуйте ещё раз");

    const decoder = new TextDecoder();
    let pending = "";
    let finished = false;

    for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
      pending += decoder.decode(chunk, { stream: true });
      const lines = pending.split("\n");
      pending = lines.pop() ?? "";

      for (const raw of lines) {
        const line = raw.trim();
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (payload === "[DONE]") {
          finished = true;
          break;
        }

        let parsed: StreamChunk;
        try {
          parsed = JSON.parse(payload) as StreamChunk;
        } catch {
          continue;
        }
        noteMeta(trace, parsed);
        if (parsed.error) {
          throw failure(Number(parsed.error.code) || 500, parsed.error.message ?? "обрыв генерации");
        }
        const piece = parsed.choices?.[0]?.delta?.content;
        if (piece) {
          if (!produced) trace.firstTokenMs = Date.now() - trace.startedAt;
          produced = true;
          yield piece;
        }
      }
      if (finished) break;
    }

    if (!produced) throw new AiError("Нейросеть вернула пустой ответ — попробуйте ещё раз");
    outcome = null;
  } catch (error) {
    outcome = (error as Error).message;
    throw error;
  } finally {
    record(trace, outcome);
  }
}

export async function checkConnection(): Promise<AiTrace & { durationMs: number; answer: string }> {
  const { text, trace } = await completeTraced(
    "Отвечай одним словом, без точки.",
    "Столица Беларуси?",
    "check",
  );
  return { ...trace, durationMs: Date.now() - trace.startedAt, answer: text.slice(0, 40) };
}

export function finishRewrite(text: string): string {
  return cleanPlainText(stripThinking(text));
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
