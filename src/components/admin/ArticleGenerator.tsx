"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import { createArticleDraftAction } from "@/app/admin/article-actions";
import { PromptEditor, usePrompt, type AiSettings } from "@/components/admin/AiTools";
import { Field, Problems, Section } from "@/components/admin/form-parts";
import { AlertIcon, SpinnerIcon } from "@/components/icons";
import { streamArticle, type ArticlePhase } from "@/lib/article-stream";

interface ArticleGeneratorProps {
  ai: AiSettings;
}

const TOPIC_EXAMPLES = [
  "Би-LED или би-ксеноновые линзы: что поставить в фары",
  "Как выбрать стекло фары и не ошибиться с поколением авто",
  "Какой цоколь лампы у популярных автомобилей: таблица",
  "Почему мутнеют и желтеют фары и что с этим делать",
];

export function ArticleGenerator({ ai }: ArticleGeneratorProps) {
  const router = useRouter();
  const prompt = usePrompt(ai, "article");
  const [topic, setTopic] = useState("");
  const [keyword, setKeyword] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [problems, setProblems] = useState<string[]>([]);
  const [preview, setPreview] = useState("");
  const [phase, setPhase] = useState<ArticlePhase>("draft");
  const [status, setStatus] = useState("");
  const [saving, startSaving] = useTransition();
  const abort = useRef<AbortController | null>(null);
  const phaseRef = useRef<ArticlePhase>("draft");

  const createDraft = (article: Record<string, unknown>) =>
    startSaving(async () => {
      const result = await createArticleDraftAction(article);
      if (!result.ok) {
        setProblems(result.problems);
        return;
      }
      router.push(`/admin/articles/${result.id}/`);
    });

  const generate = async () => {
    setBusy(true);
    setError("");
    setProblems([]);
    setPreview("");
    setStatus("");
    setPhase("draft");
    phaseRef.current = "draft";
    const controller = new AbortController();
    abort.current = controller;

    try {
      const result = await streamArticle(
        { mode: "write", topic, keyword, notes, prompt: prompt.text },
        {
          onText: (current, text) => {
            if (phaseRef.current !== current) {
              phaseRef.current = current;
              setPhase(current);
              setPreview(text);
              return;
            }
            setPreview((value) => value + text);
          },
          onStatus: setStatus,
        },
        controller.signal,
      );
      if (result.error) {
        setError(result.error);
        return;
      }
      if (result.done) createDraft(result.done);
    } catch (reason) {
      if ((reason as Error).name !== "AbortError") setError((reason as Error).message);
    } finally {
      abort.current = null;
      setBusy(false);
    }
  };

  const createEmpty = () =>
    createDraft({
      title: topic.trim() || "Новая статья",
      slug: "",
      body: "",
      topic: topic.trim() || undefined,
      notes: notes.trim() || undefined,
      keyword: keyword.trim() || undefined,
    });

  return (
    <div className="space-y-5">
      <Problems items={problems} />

      <Section
        title="О чём статья"
        note="Нейросеть напишет текст, заголовки, описание для поиска и вопросы-ответы, сама подберёт товары магазина по теме и сошлётся на них. Где нужны фото — оставит пометки с описанием снимка."
      >
        <Field label="Тема" required>
          <input
            value={topic}
            onChange={(event) => setTopic(event.target.value)}
            className="field"
            placeholder={TOPIC_EXAMPLES[0]}
            maxLength={500}
          />
        </Field>
        <div className="flex flex-wrap gap-1.5">
          {TOPIC_EXAMPLES.map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => setTopic(example)}
              className="rounded-full border border-brand-100 px-2.5 py-1 text-xs text-brand-500 hover:border-brand-300 hover:text-brand-800"
            >
              {example}
            </button>
          ))}
        </div>

        <Field
          label="Главный поисковый запрос"
          hint="Необязательно. Как люди ищут эту тему: «билед линзы или ксенон»"
        >
          <input
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            className="field"
            maxLength={200}
          />
        </Field>

        <Field
          label="Нюансы"
          hint="Что обязательно раскрыть, для каких машин, какой опыт магазина упомянуть. Ссылки на товары вида /product/…/ нейросеть точно использует в тексте."
        >
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={6}
            className="field resize-y"
            maxLength={4000}
          />
        </Field>

        {!ai.ready && (
          <p className="flex items-start gap-1.5 text-xs text-amber-800">
            <AlertIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            В .env на сервере не задан AI_API_KEY — можно создать только пустую статью и написать её вручную.
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={generate}
            disabled={busy || saving || !ai.ready || !topic.trim()}
            className="btn-primary py-2 text-sm"
          >
            {busy ? (
              <>
                <SpinnerIcon className="h-4 w-4 animate-spin" />
                Пишем статью…
              </>
            ) : saving ? (
              <>
                <SpinnerIcon className="h-4 w-4 animate-spin" />
                Сохраняем черновик…
              </>
            ) : (
              "Написать статью"
            )}
          </button>
          {busy && (
            <button type="button" onClick={() => abort.current?.abort()} className="btn-ghost py-2 text-sm">
              Остановить
            </button>
          )}
          <button
            type="button"
            onClick={createEmpty}
            disabled={busy || saving}
            className="btn-ghost py-2 text-sm"
          >
            Написать вручную
          </button>
        </div>

        {error && (
          <p className="flex items-start gap-1.5 text-sm text-red-700" role="alert">
            <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
            {error}
          </p>
        )}

        <PromptEditor task="article" settings={ai} prompt={prompt} />
      </Section>

      {preview && (
        <Section
          title={
            busy
              ? `${phase === "draft" ? "Шаг 1 из 2: пишется черновик" : "Шаг 2 из 2: SEO-проверка и правка"} · ${preview.length.toLocaleString("ru-RU")} знаков`
              : "Ответ нейросети"
          }
          note={
            status ||
            "Сначала нейросеть пишет черновик, потом сама проверяет его как SEO-редактор, ставит оценку и исправляет недочёты. Вместе это занимает 3–8 минут. Когда всё готово, откроется черновик — там можно поправить текст, поставить фото и опубликовать."
          }
        >
          <pre className="max-h-[60vh] overflow-y-auto rounded-xl bg-brand-50 p-3 font-sans text-xs leading-relaxed whitespace-pre-wrap text-brand-700">
            {preview}
          </pre>
        </Section>
      )}
    </div>
  );
}
