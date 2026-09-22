"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";

import { deleteCarEntryAction, saveCarEntryAction } from "@/app/admin/actions";
import { Field, Problems } from "@/components/admin/form-parts";
import { SpinnerIcon, TrashIcon } from "@/components/icons";
import type { CarEntry, CarLevel } from "@/lib/car-types";

const LEVEL_TEXT: Record<
  CarLevel,
  { title: string; one: string; empty: string; placeholder: string; image?: string }
> = {
  mark: {
    title: "Марки",
    one: "марку",
    empty: "Марок нет",
    placeholder: "Например: КамАЗ",
    image: "Логотип",
  },
  model: {
    title: "Модели",
    one: "модель",
    empty: "Выберите марку слева",
    placeholder: "Например: 5490",
  },
  generation: {
    title: "Поколения",
    one: "поколение",
    empty: "Выберите модель слева",
    placeholder: "Например: I рестайлинг",
    image: "Фото",
  },
};

interface Draft {
  level: CarLevel;
  entry: CarEntry | null;
  name: string;
  yearFrom: string;
  yearTo: string;
  image: string;
  imageUrl: string;
}

async function loadEntries(level: CarLevel, parent?: string): Promise<CarEntry[]> {
  const query = new URLSearchParams({ level, ...(parent ? { parent } : {}) });
  const response = await fetch(`/admin/api/cars/?${query}`);
  if (!response.ok) throw new Error(`Сервер ответил ${response.status}`);
  const data = await response.json();
  return data.entries ?? [];
}

function yearsLabel(entry: CarEntry): string {
  if (!entry.yearFrom && !entry.yearTo) return "";
  return `${entry.yearFrom ?? "…"}–${entry.yearTo ?? "н.в."}`;
}

function toYear(text: string): number | null {
  const year = Number(text.trim());
  return text.trim() && Number.isInteger(year) ? year : null;
}

export function CarCatalogEditor() {
  const [marks, setMarks] = useState<CarEntry[] | null>(null);
  const [models, setModels] = useState<CarEntry[] | null>(null);
  const [generations, setGenerations] = useState<CarEntry[] | null>(null);
  const [markId, setMarkId] = useState<string | null>(null);
  const [modelId, setModelId] = useState<string | null>(null);
  const [manualOnly, setManualOnly] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();

  const reload = useCallback(async (level: CarLevel, parent?: string) => {
    const setters = { mark: setMarks, model: setModels, generation: setGenerations };
    setters[level](null);
    try {
      setters[level](await loadEntries(level, parent));
    } catch (error) {
      setProblems([(error as Error).message]);
      setters[level]([]);
    }
  }, []);

  useEffect(() => {
    loadEntries("mark")
      .then(setMarks)
      .catch((error: Error) => {
        setProblems([error.message]);
        setMarks([]);
      });
  }, []);

  const selectMark = (id: string) => {
    setMarkId(id);
    setModelId(null);
    setGenerations(null);
    reload("model", id);
  };

  const selectModel = (id: string) => {
    setModelId(id);
    reload("generation", id);
  };

  const parentOf = (level: CarLevel): string | undefined => {
    if (level === "model") return markId ?? undefined;
    if (level === "generation") return modelId ?? undefined;
    return undefined;
  };

  const openDraft = (level: CarLevel, entry: CarEntry | null) => {
    setProblems([]);
    setDraft({
      level,
      entry,
      name: entry?.name ?? "",
      yearFrom: entry?.yearFrom ? String(entry.yearFrom) : "",
      yearTo: entry?.yearTo ? String(entry.yearTo) : "",
      image: entry?.image ?? "",
      imageUrl: "",
    });
  };

  const save = () => {
    if (!draft) return;
    const { level, entry } = draft;
    const parent = parentOf(level);
    startTransition(async () => {
      const result = await saveCarEntryAction(level, {
        id: entry?.id,
        parentId: parent,
        name: draft.name,
        yearFrom: toYear(draft.yearFrom),
        yearTo: toYear(draft.yearTo),
        image: draft.image,
        imageUrl: draft.imageUrl.trim(),
      });
      if (!result.ok) {
        setProblems(result.problems);
        return;
      }
      setDraft(null);
      await reload(level, parent);
    });
  };

  const remove = (level: CarLevel, entry: CarEntry) => {
    if (
      !window.confirm(
        `Удалить «${entry.name}» вместе со всем, что внутри, и привязками товаров?`,
      )
    ) {
      return;
    }
    const parent = parentOf(level);
    startTransition(async () => {
      const result = await deleteCarEntryAction(level, entry.id);
      if (!result.ok) {
        setProblems(result.problems);
        return;
      }
      if (level === "mark" && markId === entry.id) {
        setMarkId(null);
        setModelId(null);
        setModels(null);
        setGenerations(null);
      }
      if (level === "model" && modelId === entry.id) {
        setModelId(null);
        setGenerations(null);
      }
      setDraft(null);
      await reload(level, parent);
    });
  };

  const selectedMark = marks?.find((entry) => entry.id === markId);
  const selectedModel = models?.find((entry) => entry.id === modelId);
  const locked = Boolean(draft?.entry && !draft.entry.manual);

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => setManualOnly((value) => !value)}
        className={manualOnly ? "btn-primary py-1.5 text-sm" : "btn-secondary py-1.5 text-sm"}
      >
        {manualOnly ? "Показаны только добавленные вручную" : "Только добавленные вручную"}
      </button>

      {!draft && <Problems items={problems} />}

      <div className="grid gap-4 lg:grid-cols-3">
        <Column
          level="mark"
          title={LEVEL_TEXT.mark.title}
          entries={marks}
          enabled
          selectedId={markId}
          manualOnly={manualOnly}
          onSelect={selectMark}
          onAdd={() => openDraft("mark", null)}
          onEdit={(entry) => openDraft("mark", entry)}
        />
        <Column
          level="model"
          title={selectedMark ? `Модели · ${selectedMark.name}` : LEVEL_TEXT.model.title}
          entries={models}
          enabled={Boolean(markId)}
          selectedId={modelId}
          manualOnly={manualOnly}
          onSelect={selectModel}
          onAdd={() => openDraft("model", null)}
          onEdit={(entry) => openDraft("model", entry)}
        />
        <Column
          level="generation"
          title={
            selectedModel
              ? `Поколения · ${selectedModel.name}`
              : LEVEL_TEXT.generation.title
          }
          entries={generations}
          enabled={Boolean(modelId)}
          selectedId={null}
          manualOnly={manualOnly}
          onSelect={(id) => {
            const entry = generations?.find((item) => item.id === id);
            if (entry) openDraft("generation", entry);
          }}
          onAdd={() => openDraft("generation", null)}
          onEdit={(entry) => openDraft("generation", entry)}
        />
      </div>

      {draft && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-brand-900/40 p-4"
          onClick={() => !pending && setDraft(null)}
        >
          <div
            className="card max-h-[90vh] w-full max-w-md space-y-4 overflow-y-auto p-5"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 className="text-lg font-semibold text-brand-900">
              {draft.entry ? "Изменить" : "Добавить"} {LEVEL_TEXT[draft.level].one}
            </h2>

            {locked && (
              <p className="rounded-xl bg-brand-50 p-3 text-xs text-brand-500">
                Запись из основного справочника: название и годы обновляются при
                импорте, поэтому здесь меняется только
                {draft.level === "mark" ? " логотип." : " фото."}
              </p>
            )}

            <Problems items={problems} />

            <Field label="Название">
              <input
                value={draft.name}
                autoFocus={!locked}
                disabled={locked}
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                placeholder={LEVEL_TEXT[draft.level].placeholder}
                className="field disabled:bg-brand-50 disabled:text-brand-400"
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Год начала">
                <input
                  value={draft.yearFrom}
                  inputMode="numeric"
                  disabled={locked}
                  onChange={(event) => setDraft({ ...draft, yearFrom: event.target.value })}
                  className="field tnum disabled:bg-brand-50 disabled:text-brand-400"
                />
              </Field>
              <Field label="Год окончания" hint="Пусто — выпускается">
                <input
                  value={draft.yearTo}
                  inputMode="numeric"
                  disabled={locked}
                  onChange={(event) => setDraft({ ...draft, yearTo: event.target.value })}
                  className="field tnum disabled:bg-brand-50 disabled:text-brand-400"
                />
              </Field>
            </div>

            {LEVEL_TEXT[draft.level].image && (
              <div className="space-y-2">
                <Field
                  label={`${LEVEL_TEXT[draft.level].image}: ссылка на картинку`}
                  hint="Прямая ссылка на файл, а не на страницу с ним. Скачаем к себе при сохранении."
                >
                  <input
                    value={draft.imageUrl}
                    onChange={(event) => setDraft({ ...draft, imageUrl: event.target.value })}
                    placeholder="https://example.com/car.jpg"
                    className="field"
                  />
                </Field>
                {draft.image && !draft.imageUrl.trim() && (
                  <div className="flex items-center gap-3">
                    {draft.entry?.image === draft.image && draft.entry.thumb && (
                      <img
                        src={draft.entry.thumb}
                        alt=""
                        className="h-16 w-24 rounded-lg border border-brand-100 object-contain"
                      />
                    )}
                    <button
                      type="button"
                      onClick={() => setDraft({ ...draft, image: "" })}
                      className="btn-ghost py-1.5 text-xs text-red-700 hover:bg-red-50"
                    >
                      Убрать фото
                    </button>
                  </div>
                )}
                {!draft.image && draft.entry?.pendingImage && !draft.imageUrl.trim() && (
                  <p className="text-xs text-brand-400">
                    Фото из справочника подтянется само при первой привязке товара.
                  </p>
                )}
              </div>
            )}

            <div className="flex items-center gap-2 pt-2">
              {draft.entry?.manual && (
                <button
                  type="button"
                  onClick={() => draft.entry && remove(draft.level, draft.entry)}
                  disabled={pending}
                  className="btn-ghost py-2 text-sm text-red-700 hover:bg-red-50"
                >
                  <TrashIcon className="h-4 w-4" />
                  Удалить
                </button>
              )}
              <button
                type="button"
                onClick={() => setDraft(null)}
                disabled={pending}
                className="btn-ghost ml-auto py-2 text-sm"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={save}
                disabled={pending}
                className="btn-primary py-2 text-sm"
              >
                {pending && <SpinnerIcon className="h-4 w-4 animate-spin" />}
                {draft.entry ? "Сохранить" : "Добавить"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface ColumnProps {
  level: CarLevel;
  title: string;
  entries: CarEntry[] | null;
  enabled: boolean;
  selectedId: string | null;
  manualOnly: boolean;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onEdit: (entry: CarEntry) => void;
}

function Column({
  level,
  title,
  entries,
  enabled,
  selectedId,
  manualOnly,
  onSelect,
  onAdd,
  onEdit,
}: ColumnProps) {
  const [query, setQuery] = useState("");
  const withImage = Boolean(LEVEL_TEXT[level].image);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (entries ?? []).filter(
      (entry) =>
        (!manualOnly || entry.manual) &&
        (!needle || entry.name.toLowerCase().includes(needle)),
    );
  }, [entries, query, manualOnly]);

  return (
    <section className="card flex h-[32rem] flex-col overflow-hidden">
      <div className="flex items-center justify-between gap-2 border-b border-brand-100 p-3">
        <h2 className="truncate text-sm font-semibold text-brand-900">
          {title}
          {enabled && entries && (
            <span className="tnum ml-1.5 font-normal text-brand-400">
              {visible.length}
            </span>
          )}
        </h2>
        <button
          type="button"
          onClick={onAdd}
          disabled={!enabled}
          className="btn-primary shrink-0 px-3 py-1 text-xs"
        >
          Добавить
        </button>
      </div>

      <div className="border-b border-brand-100 p-2">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          disabled={!enabled}
          placeholder="Поиск по названию"
          className="field py-1.5 text-sm"
        />
      </div>

      <ul className="flex-1 overflow-y-auto">
        {!enabled && (
          <li className="p-6 text-center text-sm text-brand-400">
            {LEVEL_TEXT[level].empty}
          </li>
        )}
        {enabled && entries === null && (
          <li className="flex justify-center p-6">
            <SpinnerIcon className="h-5 w-5 animate-spin text-brand-400" />
          </li>
        )}
        {enabled && entries && visible.length === 0 && (
          <li className="p-6 text-center text-sm text-brand-400">Ничего не найдено</li>
        )}
        {enabled &&
          visible.map((entry) => (
            <li key={entry.id}>
              <div
                className={`flex cursor-pointer items-center gap-3 px-3 py-2 text-sm transition-colors ${
                  selectedId === entry.id ? "bg-brand-100" : "hover:bg-brand-50"
                }`}
                onClick={() => onSelect(entry.id)}
              >
                {withImage &&
                  (entry.thumb ? (
                    <img
                      src={entry.thumb}
                      alt=""
                      loading="lazy"
                      className="h-9 w-12 shrink-0 rounded object-contain"
                    />
                  ) : (
                    <span className="flex h-9 w-12 shrink-0 items-center justify-center rounded bg-brand-50 text-xs text-brand-300">
                      —
                    </span>
                  ))}
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-brand-900">
                    {entry.name}
                    {entry.manual && (
                      <span className="badge ml-1.5 bg-amber-100 text-amber-800">
                        вручную
                      </span>
                    )}
                  </span>
                  {yearsLabel(entry) && (
                    <span className="block text-xs text-brand-400">
                      {yearsLabel(entry)}
                    </span>
                  )}
                </span>
                {(entry.manual || withImage) && (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onEdit(entry);
                    }}
                    className="btn-ghost shrink-0 px-2 py-1 text-xs"
                  >
                    Изменить
                  </button>
                )}
              </div>
            </li>
          ))}
      </ul>
    </section>
  );
}
