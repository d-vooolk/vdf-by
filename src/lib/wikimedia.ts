import { getSite } from "./catalog";

const API = "https://commons.wikimedia.org/w/api.php";
const PREVIEW_WIDTH = 500;
const DOWNLOAD_WIDTH = 1920;
const MIN_WIDTH = 1200;
const WANTED = 24;
const THUMB_HOSTS = new Set(["upload.wikimedia.org", "thumb.wikimedia.org"]);

const UNWANTED_TITLE =
  /interior|innenraum|cockpit|dashboard|rear|heck|back view|engine|motor|wheel|felge|badge|emblem|logo|seat|trunk|kofferraum|tail|steering/i;
const FRONT_TITLE = /front|frontansicht|vorne|avant|anteriore|delantera/i;
const PURE_FRONT_TITLE = /front view|frontansicht|\bfront\b(?![ -]?(left|right|three|3\/4|quarter))/i;

export type LicenseKind = "free" | "by" | "by-sa";

export interface CommonsCandidate {
  title: string;
  thumb: string;
  width: number;
  height: number;
  author: string;
  license: string;
  licenseUrl: string;
  licenseKind: LicenseKind;
  sourceUrl: string;
}

export interface CommonsFile extends CommonsCandidate {
  downloadUrl: string;
}

interface ExtValue {
  value?: string;
}

interface ImageInfo {
  url?: string;
  thumburl?: string;
  width?: number;
  height?: number;
  mime?: string;
  descriptionurl?: string;
  extmetadata?: Record<string, ExtValue | undefined>;
}

interface CommonsPage {
  title: string;
  index?: number;
  imageinfo?: ImageInfo[];
}

interface CommonsResponse {
  query?: { pages?: Record<string, CommonsPage> };
  error?: { info?: string };
}

function userAgent(): string {
  const site = getSite();
  return `${site.name}-image-composer/1.0 (${site.url}; ${site.email})`;
}

export async function commonsFetch(url: string): Promise<Response> {
  return fetch(url, {
    headers: { "User-Agent": userAgent(), "Api-User-Agent": userAgent() },
    signal: AbortSignal.timeout(20000),
  });
}

export function isCommonsThumb(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && THUMB_HOSTS.has(parsed.hostname);
  } catch {
    return false;
  }
}

function plainText(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function licenseKind(license: string): LicenseKind | null {
  const name = license.trim();
  if (!name || /\bNC\b|\bND\b|non-?commercial|no-?deriv/i.test(name)) return null;
  if (/^(cc0|public domain|pd\b|pd-)/i.test(name)) return "free";
  if (/^cc[ -]by[ -]sa\b/i.test(name)) return "by-sa";
  if (/^cc[ -]by\b/i.test(name)) return "by";
  return null;
}

const KIND_RANK: Record<LicenseKind, number> = { free: 0, by: 1, "by-sa": 2 };

function toCandidate(page: CommonsPage): CommonsCandidate | null {
  const info = page.imageinfo?.[0];
  if (!info?.url || !info.width || !info.height) return null;
  if (!/^image\/(jpeg|png|webp)$/.test(info.mime ?? "")) return null;

  const meta = info.extmetadata ?? {};
  const license = plainText(meta.LicenseShortName?.value ?? "");
  const kind = licenseKind(license);
  if (!kind) return null;

  return {
    title: page.title,
    thumb: info.thumburl ?? info.url,
    width: info.width,
    height: info.height,
    author: plainText(meta.Artist?.value ?? meta.Credit?.value ?? "") || "неизвестен",
    license,
    licenseUrl: meta.LicenseUrl?.value ?? "",
    licenseKind: kind,
    sourceUrl: info.descriptionurl ?? "",
  };
}

function frontScore(title: string): number {
  if (PURE_FRONT_TITLE.test(title)) return 0;
  if (FRONT_TITLE.test(title)) return 1;
  return 2;
}

async function searchOnce(query: string): Promise<CommonsPage[]> {
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    generator: "search",
    gsrnamespace: "6",
    gsrlimit: "50",
    gsrsearch: `${query} filetype:bitmap`,
    prop: "imageinfo",
    iiprop: "url|size|mime|extmetadata",
    iiurlwidth: String(PREVIEW_WIDTH),
    iiextmetadatafilter: "LicenseShortName|LicenseUrl|Artist|Credit",
  });
  const response = await commonsFetch(`${API}?${params}`);
  if (!response.ok) throw new Error(`Wikimedia ответила ${response.status}`);
  const data = (await response.json()) as CommonsResponse;
  if (data.error) throw new Error(data.error.info ?? "Wikimedia вернула ошибку");
  return Object.values(data.query?.pages ?? {}).sort(
    (a, b) => (a.index ?? 0) - (b.index ?? 0),
  );
}

export async function searchCommons(queries: string[]): Promise<CommonsCandidate[]> {
  const seen = new Set<string>();
  const found: CommonsCandidate[] = [];

  for (const query of queries) {
    if (found.length >= WANTED) break;
    const pages = await searchOnce(query);
    for (const page of pages) {
      if (seen.has(page.title) || UNWANTED_TITLE.test(page.title)) continue;
      seen.add(page.title);
      const candidate = toCandidate(page);
      if (!candidate || candidate.width < MIN_WIDTH) continue;
      const ratio = candidate.width / candidate.height;
      if (ratio < 1.15 || ratio > 2.4) continue;
      found.push(candidate);
    }
  }

  return found
    .map((candidate, order) => ({ candidate, order }))
    .sort(
      (a, b) =>
        frontScore(a.candidate.title) - frontScore(b.candidate.title) ||
        KIND_RANK[a.candidate.licenseKind] - KIND_RANK[b.candidate.licenseKind] ||
        a.order - b.order,
    )
    .slice(0, WANTED)
    .map(({ candidate }) => candidate);
}

export async function commonsFile(title: string): Promise<CommonsFile> {
  if (!/^File:/.test(title)) throw new Error("Это не файл Wikimedia Commons");
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    titles: title,
    prop: "imageinfo",
    iiprop: "url|size|mime|extmetadata",
    iiurlwidth: String(DOWNLOAD_WIDTH),
    iiextmetadatafilter: "LicenseShortName|LicenseUrl|Artist|Credit",
  });
  const response = await commonsFetch(`${API}?${params}`);
  if (!response.ok) throw new Error(`Wikimedia ответила ${response.status}`);
  const data = (await response.json()) as CommonsResponse;
  const page = Object.values(data.query?.pages ?? {})[0];
  const file = page ? toCandidate(page) : null;
  const info = page?.imageinfo?.[0];
  if (!file || !info?.url) {
    throw new Error("Файл не найден или его лицензия не разрешает коммерческое использование");
  }
  return { ...file, downloadUrl: info.thumburl ?? info.url };
}
