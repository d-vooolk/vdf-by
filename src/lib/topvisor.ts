import fs from "node:fs";
import path from "node:path";

import { env } from "./env.mjs";
import { normalizeKeyword } from "./seo-keywords";

const CREDENTIALS_FILE = env("TOPVISOR_FILE", path.join(process.cwd(), "var", "topvisor.txt"));
const API = "https://api.topvisor.com/v2/json";
const CACHE_MS = 10 * 60 * 1000;
const HISTORY_DAYS = 14;

export interface TopvisorRegion {
  index: string;
  label: string;
}

export interface TopvisorPosition {
  position: number | null;
  url: string;
}

export interface TopvisorOverview {
  projectName: string;
  projectId: number;
  checkedOn: string | null;
  regions: TopvisorRegion[];
  positions: Map<string, Record<string, TopvisorPosition>>;
  competitors: string[];
}

interface ProjectRow {
  id: number;
  name: string;
  site: string;
  searchers?: Array<{ name: string; regions?: Array<{ index: string | number; name: string; device_name?: string }> }>;
}

interface HistoryResult {
  existsDates?: string[];
  keywords?: Array<{ name: string; positionsData?: Record<string, { position?: string; relevant_url?: string }> }>;
}

let cache: { at: number; value: TopvisorOverview | null; error: string } | null = null;

function credentials(): { userId: string; key: string } | null {
  try {
    const [userId, key] = fs.readFileSync(CREDENTIALS_FILE, "utf8").trim().split(/\s+/);
    return userId && key ? { userId, key } : null;
  } catch {
    return null;
  }
}

export function topvisorConfigured(): boolean {
  return credentials() !== null;
}

async function call<T>(method: string, body: unknown): Promise<T> {
  const auth = credentials();
  if (!auth) throw new Error("нет файла var/topvisor.txt");
  const response = await fetch(`${API}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Id": auth.userId, Authorization: `bearer ${auth.key}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });
  const json = (await response.json()) as { result?: T; errors?: Array<{ string?: string }> };
  if (json.errors?.length) throw new Error(json.errors.map((error) => error.string).join("; "));
  return json.result as T;
}

function parsePosition(value: string | undefined): number | null {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

async function load(): Promise<TopvisorOverview | null> {
  const projects = await call<ProjectRow[]>("get/projects_2/projects", {
    show_searchers_and_regions: 1,
    fields: ["id", "name", "site"],
  });
  const project = projects.find((entry) => /(^|\.)vdf\.by$/i.test(entry.site.replace(/^https?:\/\//, "").replace(/\/$/, "")));
  if (!project) return null;

  const regions: TopvisorRegion[] = (project.searchers ?? []).flatMap((searcher) =>
    (searcher.regions ?? []).map((region) => ({
      index: String(region.index),
      label: `${searcher.name === "Yandex" ? "Яндекс" : searcher.name} · ${region.name}${
        region.device_name && region.device_name !== "ПК" ? ` · ${region.device_name}` : ""
      }`,
    })),
  );

  const to = new Date();
  const from = new Date(to.getTime() - HISTORY_DAYS * 24 * 60 * 60 * 1000);
  const [history, competitors] = await Promise.all([
    call<HistoryResult>("get/positions_2/history", {
      project_id: project.id,
      regions_indexes: regions.map((region) => Number(region.index)),
      date1: from.toISOString().slice(0, 10),
      date2: to.toISOString().slice(0, 10),
      show_exists_dates: 1,
      positions_fields: ["position", "relevant_url"],
    }),
    call<Array<{ site: string }>>("get/projects_2/competitors", { project_id: project.id, fields: ["site"] }).catch(
      () => [],
    ),
  ]);

  const checkedOn = history.existsDates?.at(-1) ?? null;
  const positions = new Map<string, Record<string, TopvisorPosition>>();
  for (const keyword of history.keywords ?? []) {
    const byRegion: Record<string, TopvisorPosition> = {};
    for (const region of regions) {
      const cell = checkedOn ? keyword.positionsData?.[`${checkedOn}:${project.id}:${region.index}`] : undefined;
      byRegion[region.index] = {
        position: parsePosition(cell?.position),
        url: (cell?.relevant_url ?? "").replace(/^https?:\/\/(www\.)?vdf\.by/i, ""),
      };
    }
    positions.set(normalizeKeyword(keyword.name), byRegion);
  }

  return {
    projectName: project.name,
    projectId: project.id,
    checkedOn,
    regions,
    positions,
    competitors: competitors.map((entry) => entry.site),
  };
}

export async function topvisorOverview(): Promise<{ value: TopvisorOverview | null; error: string }> {
  if (!topvisorConfigured()) return { value: null, error: "" };
  if (cache && Date.now() - cache.at < CACHE_MS) return { value: cache.value, error: cache.error };
  try {
    const value = await load();
    cache = { at: Date.now(), value, error: value ? "" : "В Topvisor нет проекта для vdf.by" };
  } catch (error) {
    cache = { at: Date.now(), value: null, error: error instanceof Error ? error.message : String(error) };
  }
  return { value: cache.value, error: cache.error };
}
