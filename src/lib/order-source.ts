export const SOURCE_COOKIE = "vdf_src";
export const SOURCE_MAX_AGE = 60 * 60 * 24 * 30;
export const DIRECT_SOURCE = "direct";

const KNOWN_HOSTS: Array<[RegExp, string]> = [
  [/(^|\.)gemini\.google\.com$/, "Gemini"],
  [/(^|\.)google\.[a-z.]+$/, "Google"],
  [/(^|\.)(yandex\.[a-z.]+|ya\.ru)$/, "Яндекс"],
  [/(^|\.)bing\.com$/, "Bing"],
  [/(^|\.)(go\.)?mail\.ru$/, "Mail.ru"],
  [/(^|\.)(chatgpt\.com|openai\.com)$/, "ChatGPT"],
  [/(^|\.)perplexity\.ai$/, "Perplexity"],
  [/(^|\.)deepseek\.com$/, "DeepSeek"],
  [/(^|\.)kufar\.by$/, "Kufar"],
  [/(^|\.)bamper\.by$/, "Bamper"],
  [/(^|\.)(instagram\.com)$/, "Instagram"],
  [/(^|\.)(facebook\.com|fb\.com)$/, "Facebook"],
  [/(^|\.)(t\.me|telegram\.org)$/, "Telegram"],
  [/(^|\.)(vk\.com|vk\.ru)$/, "ВКонтакте"],
  [/(^|\.)drive2\.(ru|com)$/, "Drive2"],
];

export function normalizeSource(value: string | undefined): string {
  const source = (value ?? "").toLowerCase().replace(/[^\p{L}\p{N}:._-]/gu, "").slice(0, 100);
  return source || DIRECT_SOURCE;
}

export const UNKNOWN_SOURCE_LABEL = "Не известно";

export function sourceLabel(source: string | null): string {
  if (!source) return UNKNOWN_SOURCE_LABEL;
  if (source === DIRECT_SOURCE) return "Прямые заходы";
  const utm = source.startsWith("utm:") ? source.slice(4) : null;
  const host = utm ?? source;
  const known = KNOWN_HOSTS.find(([pattern, label]) => pattern.test(host) || label.toLowerCase() === host);
  if (known) return known[1];
  return utm ? `utm: ${utm}` : host;
}

export function withUtmSource(url: string, source: string): string {
  const link = new URL(url);
  link.searchParams.set("utm_source", source);
  return link.toString();
}
