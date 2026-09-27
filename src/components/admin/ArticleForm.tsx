"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useTransition } from "react";

import {
  deleteArticleAction,
  saveArticleAction,
  searchProductsAction,
  type ProductChoice,
} from "@/app/admin/article-actions";
import { cleanFaq, FaqEditor } from "@/components/admin/FaqEditor";
import { guessThumb, ImagePicker } from "@/components/admin/ImagePicker";
import { Field, Problems, Section, SlugField } from "@/components/admin/form-parts";
import { AlertIcon, SpinnerIcon, TrashIcon } from "@/components/icons";
import {
  articleImagePaths,
  articlePlaceholders,
  articlePlainText,
  articleProductSlugs,
  imageLine,
  parseArticleBody,
  productLine,
  replacePlaceholder,
} from "@/lib/article-body";
import type { Article, ArticleData, ArticleStatus } from "@/lib/articles";
import { streamArticle } from "@/lib/article-stream";
import { toSlug } from "@/lib/slug.mjs";

interface ArticleFormProps {
  article: Article;
  thumbs: Record<string, string>;
  aiReady: boolean;
}

const SEO_TITLE_LIMIT = 60;
const SEO_DESCRIPTION_LIMIT = 160;
const MIN_TEXT = 4000;

function toData(article: Article): ArticleData {
  return {
    slug: article.slug,
    title: article.title,
    excerpt: article.excerpt,
    body: article.body,
    cover: article.cover,
    images: article.images,
    seoTitle: article.seoTitle,
    seoDescription: article.seoDescription,
    faq: article.faq,
    topic: article.topic,
    notes: article.notes,
    keyword: article.keyword,
    seoReview: article.seoReview,
  };
}

function clean(draft: ArticleData): ArticleData {
  const trimmed = (value: string | undefined) => {
    const text = (value ?? "").trim();
    return text.length ? text : undefined;
  };
  return {
    ...draft,
    title: draft.title.trim(),
    excerpt: trimmed(draft.excerpt),
    seoTitle: trimmed(draft.seoTitle),
    seoDescription: trimmed(draft.seoDescription),
    cover: trimmed(draft.cover),
    faq: cleanFaq(draft.faq) ?? [],
  };
}

function checklist(draft: ArticleData): Array<{ ok: boolean; text: string }> {
  const plain = articlePlainText(draft.body);
  const blocks = parseArticleBody(draft.body);
  const headings = blocks.filter((block) => block.type === "h2").length;
  const placeholders = articlePlaceholders(draft.body).length;
  const products = articleProductSlugs(draft.body).length;
  const seoTitle = (draft.seoTitle || draft.title).length;
  const seoDescription = (draft.seoDescription || draft.excerpt || "").length;
  const keyword = draft.keyword?.trim().toLowerCase();

  return [
    { ok: plain.length >= MIN_TEXT, text: `Объём текста ${plain.length.toLocaleString("ru-RU")} знаков (желательно от ${MIN_TEXT.toLocaleString("ru-RU")})` },
    { ok: headings >= 3, text: `Разделов с подзаголовками: ${headings} (желательно от 3)` },
    { ok: Boolean(draft.excerpt?.trim()), text: "Аннотация — короткий прямой ответ в начале статьи" },
    { ok: seoTitle > 0 && seoTitle <= SEO_TITLE_LIMIT + 10, text: `Заголовок для поиска: ${seoTitle} знаков (до ${SEO_TITLE_LIMIT})` },
    { ok: seoDescription >= 100 && seoDescription <= SEO_DESCRIPTION_LIMIT + 10, text: `Описание для поиска: ${seoDescription} знаков (100–${SEO_DESCRIPTION_LIMIT})` },
    { ok: Boolean(draft.cover), text: "Обложка — картинка для превью в поиске и соцсетях" },
    { ok: placeholders === 0, text: placeholders ? `Фото не поставлены в ${placeholders} местах — на сайте эти пометки не видны` : "Все пометки о фото заменены снимками" },
    { ok: products > 0, text: `Ссылок и карточек товаров: ${products}` },
    { ok: draft.faq.length >= 3, text: `Вопросов и ответов: ${draft.faq.length} (желательно от 3)` },
    ...(keyword
      ? [{ ok: draft.title.toLowerCase().includes(keyword) || plain.slice(0, 600).toLowerCase().includes(keyword), text: `Главный запрос «${draft.keyword}» в заголовке или начале текста` }]
      : []),
  ];
}

export function ArticleForm({ article, thumbs: initialThumbs, aiReady }: ArticleFormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState<ArticleData>(() => toData(article));
  const [status, setStatus] = useState<ArticleStatus>(article.status);
  const [problems, setProblems] = useState<string[]>([]);
  const [saved, setSaved] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [thumbs, setThumbs] = useState<Record<string, string>>(initialThumbs);
  const [productQuery, setProductQuery] = useState("");
  const [productResults, setProductResults] = useState<ProductChoice[]>([]);
  const [searching, setSearching] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const [reviewing, setReviewing] = useState(false);
  const [reviewProgress, setReviewProgress] = useState(0);
  const [reviewError, setReviewError] = useState("");
  const [beforeReview, setBeforeReview] = useState<ArticleData | null>(null);
  const reviewAbort = useRef<AbortController | null>(null);

  const published = status === "published";
  const placeholders = useMemo(() => articlePlaceholders(draft.body), [draft.body]);
  const checks = useMemo(() => checklist(draft), [draft]);
  const usedInText = useMemo(() => new Set(articleImagePaths(draft.body)), [draft.body]);

  const patch = (changes: Partial<ArticleData>) => {
    setDraft((current) => ({ ...current, ...changes }));
    setSaved("");
  };

  const rememberThumbs = (pairs: Record<string, string>) =>
    setThumbs((current) => ({ ...current, ...pairs }));
  const thumbOf = (path: string) => thumbs[path] ?? guessThumb(path);

  const insertAtCursor = (snippet: string) => {
    const area = bodyRef.current;
    const body = draft.body;
    const position = area ? area.selectionStart : body.length;
    const before = body.slice(0, position);
    const after = body.slice(position);
    const lead = before && !before.endsWith("\n\n") ? (before.endsWith("\n") ? "\n" : "\n\n") : "";
    const tail = after.startsWith("\n\n") ? "" : after.startsWith("\n") ? "\n" : "\n\n";
    const next = `${before}${lead}${snippet}${tail}${after}`;
    patch({ body: next });
    requestAnimationFrame(() => {
      if (!area) return;
      const caret = before.length + lead.length + snippet.length;
      area.focus();
      area.setSelectionRange(caret, caret);
    });
  };

  const addToPool = (path: string) => {
    if (!draft.images.includes(path)) patch({ images: [...draft.images, path] });
  };

  const fillPlaceholder = (text: string, path: string) => {
    setDraft((current) => ({
      ...current,
      images: current.images.includes(path) ? current.images : [...current.images, path],
      body: replacePlaceholder(current.body, text, imageLine(path, text)),
    }));
    setSaved("");
  };

  const findProducts = (query: string) => {
    setProductQuery(query);
    if (query.trim().length < 2) {
      setProductResults([]);
      return;
    }
    setSearching(true);
    searchProductsAction(query)
      .then((rows) => setProductResults(rows))
      .finally(() => setSearching(false));
  };

  const save = (nextStatus: ArticleStatus) => {
    setProblems([]);
    startTransition(async () => {
      const result = await saveArticleAction(clean(draft), nextStatus, article.id);
      if (!result.ok) {
        setProblems(result.problems);
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      setStatus(nextStatus);
      setSaved(
        nextStatus === "published"
          ? published
            ? "Сохранено, страница на сайте обновлена."
            : "Опубликовано. Поисковики получили уведомление о новой странице."
          : published
            ? "Статья снята с публикации и сохранена как черновик."
            : "Черновик сохранён.",
      );
      router.refresh();
    });
  };

  const remove = () => startTransition(() => deleteArticleAction(article.id));

  const review = async () => {
    setReviewing(true);
    setReviewError("");
    setReviewProgress(0);
    const controller = new AbortController();
    reviewAbort.current = controller;
    try {
      const result = await streamArticle(
        {
          mode: "review",
          topic: draft.topic || draft.title,
          notes: draft.notes,
          keyword: draft.keyword,
          article: draft,
        },
        { onText: (_, text) => setReviewProgress((value) => value + text.length), onStatus: () => {} },
        controller.signal,
      );
      if (result.error || !result.done) {
        setReviewError(result.error ?? "Проверка оборвалась — попробуйте ещё раз");
        return;
      }
      const done = result.done as Partial<ArticleData>;
      setBeforeReview(draft);
      patch({
        title: done.title ?? draft.title,
        excerpt: done.excerpt ?? draft.excerpt,
        body: done.body ?? draft.body,
        seoTitle: done.seoTitle ?? draft.seoTitle,
        seoDescription: done.seoDescription ?? draft.seoDescription,
        faq: done.faq ?? draft.faq,
        seoReview: done.seoReview,
      });
    } catch (reason) {
      if ((reason as Error).name !== "AbortError") setReviewError((reason as Error).message);
    } finally {
      reviewAbort.current = null;
      setReviewing(false);
    }
  };

  return (
    <div className="space-y-5 pb-24">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/admin/articles/" className="btn-ghost py-2 text-sm">
          ← К статьям
        </Link>
        <h1 className="text-xl font-semibold text-brand-900">{draft.title || "Без названия"}</h1>
        <span
          className={`badge ${published ? "bg-green-100 text-green-800" : "bg-brand-100 text-brand-600"}`}
        >
          {published ? "опубликована" : "черновик"}
        </span>
        {published ? (
          <Link
            href={`/stati/${article.slug}/`}
            target="_blank"
            rel="noopener"
            className="text-xs text-brand-400 hover:text-brand-800"
          >
            Открыть на сайте ↗
          </Link>
        ) : (
          <Link
            href={`/admin/articles/${article.id}/preview/`}
            target="_blank"
            rel="noopener"
            className="text-xs text-brand-400 hover:text-brand-800"
          >
            Предпросмотр сохранённой версии ↗
          </Link>
        )}
      </div>

      <Problems items={problems} />
      {saved && (
        <p className="rounded-xl border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-800">{saved}</p>
      )}

      <Section
        title={
          draft.seoReview
            ? `Оценка SEO-редактора: ${draft.seoReview.score} из 100${draft.seoReview.revised ? " — недочёты исправлены" : ""}`
            : "SEO-редактор"
        }
        note="Нейросеть проверяет статью как SEO-редактор: оценивает полноту, структуру, запросы, перелинковку и язык, затем исправляет найденное. Фото и карточки товаров остаются на местах. Оценка — за версию до правок."
      >
        {draft.seoReview && draft.seoReview.notes.length > 0 && (
          <ul className="list-disc space-y-1 pl-5 text-xs text-brand-600">
            {draft.seoReview.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={review}
            disabled={!aiReady || reviewing || pending || !draft.body.trim()}
            className="btn-secondary py-1.5 text-xs"
          >
            {reviewing ? (
              <>
                <SpinnerIcon className="h-3.5 w-3.5 animate-spin" />
                Проверяем… {reviewProgress.toLocaleString("ru-RU")} знаков
              </>
            ) : (
              "Проверить и улучшить"
            )}
          </button>
          {reviewing && (
            <button type="button" onClick={() => reviewAbort.current?.abort()} className="btn-ghost py-1.5 text-xs">
              Остановить
            </button>
          )}
          {beforeReview && !reviewing && (
            <button
              type="button"
              onClick={() => {
                patch(beforeReview);
                setBeforeReview(null);
              }}
              className="btn-ghost py-1.5 text-xs"
            >
              Вернуть как было до проверки
            </button>
          )}
          {beforeReview && !reviewing && (
            <span className="text-xs text-amber-800">Правки ещё не сохранены</span>
          )}
        </div>
        {reviewError && (
          <p className="flex items-start gap-1.5 text-xs text-red-700" role="alert">
            <AlertIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {reviewError}
          </p>
        )}
      </Section>

      <Section title="Проверка перед публикацией">
        <ul className="grid gap-1.5 sm:grid-cols-2">
          {checks.map((check) => (
            <li
              key={check.text}
              className={`flex items-start gap-2 text-xs ${check.ok ? "text-green-800" : "text-amber-800"}`}
            >
              <span aria-hidden="true">{check.ok ? "✓" : "!"}</span>
              {check.text}
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Заголовок и адрес">
        <Field label="Заголовок статьи (H1)" required>
          <input value={draft.title} onChange={(event) => patch({ title: event.target.value })} className="field" />
        </Field>
        <SlugField
          label="Адрес (slug)"
          value={draft.slug}
          fromName={toSlug(draft.title).slice(0, 70).replace(/-+$/, "")}
          saved={article.status === "published" ? article.slug : undefined}
          preview={(slug) => `/stati/${slug || "…"}/`}
          onChange={(slug) => patch({ slug: toSlug(slug) })}
        />
        <Field
          label="Аннотация"
          hint="2–3 предложения с прямым ответом на главный вопрос. Показывается под заголовком — её цитируют поисковики и нейросети."
        >
          <textarea
            value={draft.excerpt ?? ""}
            onChange={(event) => patch({ excerpt: event.target.value })}
            rows={3}
            className="field resize-y"
          />
        </Field>
      </Section>

      <Section
        title="Текст"
        note="## — раздел, ### — подраздел, пустая строка — новый абзац, «- » — список, «> » — совет. Ссылка: [текст](/product/адрес/). Фото и карточки товаров вставляются кнопками ниже — туда, где стоит курсор."
      >
        <div className="flex flex-wrap items-start gap-3">
          <details className="relative">
            <summary className="btn-secondary cursor-pointer list-none py-1.5 text-xs">Вставить фото</summary>
            <div className="absolute z-20 mt-1 w-80 rounded-xl border border-brand-100 bg-white p-3 shadow-lg">
              {draft.images.length ? (
                <ul className="grid grid-cols-4 gap-2">
                  {draft.images.map((path) => (
                    <li key={path}>
                      <button
                        type="button"
                        onClick={() => insertAtCursor(imageLine(path, ""))}
                        title="Вставить в текст"
                        className="block h-16 w-full overflow-hidden rounded-lg border border-brand-100 hover:border-brand-500"
                      >
                        <img src={thumbOf(path)} alt="" className="h-full w-full object-cover" />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-brand-400">Сначала загрузите фото в блоке «Фото статьи» ниже.</p>
              )}
              <p className="mt-2 text-[11px] text-brand-400">
                Подпись и alt пишутся в квадратных скобках: ![что на фото](…). Пустые скобки — alt соберётся из заголовка раздела.
              </p>
            </div>
          </details>

          <details className="relative">
            <summary className="btn-secondary cursor-pointer list-none py-1.5 text-xs">Вставить товар</summary>
            <div className="absolute z-20 mt-1 w-96 rounded-xl border border-brand-100 bg-white p-3 shadow-lg">
              <input
                value={productQuery}
                onChange={(event) => findProducts(event.target.value)}
                className="field py-1.5 text-sm"
                placeholder="Название или артикул"
              />
              {searching && <SpinnerIcon className="mt-2 h-4 w-4 animate-spin text-brand-400" />}
              <ul className="mt-2 max-h-72 space-y-1 overflow-y-auto">
                {productResults.map((product) => (
                  <li key={product.slug} className="flex items-center gap-2 text-xs">
                    {product.thumb ? (
                      <img src={product.thumb} alt="" className="h-8 w-8 shrink-0 rounded object-contain" />
                    ) : (
                      <span className="h-8 w-8 shrink-0 rounded bg-brand-50" />
                    )}
                    <span className="min-w-0 flex-1 truncate text-brand-700">{product.title}</span>
                    <button
                      type="button"
                      onClick={() => insertAtCursor(productLine(product.slug))}
                      className="btn-ghost shrink-0 px-2 py-1 text-[11px]"
                    >
                      карточкой
                    </button>
                    <button
                      type="button"
                      onClick={() => insertAtCursor(`[${product.title}](/product/${product.slug}/)`)}
                      className="btn-ghost shrink-0 px-2 py-1 text-[11px]"
                    >
                      ссылкой
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </details>
        </div>

        <textarea
          ref={bodyRef}
          value={draft.body}
          onChange={(event) => patch({ body: event.target.value })}
          rows={32}
          className="field resize-y font-mono text-[13px] leading-relaxed"
        />
      </Section>

      <Section
        title="Фото статьи"
        note="Загрузите снимки сюда, потом поставьте их на места, которые отметила нейросеть, или вставьте кнопкой «Вставить фото». Alt и подпись берутся из описания места."
      >
        {placeholders.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-amber-900">Нужны фото ({placeholders.length}):</p>
            <ul className="space-y-2">
              {placeholders.map((text, index) => (
                <li key={`${text}-${index}`} className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                  <p className="text-sm text-amber-950">{text}</p>
                  {draft.images.length ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {draft.images.map((path) => (
                        <button
                          key={path}
                          type="button"
                          onClick={() => fillPlaceholder(text, path)}
                          title="Поставить это фото"
                          className={`h-14 w-14 overflow-hidden rounded-lg border hover:border-brand-600 ${
                            usedInText.has(path) ? "border-brand-100 opacity-50" : "border-amber-300"
                          }`}
                        >
                          <img src={thumbOf(path)} alt="" className="h-full w-full object-cover" />
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-1 text-xs text-amber-800">Загрузите фото ниже — здесь появится выбор.</p>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        <ImagePicker
          value={draft.images}
          onChange={(images) => patch({ images })}
          folder="articles"
          thumbs={thumbs}
          onThumbs={rememberThumbs}
          max={60}
          label="Фото для текста"
          hint="Загруженные сюда фото ещё не в тексте — их надо поставить на место."
        />

        <ImagePicker
          value={draft.cover ? [draft.cover] : []}
          onChange={(images) => {
            patch({ cover: images[0] });
            if (images[0]) addToPool(images[0]);
          }}
          folder="articles"
          thumbs={thumbs}
          onThumbs={rememberThumbs}
          max={1}
          label="Обложка"
          hint="Показывается в списке статей, вверху статьи и в превью ссылки в поиске и мессенджерах. Лучше горизонтальная, от 1200 px."
        />
      </Section>

      <Section
        title="Вопросы и ответы"
        note="Показываются в конце статьи и уходят в разметку FAQPage."
      >
        <FaqEditor value={draft.faq} onChange={(faq) => patch({ faq })} />
      </Section>

      <Section title="Поиск и SEO" note="Пусто — возьмутся заголовок статьи и аннотация.">
        <Field label={`Заголовок для поиска · ${(draft.seoTitle ?? "").length} / ${SEO_TITLE_LIMIT}`}>
          <input
            value={draft.seoTitle ?? ""}
            onChange={(event) => patch({ seoTitle: event.target.value })}
            className="field"
          />
        </Field>
        <Field label={`Описание для поиска · ${(draft.seoDescription ?? "").length} / ${SEO_DESCRIPTION_LIMIT}`}>
          <textarea
            value={draft.seoDescription ?? ""}
            onChange={(event) => patch({ seoDescription: event.target.value })}
            rows={2}
            className="field resize-y"
          />
        </Field>
        <Field label="Главный поисковый запрос" hint="Только для проверки выше, на сайт не выводится">
          <input
            value={draft.keyword ?? ""}
            onChange={(event) => patch({ keyword: event.target.value })}
            className="field"
          />
        </Field>
        {(draft.topic || draft.notes) && (
          <p className="text-xs leading-relaxed text-brand-400">
            Задание для нейросети: {draft.topic}
            {draft.notes ? ` · ${draft.notes}` : ""}
          </p>
        )}
      </Section>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-brand-100 bg-white/95 backdrop-blur">
        <div className="container-page flex flex-wrap items-center gap-3 py-3">
          {confirmDelete ? (
            <>
              <button
                type="button"
                onClick={remove}
                disabled={pending}
                className="btn-primary bg-red-700 py-2 text-sm hover:bg-red-800"
              >
                Да, удалить статью
              </button>
              <button type="button" onClick={() => setConfirmDelete(false)} className="btn-ghost py-2 text-sm">
                Отмена
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="btn-ghost py-2 text-sm text-red-700 hover:bg-red-50"
            >
              <TrashIcon className="h-4 w-4" />
              Удалить
            </button>
          )}

          {placeholders.length > 0 && (
            <span className="flex items-center gap-1 text-xs text-amber-800">
              <AlertIcon className="h-3.5 w-3.5" />
              без {placeholders.length} фото
            </span>
          )}

          <div className="ml-auto flex flex-wrap gap-2">
            {published ? (
              <button type="button" onClick={() => save("draft")} disabled={pending} className="btn-ghost py-2 text-sm">
                Снять с публикации
              </button>
            ) : (
              <button type="button" onClick={() => save("draft")} disabled={pending} className="btn-secondary py-2 text-sm">
                Сохранить черновик
              </button>
            )}
            <button type="button" onClick={() => save("published")} disabled={pending} className="btn-primary py-2 text-sm">
              {pending ? (
                <>
                  <SpinnerIcon className="h-4 w-4 animate-spin" />
                  Сохраняем…
                </>
              ) : published ? (
                "Сохранить"
              ) : (
                "Опубликовать"
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
