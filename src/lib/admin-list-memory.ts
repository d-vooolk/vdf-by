"use client";

const STORAGE_KEY = "admin:list-memory";
const CHANGE_EVENT = "admin:list-memory";

const LIST_PAGES = [
  "/admin/products",
  "/admin/incomplete",
  "/admin/out-of-stock",
  "/admin/frame-types",
  "/admin/orders",
  "/admin/customers",
  "/admin/articles",
  "/admin/categories",
];

const FRAME_TYPE_PAGE = /^\/admin\/frame-types\/(?!new$)[^/]+$/;

type Memory = Record<string, { url: string; at: number }>;

function trimSlash(pathname: string): string {
  return pathname.replace(/\/+$/, "") || "/";
}

function listKeyOf(pathname: string): string | null {
  const path = trimSlash(pathname);
  if (LIST_PAGES.includes(path)) return path;
  if (FRAME_TYPE_PAGE.test(path)) return path;
  return null;
}

function readMemory(): Memory {
  try {
    return JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "{}") as Memory;
  } catch {
    return {};
  }
}

export function rememberListLocation(): void {
  const key = listKeyOf(window.location.pathname);
  if (!key) return;
  const url = window.location.pathname + window.location.search;
  const memory = readMemory();
  if (memory[key]?.url === url) {
    memory[key].at = Date.now();
  } else {
    memory[key] = { url, at: Date.now() };
  }
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(memory));
  } catch {}
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function matchesSource(key: string, source: string): boolean {
  if (source.endsWith("/*")) return key.startsWith(source.slice(0, -1));
  return key === trimSlash(source);
}

export function rememberedListUrl(sources: string[]): string | null {
  const memory = readMemory();
  const candidates = Object.entries(memory)
    .filter(([key]) => sources.some((source) => matchesSource(key, source)))
    .sort(([, a], [, b]) => b.at - a.at);
  return candidates[0]?.[1].url ?? null;
}

export function subscribeListMemory(onChange: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => window.removeEventListener(CHANGE_EVENT, onChange);
}
