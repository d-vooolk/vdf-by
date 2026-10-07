import type { Metadata } from "next";
import Link from "next/link";

import { DashboardTabs } from "@/components/admin/DashboardTabs";
import { SeoKeywordsEditor } from "@/components/admin/SeoKeywordsEditor";
import { DataTable, formatDate, Panel } from "@/components/admin/SeoParts";
import { SeoTabs } from "@/components/admin/SeoTabs";
import type { KeywordGroup } from "@/lib/seo-keyword-types";
import { duplicateKeywords, normalizeKeyword, readKeywords } from "@/lib/seo-keywords";
import { topvisorOverview, type TopvisorOverview, type TopvisorPosition } from "@/lib/topvisor";

export const metadata: Metadata = { title: "SEO: ключевые фразы" };

interface PageProps {
  searchParams: Promise<{ edit?: string }>;
}

const PRIORITY_STYLE: Record<KeywordGroup["priority"], string> = {
  высокий: "bg-brand-700 text-white",
  средний: "bg-brand-100 text-brand-700",
  низкий: "bg-brand-50 text-brand-400",
};

function positionTone(position: number | null): string {
  if (position === null) return "text-brand-300";
  if (position <= 3) return "font-semibold text-green-700";
  if (position <= 10) return "font-semibold text-brand-900";
  if (position <= 30) return "text-amber-700";
  return "text-brand-400";
}

function PositionCell({ cell, target }: { cell: TopvisorPosition | undefined; target: string }) {
  if (!cell) return <span className="text-brand-300">—</span>;
  const wrongPage = cell.position !== null && cell.url && cell.url !== target;
  return (
    <span title={cell.url ? `В выдаче: ${cell.url}` : "Нет в топ-100"}>
      <span className={positionTone(cell.position)}>{cell.position ?? "—"}</span>
      {wrongPage && <span className="ml-1 text-amber-600" aria-label={`В выдаче другая страница: ${cell.url}`}>⚑</span>}
    </span>
  );
}

function GroupTable({ group, topvisor }: { group: KeywordGroup; topvisor: TopvisorOverview | null }) {
  const regions = topvisor?.regions ?? [];
  const headers = ["Фраза", "Целевая страница", ...regions.map((region) => region.label), ...(topvisor ? ["В Topvisor"] : [])];
  return (
    <Panel
      title={`${group.name} · ${group.keywords.length}`}
      note={group.note}
      actions={
        <span className="flex flex-wrap gap-1.5 text-xs">
          <span className={`rounded-md px-2 py-0.5 ${PRIORITY_STYLE[group.priority]}`}>{group.priority}</span>
          <span className="rounded-md bg-brand-50 px-2 py-0.5 text-brand-500">{group.intent}</span>
        </span>
      }
    >
      <DataTable
        headers={headers}
        align={["left", "left", ...regions.map(() => "right" as const), ...(topvisor ? ["right" as const] : [])]}
        rows={group.keywords.map((keyword) => {
          const target = keyword.url ?? group.url;
          const tracked = topvisor?.positions.get(normalizeKeyword(keyword.q));
          return [
            keyword.q,
            <a key="url" href={target} target="_blank" rel="noopener" className="font-mono text-xs break-all text-brand-500 hover:underline">
              {target}
            </a>,
            ...regions.map((region) => <PositionCell key={region.index} cell={tracked?.[region.index]} target={target} />),
            ...(topvisor ? [tracked ? <span key="tv" className="text-green-700">да</span> : <span key="tv" className="text-brand-300">нет</span>] : []),
          ];
        })}
      />
    </Panel>
  );
}

export default async function SeoKeywordsPage({ searchParams }: PageProps) {
  const { edit } = await searchParams;
  const data = readKeywords();
  const total = data.groups.reduce((sum, group) => sum + group.keywords.length, 0);
  const duplicates = duplicateKeywords(data);
  const { value: topvisor, error: topvisorError } = edit ? { value: null, error: "" } : await topvisorOverview();

  const listed = new Set(data.groups.flatMap((group) => group.keywords.map((keyword) => normalizeKeyword(keyword.q))));
  const trackedFromList = topvisor ? [...listed].filter((key) => topvisor.positions.has(key)).length : 0;
  const trackedOnly = topvisor ? [...topvisor.positions.keys()].filter((key) => !listed.has(key)) : [];

  return (
    <div className="space-y-6">
      <div>
        <DashboardTabs active="seo" />
        <h1 className="text-xl font-semibold text-brand-900">SEO</h1>
        <SeoTabs active="keywords" />
      </div>

      {edit ? (
        <SeoKeywordsEditor initial={data} />
      ) : (
        <>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="max-w-3xl text-sm text-brand-500">
              <p>
                Групп {data.groups.length}, фраз {total}. Список обновлён {formatDate(data.updatedAt || null)}. Файл на
                сервере: <code className="text-xs">var/seo-keywords.json</code>.
              </p>
              {data.note && <p className="mt-1">{data.note}</p>}
              {duplicates.length > 0 && (
                <p className="mt-1 text-amber-700">Фразы повторяются в нескольких группах: {duplicates.join(", ")}</p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <a href="/admin/api/seo-keywords/" className="btn-secondary py-2 text-sm">
                Скачать CSV для Topvisor
              </a>
              <Link href="/admin/seo/keywords/?edit=1" className="btn-primary py-2 text-sm">
                Редактировать список
              </Link>
            </div>
          </div>

          <Panel
            title="Topvisor"
            note={
              topvisor
                ? `Проект «${topvisor.projectName}», последняя проверка позиций: ${topvisor.checkedOn ?? "ещё не было"}. Позиции — на эту дату, ⚑ — в выдаче не та страница, что задана целевой.`
                : topvisorError || "Topvisor не подключён: нет файла var/topvisor.txt"
            }
          >
            {topvisor && (
              <DataTable
                headers={["Показатель", "Значение"]}
                rows={[
                  ["Фраз из списка уже отслеживается", `${trackedFromList} из ${listed.size}`],
                  ["Отслеживается, но нет в списке", trackedOnly.length ? trackedOnly.join(", ") : "нет"],
                  ["Регионы проверки", topvisor.regions.map((region) => region.label).join("; ")],
                  ["Конкуренты в проекте", topvisor.competitors.join(", ") || "не заданы"],
                ]}
              />
            )}
          </Panel>

          {data.groups.length === 0 ? (
            <p className="card p-10 text-center text-sm text-brand-400">Список пуст — нажмите «Редактировать список».</p>
          ) : (
            data.groups.map((group) => <GroupTable key={group.id} group={group} topvisor={topvisor} />)
          )}
        </>
      )}
    </div>
  );
}
