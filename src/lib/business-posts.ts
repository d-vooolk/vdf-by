import { getDb } from "./db";
import {
  escapeTelegram,
  getTelegramSettings,
  sendTelegramPhotoTo,
  sendTelegramTo,
  telegramConfigured,
} from "./telegram";

const SETTINGS_KEY = "business-posts:settings";
const MINSK_OFFSET_MS = 3 * 60 * 60 * 1000;
const MAX_ATTEMPTS = 10;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface BusinessPost {
  id: number;
  publishAt: number;
  title: string;
  body: string;
  imageUrl: string;
  linkUrl: string;
  sentAt: number | null;
  attempts: number;
  lastError: string | null;
}

export interface BusinessPostInput {
  publishAt: number;
  title: string;
  body: string;
  imageUrl: string;
  linkUrl: string;
}

export interface BusinessPostSettings {
  cabinetUrl: string;
}

interface BusinessPostRow {
  id: number;
  publish_at: number;
  title: string;
  body: string;
  image_url: string;
  link_url: string;
  sent_at: number | null;
  attempts: number;
  last_error: string | null;
}

function toPost(row: BusinessPostRow): BusinessPost {
  return {
    id: row.id,
    publishAt: row.publish_at,
    title: row.title,
    body: row.body,
    imageUrl: row.image_url,
    linkUrl: row.link_url,
    sentAt: row.sent_at,
    attempts: row.attempts,
    lastError: row.last_error,
  };
}

export function minskTime(year: number, month: number, day: number, hour: number, minute: number): number {
  return Date.UTC(year, month - 1, day, hour, minute) - MINSK_OFFSET_MS;
}

export function toMinskInput(time: number): string {
  return new Date(time + MINSK_OFFSET_MS).toISOString().slice(0, 16);
}

export function nextMorningInput(now = Date.now()): string {
  const today = new Date(now + MINSK_OFFSET_MS);
  return toMinskInput(
    minskTime(today.getUTCFullYear(), today.getUTCMonth() + 1, today.getUTCDate() + 1, 10, 0),
  );
}

export function fromMinskInput(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const [, year, month, day, hour, minute] = match.map(Number);
  return minskTime(year, month, day, hour, minute);
}

export function formatMinsk(time: number): string {
  return new Date(time).toLocaleString("ru-RU", {
    timeZone: "Europe/Minsk",
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function getBusinessPostSettings(): BusinessPostSettings {
  const row = getDb().prepare("SELECT value FROM settings WHERE key = ?").get(SETTINGS_KEY) as
    | { value: string }
    | undefined;
  const saved = row ? (JSON.parse(row.value) as Partial<BusinessPostSettings>) : {};
  return { cabinetUrl: saved.cabinetUrl ?? "" };
}

export function saveBusinessPostSettings(settings: BusinessPostSettings): void {
  getDb()
    .prepare(
      `INSERT INTO settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    )
    .run(SETTINGS_KEY, JSON.stringify(settings));
}

export function listBusinessPosts(): { upcoming: BusinessPost[]; sent: BusinessPost[] } {
  const rows = getDb()
    .prepare("SELECT * FROM business_posts ORDER BY publish_at, id")
    .all() as BusinessPostRow[];
  const posts = rows.map(toPost);
  return {
    upcoming: posts.filter((post) => post.sentAt === null),
    sent: posts.filter((post) => post.sentAt !== null).reverse(),
  };
}

export function getBusinessPost(id: number): BusinessPost | null {
  const row = getDb().prepare("SELECT * FROM business_posts WHERE id = ?").get(id) as BusinessPostRow | undefined;
  return row ? toPost(row) : null;
}

export function addBusinessPost(input: BusinessPostInput): number {
  const result = getDb()
    .prepare(
      `INSERT INTO business_posts (publish_at, title, body, image_url, link_url, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(input.publishAt, input.title, input.body, input.imageUrl, input.linkUrl, Date.now());
  return Number(result.lastInsertRowid);
}

export function updateBusinessPost(id: number, input: BusinessPostInput): void {
  getDb()
    .prepare(
      `UPDATE business_posts
       SET publish_at = ?, title = ?, body = ?, image_url = ?, link_url = ?, attempts = 0, last_error = NULL
       WHERE id = ?`,
    )
    .run(input.publishAt, input.title, input.body, input.imageUrl, input.linkUrl, id);
}

export function deleteBusinessPost(id: number): void {
  getDb().prepare("DELETE FROM business_posts WHERE id = ?").run(id);
}

export function requeueBusinessPost(id: number): void {
  getDb()
    .prepare("UPDATE business_posts SET sent_at = NULL, attempts = 0, last_error = NULL WHERE id = ?")
    .run(id);
}

function businessPostExists(publishAt: number, title: string): boolean {
  return Boolean(
    getDb().prepare("SELECT 1 FROM business_posts WHERE publish_at = ? AND title = ?").get(publishAt, title),
  );
}

export interface ParsedBusinessPost extends BusinessPostInput {
  heading: string;
}

const HEADING =
  /^(\d{1,2})\.(\d{1,2})(?:\.(\d{4}))?(?:\s+(\d{1,2}):(\d{2}))?\s+(?:[А-Яа-яЁё]{2}\s+)?[—–-]\s+(.+)$/;
const URL_IN_LINE = /(https?:\/\/\S+)/;

function minskYear(time: number): number {
  return new Date(time + MINSK_OFFSET_MS).getUTCFullYear();
}

function guessYear(month: number, day: number, hour: number, minute: number, now: number): number {
  const year = minskYear(now);
  const thisYear = minskTime(year, month, day, hour, minute);
  return thisYear < now - 60 * DAY_MS ? year + 1 : year;
}

function bodyFrom(lines: string[]): string {
  return lines
    .join("\n")
    .split(/\n\s*\n/)
    .map((paragraph) =>
      paragraph
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line && !/^-{3,}$/.test(line))
        .join(" "),
    )
    .filter(Boolean)
    .join("\n\n");
}

export function parseBusinessPostsMarkdown(markdown: string, defaultTime: string, now = Date.now()): ParsedBusinessPost[] {
  const [defaultHour, defaultMinute] = (/^(\d{1,2}):(\d{2})$/.exec(defaultTime.trim()) ?? ["", "10", "00"])
    .slice(1)
    .map(Number);
  const sections = markdown.replace(/\r\n/g, "\n").split(/^## /m).slice(1);
  const posts: ParsedBusinessPost[] = [];

  for (const section of sections) {
    const [headingLine, ...rest] = section.split("\n");
    const heading = HEADING.exec(headingLine.trim());
    if (!heading) continue;
    const day = Number(heading[1]);
    const month = Number(heading[2]);
    const hour = heading[4] ? Number(heading[4]) : defaultHour;
    const minute = heading[5] ? Number(heading[5]) : defaultMinute;
    const year = heading[3] ? Number(heading[3]) : guessYear(month, day, hour, minute, now);

    let imageUrl = "";
    let linkUrl = "";
    const bodyLines: string[] = [];
    for (const line of rest) {
      const bullet = /^\s*-\s+(.+)$/.exec(line);
      if (!bullet) {
        bodyLines.push(line);
        continue;
      }
      const url = URL_IN_LINE.exec(bullet[1])?.[1] ?? "";
      if (/^картинка/i.test(bullet[1])) imageUrl = url;
      else if (/^яндекс/i.test(bullet[1])) linkUrl = url;
    }

    posts.push({
      heading: headingLine.trim(),
      publishAt: minskTime(year, month, day, hour, minute),
      title: heading[6].trim(),
      body: bodyFrom(bodyLines),
      imageUrl,
      linkUrl,
    });
  }

  return posts;
}

export interface BusinessPostImportReport {
  added: number;
  duplicates: number;
  past: number;
  empty: number;
}

export function importBusinessPosts(posts: ParsedBusinessPost[], now = Date.now()): BusinessPostImportReport {
  const report: BusinessPostImportReport = { added: 0, duplicates: 0, past: 0, empty: 0 };
  const db = getDb();
  db.transaction(() => {
    for (const post of posts) {
      if (!post.body) report.empty += 1;
      else if (post.publishAt < now) report.past += 1;
      else if (businessPostExists(post.publishAt, post.title)) report.duplicates += 1;
      else {
        addBusinessPost(post);
        report.added += 1;
      }
    }
  })();
  return report;
}

async function deliver(post: BusinessPost): Promise<void> {
  const { token, chatId } = getTelegramSettings();
  const { cabinetUrl } = getBusinessPostSettings();
  const caption = `<b>Пора публиковать в Яндекс Бизнесе</b>\n${escapeTelegram(post.title)}`;

  let photoSent = false;
  if (post.imageUrl) {
    try {
      await sendTelegramPhotoTo(token, chatId, post.imageUrl, caption);
      photoSent = true;
    } catch {
      photoSent = false;
    }
  }
  if (!photoSent) {
    const imageLine = post.imageUrl ? `\nКартинка: ${escapeTelegram(post.imageUrl)}` : "";
    await sendTelegramTo(token, chatId, `${caption}${imageLine}`);
  }

  await sendTelegramTo(token, chatId, escapeTelegram(post.body));

  const details = [
    post.linkUrl ? `Ссылка для поля «Ссылка»:\n<code>${escapeTelegram(post.linkUrl)}</code>` : "",
    cabinetUrl
      ? `<a href="${escapeTelegram(cabinetUrl)}">Открыть публикации в Яндекс Бизнесе</a>`
      : "Ссылку на кабинет можно указать в админке: Посты в Яндексе",
  ].filter(Boolean);
  await sendTelegramTo(token, chatId, details.join("\n\n"));
}

function claim(id: number, now: number): boolean {
  const result = getDb()
    .prepare("UPDATE business_posts SET sent_at = ?, attempts = attempts + 1 WHERE id = ? AND sent_at IS NULL")
    .run(now, id);
  return result.changes === 1;
}

function release(id: number, error: string): void {
  getDb().prepare("UPDATE business_posts SET sent_at = NULL, last_error = ? WHERE id = ?").run(error, id);
}

function markDelivered(id: number): void {
  getDb().prepare("UPDATE business_posts SET last_error = NULL WHERE id = ?").run(id);
}

export async function sendBusinessPost(id: number): Promise<{ ok: boolean; reason?: string }> {
  if (!telegramConfigured()) return { ok: false, reason: "Telegram не настроен: Настройки → Telegram" };
  const post = getBusinessPost(id);
  if (!post) return { ok: false, reason: "Пост не найден" };
  if (!claim(id, Date.now())) return { ok: false, reason: "Пост уже отправлен" };
  try {
    await deliver(post);
    markDelivered(id);
    return { ok: true };
  } catch (error) {
    const reason = (error as Error).message;
    release(id, reason);
    return { ok: false, reason };
  }
}

export interface BusinessPostCronReport {
  due: number;
  sent: number;
  failed: Array<{ id: number; reason: string }>;
}

export async function sendDueBusinessPosts(now = Date.now()): Promise<BusinessPostCronReport> {
  const due = getDb()
    .prepare("SELECT id FROM business_posts WHERE sent_at IS NULL AND publish_at <= ? AND attempts < ? ORDER BY publish_at")
    .all(now, MAX_ATTEMPTS) as Array<{ id: number }>;
  const report: BusinessPostCronReport = { due: due.length, sent: 0, failed: [] };
  for (const { id } of due) {
    const result = await sendBusinessPost(id);
    if (result.ok) report.sent += 1;
    else report.failed.push({ id, reason: result.reason ?? "" });
  }
  return report;
}
