"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Combobox, type ComboOption } from "@/components/Combobox";
import { AlertIcon, ChevronRightIcon, SearchIcon, SpinnerIcon } from "@/components/icons";

import { carTitle, errorText, wikiRequest } from "./api";
import { WikiCarView } from "./WikiCarView";
import type { CarOption, WikiCarKey, WikiEntrySummary, WikiProposal, WikiSection } from "./types";

const STATUS_LABEL: Record<WikiProposal["status"], string> = {
  DRAFT: "Черновик",
  PENDING: "На проверке",
  CHANGES_REQUESTED: "Нужно доработать",
  REVIEWED: "Принято",
  REJECTED: "Отклонено",
};

const STATUS_TONE: Record<WikiProposal["status"], string> = {
  DRAFT: "bg-brand-100 text-brand-700",
  PENDING: "bg-sky-100 text-sky-900",
  CHANGES_REQUESTED: "bg-amber-100 text-amber-900",
  REVIEWED: "bg-green-100 text-green-800",
  REJECTED: "bg-red-50 text-red-700",
};

function years(option: CarOption): string | undefined {
  if (!option.year_from) return undefined;
  return `${option.year_from}–${option.year_to ?? "н.в."}`;
}

function toOptions(list: CarOption[], withYears: boolean, filled: (id: string) => boolean): ComboOption[] {
  return list.map((item) => ({
    value: item.id,
    label: item.name,
    hint: withYears ? years(item) : undefined,
    mark: filled(item.id) ? "wiki" : undefined,
  }));
}

export function AccountWiki() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const markId = params.get("mark") ?? "";
  const modelId = params.get("model") ?? "";
  const generationId = params.get("generation") ?? "";
  const sectionId = params.get("section") || null;

  const [marks, setMarks] = useState<CarOption[]>([]);
  const [modelsOf, setModelsOf] = useState<{ key: string; list: CarOption[] }>({ key: "", list: [] });
  const [generationsOf, setGenerationsOf] = useState<{ key: string; list: CarOption[] }>({ key: "", list: [] });
  const [entries, setEntries] = useState<WikiEntrySummary[]>([]);
  const [sections, setSections] = useState<WikiSection[]>([]);
  const [proposals, setProposals] = useState<WikiProposal[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const navigate = useCallback(
    (next: { mark?: string; model?: string; generation?: string; section?: string | null }) => {
      const query = new URLSearchParams();
      if (next.mark) query.set("mark", next.mark);
      if (next.mark && next.model) query.set("model", next.model);
      if (next.mark && next.model && next.generation) query.set("generation", next.generation);
      if (next.generation && next.section) query.set("section", next.section);
      const suffix = query.toString();
      router.replace(suffix ? `${pathname}?${suffix}` : pathname, { scroll: false });
    },
    [pathname, router],
  );

  const loadLists = useCallback(
    () =>
      Promise.all([
        wikiRequest<{ entries: WikiEntrySummary[]; sections: WikiSection[] }>("/entries/"),
        wikiRequest<{ proposals: WikiProposal[] }>("/proposals/"),
      ])
        .then(([list, mine]) => {
          setEntries(list.entries);
          setSections([...list.sections].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)));
          setProposals(mine.proposals);
          setError("");
        })
        .catch((err) => setError(errorText(err)))
        .finally(() => setLoading(false)),
    [],
  );

  useEffect(() => {
    void loadLists();
    wikiRequest<{ data: CarOption[] }>("/cars/")
      .then((data) => setMarks(data.data))
      .catch((err) => setError(errorText(err)));
  }, [loadLists]);

  const modelsKey = markId;
  const generationsKey = markId && modelId ? `${markId}/${modelId}` : "";
  const models = useMemo(() => (modelsOf.key === modelsKey ? modelsOf.list : []), [modelsOf, modelsKey]);
  const generations = useMemo(
    () => (generationsOf.key === generationsKey ? generationsOf.list : []),
    [generationsOf, generationsKey],
  );

  useEffect(() => {
    if (!modelsKey) return;
    wikiRequest<{ data: CarOption[] }>(`/cars/?mark=${encodeURIComponent(modelsKey)}`)
      .then((data) => setModelsOf({ key: modelsKey, list: data.data }))
      .catch((err) => setError(errorText(err)));
  }, [modelsKey]);

  useEffect(() => {
    if (!generationsKey) return;
    const [mark, model] = generationsKey.split("/");
    wikiRequest<{ data: CarOption[] }>(`/cars/?mark=${encodeURIComponent(mark)}&model=${encodeURIComponent(model)}`)
      .then((data) => setGenerationsOf({ key: generationsKey, list: data.data }))
      .catch((err) => setError(errorText(err)));
  }, [generationsKey]);

  const carKey = useMemo<WikiCarKey | null>(
    () => (markId && modelId && generationId ? { markId, modelId, generationId } : null),
    [markId, modelId, generationId],
  );

  const filledKeys = useMemo(
    () => new Set(entries.map((e) => `${e.markId}/${e.modelId}/${e.generationId}`)),
    [entries],
  );
  const filledModels = useMemo(() => new Set(entries.map((e) => `${e.markId}/${e.modelId}`)), [entries]);
  const filledMarks = useMemo(() => new Set(entries.map((e) => e.markId)), [entries]);

  const carName = useMemo(() => {
    const mark = marks.find((m) => m.id === markId)?.name ?? "";
    const model = models.find((m) => m.id === modelId)?.name ?? "";
    const generation = generations.find((g) => g.id === generationId);
    const label = generation ? `${generation.name}${years(generation) ? ` (${years(generation)})` : ""}` : "";
    return [mark, model, label].filter(Boolean).join(" ");
  }, [marks, models, generations, markId, modelId, generationId]);

  const rework = proposals.filter((p) => p.status === "CHANGES_REQUESTED");
  const recent = proposals.filter((p) => p.status !== "CHANGES_REQUESTED").slice(0, 10);

  const visibleEntries = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const list = needle ? entries.filter((e) => carTitle(e).toLowerCase().includes(needle)) : entries;
    return list.slice(0, 200);
  }, [entries, search]);

  const openProposal = (p: WikiProposal) =>
    navigate({ mark: p.entry.markId, model: p.entry.modelId, generation: p.entry.generationId, section: p.sectionId });

  return (
    <div className="space-y-6">
      <section className="card space-y-3 p-5">
        <div>
          <h2 className="text-lg font-semibold text-brand-900">Wiki по автомобилям</h2>
          <p className="mt-1 text-sm text-brand-500">
            Как снимать фары, что ставить и на что обратить внимание. Знаете больше — допишите: после проверки
            информация появится у всех.
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          <Combobox
            value={markId}
            onChange={(value) => navigate({ mark: value })}
            options={toOptions(marks, false, (id) => filledMarks.has(id))}
            placeholder="Марка"
          />
          <Combobox
            value={modelId}
            onChange={(value) => navigate({ mark: markId, model: value })}
            options={toOptions(models, true, (id) => filledModels.has(`${markId}/${id}`))}
            placeholder="Модель"
            disabled={!markId}
          />
          <Combobox
            value={generationId}
            onChange={(value) => navigate({ mark: markId, model: modelId, generation: value })}
            options={toOptions(generations, true, (id) => filledKeys.has(`${markId}/${modelId}/${id}`))}
            placeholder="Поколение"
            disabled={!modelId}
          />
        </div>
      </section>

      {error && (
        <p className="card flex items-center gap-2 p-4 text-sm text-red-700">
          <AlertIcon className="h-4 w-4" />
          {error}
        </p>
      )}

      {rework.length > 0 && (
        <section className="card space-y-3 border-amber-200 p-5">
          <h3 className="font-semibold text-brand-900">Нужно доработать · {rework.length}</h3>
          <ul className="space-y-2">
            {rework.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => openProposal(p)}
                  className="flex w-full items-center gap-3 rounded-control bg-amber-50 px-3 py-2.5 text-left hover:bg-amber-100"
                >
                  <span className="flex-1">
                    <span className="block text-sm font-semibold text-brand-900">
                      {carTitle(p.entry)} · {p.sectionName ?? "Общее"}
                    </span>
                    <span className="mt-0.5 line-clamp-2 block text-sm text-brand-600">
                      {p.reviewNotes[p.reviewNotes.length - 1]?.text}
                    </span>
                  </span>
                  <ChevronRightIcon className="h-4 w-4 text-brand-400" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {carKey ? (
        <>
        <button type="button" onClick={() => navigate({})} className="btn-ghost -my-2 px-2 text-sm">
          ← Все автомобили
        </button>
        <WikiCarView
          key={`${carKey.markId}/${carKey.modelId}/${carKey.generationId}`}
          carKey={carKey}
          carName={carName}
          sections={sections}
          sectionId={sectionId}
          onSection={(section) => navigate({ mark: markId, model: modelId, generation: generationId, section })}
          onChanged={() => void loadLists()}
        />
        </>
      ) : (
        <>
          {recent.length > 0 && (
            <section className="card space-y-3 p-5">
              <h3 className="font-semibold text-brand-900">Ваша информация</h3>
              <ul className="divide-y divide-brand-100">
                {recent.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => openProposal(p)}
                      className="flex w-full items-center gap-3 py-2.5 text-left text-sm hover:text-brand-900"
                    >
                      <span className="flex-1 text-brand-800">
                        {carTitle(p.entry)} · {p.sectionName ?? "Общее"}
                      </span>
                      <span className={`badge ${STATUS_TONE[p.status]}`}>{STATUS_LABEL[p.status]}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="card space-y-3 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="font-semibold text-brand-900">
                Описанные автомобили <span className="tnum text-brand-400">{entries.length}</span>
              </h3>
              <div className="relative w-full sm:w-64">
                <SearchIcon className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-brand-300" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Поиск по машине"
                  className="field py-2 pl-9 text-sm"
                />
              </div>
            </div>
            {loading ? (
              <div className="flex justify-center py-8">
                <SpinnerIcon className="h-6 w-6 animate-spin text-brand-300" />
              </div>
            ) : visibleEntries.length === 0 ? (
              <p className="py-6 text-center text-sm text-brand-400">
                {search ? "Ничего не нашлось" : "Пока ничего не описано — выберите машину и добавьте первым"}
              </p>
            ) : (
              <ul className="divide-y divide-brand-100">
                {visibleEntries.map((e) => (
                  <li key={`${e.markId}/${e.modelId}/${e.generationId}`}>
                    <button
                      type="button"
                      onClick={() => navigate({ mark: e.markId, model: e.modelId, generation: e.generationId })}
                      className="flex w-full items-center gap-3 py-2.5 text-left text-sm text-brand-800 hover:text-brand-900"
                    >
                      <span className="flex-1">{carTitle(e)}</span>
                      {e.mediaCount > 0 && <span className="tnum text-xs text-brand-400">{e.mediaCount} фото/видео</span>}
                      <ChevronRightIcon className="h-4 w-4 text-brand-300" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
