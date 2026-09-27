export type ArticlePhase = "draft" | "review";

export interface ArticleStreamResult {
  done?: Record<string, unknown>;
  warning?: string;
  error?: string;
}

interface StreamEvent extends ArticleStreamResult {
  phase?: ArticlePhase;
  text?: string;
  status?: string;
  ping?: boolean;
}

export async function streamArticle(
  payload: Record<string, unknown>,
  handlers: {
    onText: (phase: ArticlePhase, text: string) => void;
    onStatus: (text: string) => void;
  },
  signal: AbortSignal,
): Promise<ArticleStreamResult> {
  const response = await fetch("/admin/api/ai/article/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  });
  if (!response.ok || !response.body) {
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    return { error: data.error ?? `Сервер ответил ${response.status}` };
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    pending += decoder.decode(value, { stream: true });
    const lines = pending.split("\n");
    pending = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      const event = JSON.parse(line) as StreamEvent;
      if (event.error) return { error: event.error };
      if (event.text) handlers.onText(event.phase ?? "draft", event.text);
      if (event.status) handlers.onStatus(event.status);
      if (event.done) return { done: event.done, warning: event.warning };
    }
  }
  return { error: "Генерация оборвалась — попробуйте ещё раз" };
}
