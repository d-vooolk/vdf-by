"use client";

import { useEffect, useRef, useState } from "react";

import {
  AlertIcon,
  CloseIcon,
  PlusIcon,
  SearchIcon,
  SendIcon,
  SparkIcon,
  SpinnerIcon,
  TrashIcon,
  UndoIcon,
  UploadIcon,
} from "@/components/icons";

import { errorText, uploadFile, wikiRequest } from "./api";
import { ReviewNotes } from "./ReviewNotes";
import { WikiMediaGrid } from "./WikiMediaGrid";
import type { CatalogItem, WikiCarKey, WikiProposal } from "./types";

const MAX_FILE_MB = 300;
const MEDIA_EXT = /\.(jpe?g|png|gif|webp|bmp|heic|heif|mp4|mov|m4v|webm|avi|mkv|3gp)$/i;

interface Upload {
  id: string;
  name: string;
  percent: number;
}

function checkFile(file: File): string | null {
  const isMedia = file.type.startsWith("image/") || file.type.startsWith("video/") || MEDIA_EXT.test(file.name);
  if (!isMedia) return `${file.name}: можно загружать только фото и видео`;
  if (file.size > MAX_FILE_MB * 1024 * 1024) return `${file.name}: файл больше ${MAX_FILE_MB} МБ`;
  return null;
}

export function WikiProposalEditor({
  carKey,
  sectionId,
  sectionName,
  proposal,
  onChanged,
  onClose,
}: {
  carKey: WikiCarKey;
  sectionId: string | null;
  sectionName: string;
  proposal: WikiProposal | null;
  onChanged: () => Promise<void>;
  onClose: () => void;
}) {
  const [text, setText] = useState(proposal?.text ?? "");
  const [savedText, setSavedText] = useState(proposal?.text ?? "");
  const [beforePolish, setBeforePolish] = useState<string | null>(null);
  const [busy, setBusy] = useState<"" | "save" | "polish" | "submit" | "discard">("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<{ query: string; items: CatalogItem[] }>({ query: "", items: [] });
  const fileInput = useRef<HTMLInputElement>(null);

  const dirty = text !== savedText;
  const hasContent = Boolean(text.trim()) || Boolean(proposal?.media.length) || Boolean(proposal?.products.length);

  const needle = query.trim();
  const searchable = needle.length >= 2;
  const results = searchable && found.query === needle ? found.items : [];
  const searching = searchable && found.query !== needle;

  useEffect(() => {
    if (!searchable) return;
    const timer = setTimeout(() => {
      wikiRequest<{ items: CatalogItem[] }>(`/catalog/?q=${encodeURIComponent(needle)}`)
        .then((data) => setFound({ query: needle, items: data.items }))
        .catch(() => setFound({ query: needle, items: [] }));
    }, 300);
    return () => clearTimeout(timer);
  }, [needle, searchable]);

  const run = async (kind: typeof busy, action: () => Promise<void>) => {
    setBusy(kind);
    setError("");
    setNotice("");
    try {
      await action();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy("");
    }
  };

  const saveText = async () => {
    await wikiRequest("/text/", {
      method: "PUT",
      body: JSON.stringify({ ...carKey, sectionId, text }),
    });
    setSavedText(text);
  };

  const save = () =>
    run("save", async () => {
      await saveText();
      await onChanged();
      setNotice("Черновик сохранён");
    });

  const polish = () =>
    run("polish", async () => {
      const source = text;
      const { text: polished } = await wikiRequest<{ text: string }>("/polish/", {
        method: "POST",
        body: JSON.stringify({ text: source }),
      });
      if (polished.trim() === source.trim()) {
        setNotice("Ошибок не найдено");
        return;
      }
      setBeforePolish(source);
      setText(polished);
      setNotice("Текст поправлен — проверьте его");
    });

  const submit = () =>
    run("submit", async () => {
      if (dirty || !proposal) await saveText();
      const fresh = proposal ?? (await currentProposal());
      if (!fresh) throw new Error("Напишите текст или добавьте фото, видео или товары");
      await wikiRequest("/proposal/", { method: "POST", body: JSON.stringify({ id: fresh.id }) });
      await onChanged();
      onClose();
    });

  const discard = () =>
    run("discard", async () => {
      if (!proposal) {
        onClose();
        return;
      }
      if (!window.confirm("Удалить черновик вместе с фото и видео?")) return;
      await wikiRequest(`/proposal/?id=${encodeURIComponent(proposal.id)}`, { method: "DELETE" });
      await onChanged();
      onClose();
    });

  const currentProposal = async () => {
    const data = await wikiRequest<{ proposals: WikiProposal[] }>("/proposals/");
    return (
      data.proposals.find(
        (item) =>
          item.entry.markId === carKey.markId &&
          item.entry.modelId === carKey.modelId &&
          item.entry.generationId === carKey.generationId &&
          item.sectionId === sectionId &&
          (item.status === "DRAFT" || item.status === "CHANGES_REQUESTED"),
      ) ?? null
    );
  };

  const addFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setError("");
    const problems: string[] = [];
    const list = Array.from(files);
    for (const file of list) {
      const problem = checkFile(file);
      if (problem) {
        problems.push(problem);
        continue;
      }
      const id = `${file.name}-${file.size}-${Math.random()}`;
      setUploads((current) => [...current, { id, name: file.name, percent: 0 }]);
      try {
        await uploadFile(carKey, sectionId, file, (percent) =>
          setUploads((current) => current.map((item) => (item.id === id ? { ...item, percent } : item))),
        );
      } catch (err) {
        problems.push(`${file.name}: ${errorText(err)}`);
      } finally {
        setUploads((current) => current.filter((item) => item.id !== id));
      }
    }
    if (fileInput.current) fileInput.current.value = "";
    if (problems.length) setError(problems.join("\n"));
    await onChanged();
  };

  const removeMedia = (mediaId: string) =>
    run("", async () => {
      await wikiRequest(`/media/?id=${encodeURIComponent(mediaId)}`, { method: "DELETE" });
      await onChanged();
    });

  const addProduct = (item: CatalogItem) =>
    run("", async () => {
      await wikiRequest("/products/", {
        method: "POST",
        body: JSON.stringify({ ...carKey, sectionId, productId: item.id }),
      });
      setQuery("");
      await onChanged();
    });

  const removeProduct = (productId: string) =>
    run("", async () => {
      await wikiRequest(`/products/?id=${encodeURIComponent(productId)}`, { method: "DELETE" });
      await onChanged();
    });

  const attached = new Set(proposal?.products.map((product) => product.productId));

  return (
    <div className="card space-y-5 border-accent-300 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="eyebrow">Ваша информация</p>
          <h3 className="mt-1 text-lg font-semibold text-brand-900">{sectionName}</h3>
          <p className="mt-1 text-sm text-brand-500">
            Ваш текст допишется в конец раздела после проверки. Фото, видео и товары появятся вместе с ним.
          </p>
        </div>
        <button type="button" onClick={onClose} className="btn-ghost px-2 py-2" aria-label="Закрыть">
          <CloseIcon className="h-5 w-5" />
        </button>
      </div>

      {proposal?.status === "CHANGES_REQUESTED" && <ReviewNotes notes={proposal.reviewNotes} />}

      <label className="block">
        <span className="label">Описание</span>
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={8}
          maxLength={20000}
          disabled={busy === "polish"}
          placeholder="Как снимается фара, что важно при установке, какие нюансы у этой машины…"
          className="field min-h-40 resize-y"
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={polish} disabled={!text.trim() || Boolean(busy)} className="btn-secondary">
          {busy === "polish" ? <SpinnerIcon className="h-4 w-4 animate-spin" /> : <SparkIcon className="h-4 w-4" />}
          Поправить нейросетью
        </button>
        {beforePolish !== null && busy !== "polish" && (
          <button
            type="button"
            onClick={() => {
              setText(beforePolish);
              setBeforePolish(null);
            }}
            className="btn-ghost"
          >
            <UndoIcon className="h-4 w-4" />
            Вернуть как было
          </button>
        )}
        <button type="button" onClick={save} disabled={!dirty || Boolean(busy)} className="btn-secondary sm:ml-auto">
          {busy === "save" && <SpinnerIcon className="h-4 w-4 animate-spin" />}
          Сохранить черновик
        </button>
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="label mb-0">Фото и видео</span>
          <button type="button" onClick={() => fileInput.current?.click()} className="btn-secondary py-2">
            <UploadIcon className="h-4 w-4" />
            Загрузить
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="image/*,video/*"
            multiple
            hidden
            onChange={(event) => void addFiles(event.target.files)}
          />
        </div>
        {uploads.map((item) => (
          <div key={item.id} className="text-sm text-brand-600">
            <div className="flex justify-between gap-2">
              <span className="truncate">{item.name}</span>
              <span className="tnum">{item.percent}%</span>
            </div>
            <div className="mt-1 h-1.5 rounded-full bg-brand-100">
              <div className="h-1.5 rounded-full bg-accent-400 transition-all" style={{ width: `${item.percent}%` }} />
            </div>
          </div>
        ))}
        {proposal && proposal.media.length > 0 && (
          <WikiMediaGrid media={proposal.media} onRemove={removeMedia} />
        )}
      </div>

      <div className="space-y-3">
        <span className="label mb-0">Товары vdf.by</span>
        {proposal && proposal.products.length > 0 && (
          <ul className="space-y-2">
            {proposal.products.map((product) => (
              <li key={product.id} className="flex items-center gap-3">
                {product.imageUrl ? (
                  <img src={product.imageUrl} alt="" className="photo-bed h-10 w-10 rounded-control object-contain" />
                ) : (
                  <span className="photo-bed h-10 w-10 rounded-control" />
                )}
                <a href={product.url} target="_blank" rel="noreferrer" className="flex-1 text-sm text-brand-800 hover:underline">
                  {product.title}
                </a>
                <button
                  type="button"
                  onClick={() => removeProduct(product.id)}
                  className="btn-ghost px-2 py-2 text-red-600"
                  aria-label="Убрать товар"
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-brand-300" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Найти товар: линзы, рамка, стекло…"
            className="field pl-9"
          />
          {searching && <SpinnerIcon className="absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 animate-spin text-brand-300" />}
        </div>
        {results.length > 0 && (
          <ul className="max-h-72 space-y-1 overflow-y-auto rounded-control border border-brand-100 p-1">
            {results.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  disabled={attached.has(item.id)}
                  onClick={() => addProduct(item)}
                  className="flex w-full items-center gap-3 rounded-control px-2 py-1.5 text-left text-sm hover:bg-brand-50 disabled:opacity-50"
                >
                  {item.image ? (
                    <img src={item.image} alt="" className="photo-bed h-9 w-9 rounded-control object-contain" />
                  ) : (
                    <span className="photo-bed h-9 w-9 rounded-control" />
                  )}
                  <span className="flex-1 text-brand-800">{item.title}</span>
                  {attached.has(item.id) ? (
                    <span className="text-xs text-brand-400">добавлен</span>
                  ) : (
                    <PlusIcon className="h-4 w-4 text-brand-400" />
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {error && (
        <p className="flex items-start gap-2 whitespace-pre-line text-sm text-red-700">
          <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </p>
      )}
      {notice && !error && <p className="text-sm text-green-700">{notice}</p>}

      <div className="flex flex-wrap gap-2 border-t border-brand-100 pt-4">
        <button type="button" onClick={discard} disabled={Boolean(busy)} className="btn-ghost text-red-600">
          <TrashIcon className="h-4 w-4" />
          {proposal ? "Удалить черновик" : "Отмена"}
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={!hasContent || Boolean(busy) || uploads.length > 0}
          className="btn-primary sm:ml-auto"
        >
          {busy === "submit" ? <SpinnerIcon className="h-4 w-4 animate-spin" /> : <SendIcon className="h-4 w-4" />}
          Отправить на проверку
        </button>
      </div>
    </div>
  );
}
