"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { saveSeoKeywordsAction } from "@/app/admin/seo-actions";
import { Problems } from "@/components/admin/form-parts";
import { SpinnerIcon, TrashIcon } from "@/components/icons";
import {
  KEYWORD_INTENTS,
  KEYWORD_PRIORITIES,
  type KeywordGroup,
  type KeywordsFile,
} from "@/lib/seo-keyword-types";

interface DraftGroup extends Omit<KeywordGroup, "keywords"> {
  keywordsText: string;
}

function toText(group: KeywordGroup): string {
  return group.keywords.map((keyword) => (keyword.url ? `${keyword.q} | ${keyword.url}` : keyword.q)).join("\n");
}

function fromText(text: string): KeywordGroup["keywords"] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [q, url] = line.split("|").map((part) => part.trim());
      return url ? { q, url } : { q };
    });
}

function newGroupId(groups: DraftGroup[]): string {
  let index = groups.length + 1;
  while (groups.some((group) => group.id === `group-${index}`)) index += 1;
  return `group-${index}`;
}

export function SeoKeywordsEditor({ initial }: { initial: KeywordsFile }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [problems, setProblems] = useState<string[]>([]);
  const [note, setNote] = useState(initial.note);
  const [groups, setGroups] = useState<DraftGroup[]>(() =>
    initial.groups.map(({ keywords, ...group }) => ({ ...group, keywordsText: toText({ ...group, keywords }) })),
  );

  const update = (index: number, patch: Partial<DraftGroup>) =>
    setGroups((current) => current.map((group, i) => (i === index ? { ...group, ...patch } : group)));

  const move = (from: number, to: number) =>
    setGroups((current) => {
      if (to < 0 || to >= current.length) return current;
      const next = [...current];
      const [group] = next.splice(from, 1);
      next.splice(to, 0, group);
      return next;
    });

  const total = groups.reduce((sum, group) => sum + fromText(group.keywordsText).length, 0);

  const save = () => {
    setProblems([]);
    startTransition(async () => {
      const result = await saveSeoKeywordsAction({
        note,
        groups: groups.map(({ keywordsText, ...group }) => ({ ...group, keywords: fromText(keywordsText) })),
      });
      if (!result.ok) {
        setProblems(result.problems);
        return;
      }
      router.push("/admin/seo/keywords/");
    });
  };

  return (
    <div className="space-y-4">
      <Problems items={problems} />

      <label className="card block p-4">
        <span className="label">Общее пояснение к списку</span>
        <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={2} className="field text-sm" />
      </label>

      {groups.map((group, index) => (
        <section key={group.id} className="card space-y-3 p-4">
          <div className="flex flex-wrap items-end gap-3">
            <label className="min-w-48 flex-1">
              <span className="label">Группа</span>
              <input value={group.name} onChange={(event) => update(index, { name: event.target.value })} className="field py-2 text-sm" />
            </label>
            <label className="min-w-56 flex-1">
              <span className="label">Целевая страница</span>
              <input
                value={group.url}
                onChange={(event) => update(index, { url: event.target.value })}
                placeholder="/catalog/…/"
                className="field py-2 font-mono text-xs"
              />
            </label>
            <label>
              <span className="label">Приоритет</span>
              <select
                value={group.priority}
                onChange={(event) => update(index, { priority: event.target.value as DraftGroup["priority"] })}
                className="field py-2 text-sm"
              >
                {KEYWORD_PRIORITIES.map((priority) => (
                  <option key={priority}>{priority}</option>
                ))}
              </select>
            </label>
            <label>
              <span className="label">Тип</span>
              <select
                value={group.intent}
                onChange={(event) => update(index, { intent: event.target.value as DraftGroup["intent"] })}
                className="field py-2 text-sm"
              >
                {KEYWORD_INTENTS.map((intent) => (
                  <option key={intent}>{intent}</option>
                ))}
              </select>
            </label>
            <div className="flex gap-1">
              <button type="button" onClick={() => move(index, index - 1)} disabled={index === 0} title="Выше" className="btn-ghost px-2 py-2 text-xs disabled:opacity-30">
                ↑
              </button>
              <button
                type="button"
                onClick={() => move(index, index + 1)}
                disabled={index === groups.length - 1}
                title="Ниже"
                className="btn-ghost px-2 py-2 text-xs disabled:opacity-30"
              >
                ↓
              </button>
              <button
                type="button"
                onClick={() => setGroups((current) => current.filter((_, i) => i !== index))}
                title="Удалить группу"
                className="btn-ghost px-2 py-2 text-red-700"
              >
                <TrashIcon className="h-4 w-4" />
              </button>
            </div>
          </div>
          <label className="block">
            <span className="label">Пояснение</span>
            <input value={group.note} onChange={(event) => update(index, { note: event.target.value })} className="field py-2 text-sm" />
          </label>
          <label className="block">
            <span className="label">
              Фразы — по одной в строке ({fromText(group.keywordsText).length}). Своя страница для фразы: «фраза | /адрес/»
            </span>
            <textarea
              value={group.keywordsText}
              onChange={(event) => update(index, { keywordsText: event.target.value })}
              rows={Math.min(18, Math.max(4, group.keywordsText.split("\n").length + 1))}
              className="field font-mono text-xs"
            />
          </label>
        </section>
      ))}

      <div className="sticky bottom-0 z-10 flex flex-wrap items-center gap-3 border-t border-brand-100 bg-white/95 py-3 backdrop-blur">
        <button
          type="button"
          onClick={() =>
            setGroups((current) => [
              ...current,
              {
                id: newGroupId(current),
                name: "Новая группа",
                url: "/",
                priority: "средний",
                intent: "коммерческий",
                note: "",
                keywordsText: "",
              },
            ])
          }
          className="btn-secondary py-2 text-sm"
        >
          + Группа
        </button>
        <span className="tnum text-sm text-brand-500">
          Групп {groups.length}, фраз {total}
        </span>
        <div className="ml-auto flex gap-2">
          <Link href="/admin/seo/keywords/" className="btn-ghost py-2 text-sm">
            Отмена
          </Link>
          <button type="button" onClick={save} disabled={pending} className="btn-primary py-2 text-sm">
            {pending && <SpinnerIcon className="h-4 w-4 animate-spin" />}
            Сохранить список
          </button>
        </div>
      </div>
    </div>
  );
}
