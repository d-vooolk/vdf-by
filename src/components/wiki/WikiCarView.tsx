"use client";

import { useCallback, useEffect, useState } from "react";

import { AlertIcon, ClockIcon, PencilIcon, PlusIcon, SpinnerIcon } from "@/components/icons";

import { carQuery, carTitle, errorText, wikiRequest } from "./api";
import { ReviewNotes } from "./ReviewNotes";
import { WikiMediaGrid } from "./WikiMediaGrid";
import { WikiProposalEditor } from "./WikiProposalEditor";
import type { WikiCarKey, WikiEntry, WikiProposal, WikiSection } from "./types";

const GENERAL = "general";

export function WikiCarView({
  carKey,
  carName,
  sections,
  sectionId,
  onSection,
  onChanged,
}: {
  carKey: WikiCarKey;
  carName: string;
  sections: WikiSection[];
  sectionId: string | null;
  onSection: (sectionId: string | null) => void;
  onChanged: () => void;
}) {
  const [entry, setEntry] = useState<WikiEntry | null>(null);
  const [proposals, setProposals] = useState<WikiProposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [photo, setPhoto] = useState<"loading" | "ready" | "error">("loading");

  const load = useCallback(
    () =>
      wikiRequest<{ entry: WikiEntry | null; proposals: WikiProposal[] }>(`/entry/?${carQuery(carKey)}`)
        .then((data) => {
          setEntry(data.entry);
          setProposals(data.proposals);
          setError("");
        })
        .catch((err) => setError(errorText(err)))
        .finally(() => setLoading(false)),
    [carKey],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const refresh = async () => {
    await load();
    onChanged();
  };

  const tabs = [{ id: null as string | null, name: "Общее" }, ...sections.map((s) => ({ id: s.id as string | null, name: s.name }))];
  const textOf = (id: string | null) =>
    id ? (entry?.sections.find((s) => s.sectionId === id)?.content ?? "") : (entry?.content ?? "");
  const mediaOf = (id: string | null) => entry?.media.filter((m) => (m.sectionId ?? null) === id) ?? [];
  const productsOf = (id: string | null) => entry?.products.filter((p) => (p.sectionId ?? null) === id) ?? [];
  const filled = (id: string | null) => Boolean(textOf(id).trim()) || mediaOf(id).length > 0;
  const proposalOf = (id: string | null) => proposals.find((p) => (p.sectionId ?? null) === id) ?? null;

  const current = tabs.find((tab) => tab.id === sectionId) ?? tabs[0];
  const text = textOf(current.id);
  const media = mediaOf(current.id);
  const products = productsOf(current.id);
  const proposal = proposalOf(current.id);
  const canEdit = !proposal || proposal.status === "DRAFT" || proposal.status === "CHANGES_REQUESTED";

  return (
    <section className="space-y-4">
      <div className="card p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-5">
          {photo !== "error" && (
            <img
              src={`/api/account/wiki/photo/?${carQuery(carKey)}`}
              alt=""
              onLoad={() => setPhoto("ready")}
              onError={() => setPhoto("error")}
              className={`photo-bed aspect-[105/65] w-full shrink-0 rounded-control object-cover object-[center_45%] transition-opacity duration-500 motion-reduce:transition-none sm:w-1/3 ${
                photo === "ready" ? "opacity-100" : "opacity-0"
              }`}
            />
          )}
          <div className="min-w-0">
            <p className="eyebrow">Wiki</p>
            <h2 className="mt-1 text-xl font-semibold break-words text-brand-900">{entry ? carTitle(entry) : carName}</h2>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-1 border-b border-brand-100 pb-2">
          {tabs.map((tab) => {
            const active = tab.id === current.id;
            const own = proposalOf(tab.id);
            return (
              <button
                key={tab.id ?? GENERAL}
                type="button"
                onClick={() => {
                  setEditing(false);
                  onSection(tab.id);
                }}
                className={`flex items-center gap-1.5 rounded-control px-3 py-1.5 text-sm font-medium transition-colors ${
                  active ? "bg-brand-100 text-brand-900" : "text-brand-500 hover:bg-brand-50 hover:text-brand-800"
                }`}
              >
                {tab.name}
                {own ? (
                  <span
                    className={`h-2 w-2 rounded-full ${own.status === "CHANGES_REQUESTED" ? "bg-amber-500" : "bg-sky-500"}`}
                  />
                ) : (
                  !filled(tab.id) && <span className="h-1.5 w-1.5 rounded-full bg-brand-200" />
                )}
              </button>
            );
          })}
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <SpinnerIcon className="h-6 w-6 animate-spin text-brand-300" />
          </div>
        ) : error ? (
          <p className="flex items-center gap-2 py-6 text-sm text-red-700">
            <AlertIcon className="h-4 w-4" />
            {error}
          </p>
        ) : (
          <div className="space-y-5 pt-5">
            {text.trim() ? (
              <div className="whitespace-pre-wrap text-[15px] leading-relaxed text-brand-800">{text}</div>
            ) : (
              <p className="text-sm text-brand-400">В этом разделе пока ничего не описано.</p>
            )}

            {media.length > 0 && <WikiMediaGrid media={media} />}

            {products.length > 0 && (
              <div className="space-y-2">
                <p className="label">Товары</p>
                <ul className="space-y-2">
                  {products.map((product) => (
                    <li key={product.id}>
                      <a
                        href={product.url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-3 rounded-control p-1 text-sm text-brand-800 hover:bg-brand-50"
                      >
                        {product.imageUrl ? (
                          <img src={product.imageUrl} alt="" className="photo-bed h-11 w-11 rounded-control object-contain" />
                        ) : (
                          <span className="photo-bed h-11 w-11 rounded-control" />
                        )}
                        {product.title}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      {!loading && !error && proposal?.status === "PENDING" && (
        <div className="card flex items-start gap-3 border-sky-200 bg-sky-50 p-4 text-sm text-sky-900">
          <ClockIcon className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-semibold">Ваша информация на проверке</p>
            <p className="mt-0.5">
              Раздел «{current.name}» обновится, когда мы её проверим. Если что-то нужно уточнить — напишем здесь.
            </p>
          </div>
        </div>
      )}

      {!loading && !error && !editing && proposal?.status === "CHANGES_REQUESTED" && (
        <div className="card space-y-3 border-amber-200 p-4">
          <p className="font-semibold text-brand-900">Нужно доработать</p>
          <ReviewNotes notes={proposal.reviewNotes} />
          <button type="button" onClick={() => setEditing(true)} className="btn-primary">
            <PencilIcon className="h-4 w-4" />
            Исправить
          </button>
        </div>
      )}

      {!loading && !error && editing && canEdit && (
        <WikiProposalEditor
          key={current.id ?? GENERAL}
          carKey={carKey}
          sectionId={current.id}
          sectionName={current.name}
          proposal={proposal}
          onChanged={refresh}
          onClose={() => setEditing(false)}
        />
      )}

      {!loading && !error && !editing && canEdit && proposal?.status !== "CHANGES_REQUESTED" && (
        <button type="button" onClick={() => setEditing(true)} className="btn-primary w-full sm:w-auto">
          {proposal ? <PencilIcon className="h-4 w-4" /> : <PlusIcon className="h-4 w-4" />}
          {proposal ? "Продолжить черновик" : "Добавить информацию по автомобилю"}
        </button>
      )}
    </section>
  );
}
