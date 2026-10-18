import fs from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";

import { env } from "./env.mjs";
// Схема и порядок миграций описаны один раз в migrations.mjs — оттуда же их
// берут консольные скрипты, которым TypeScript недоступен.
import { migrate } from "./migrations.mjs";

/**
 * Подключение к базе и миграции.
 *
 * SQLite, а не «взрослая» СУБД, потому что нагрузка магазина — это сотни
 * товаров и десятки заказов в день. Отдельный сервер БД тут нечего делать:
 * файл на диске рядом с приложением читается за микросекунды, бэкап — это
 * копирование одного файла, а поднимать после переустановки сервера нечего.
 *
 * Драйвер синхронный, и это осознанный выбор. Благодаря ему функции каталога
 * (getProducts, getProductBySlug и прочие) остались синхронными — страницы и
 * компоненты, написанные под чтение JSON с диска, не пришлось переделывать.
 *
 * Файл базы: ./var/shop.db (или DATABASE_PATH). Папка var/ не в репозитории
 * и переживает деплой — deploy.sh обновляет код рядом, но её не трогает.
 */

const DB_PATH = env("DATABASE_PATH", path.join(process.cwd(), "var", "shop.db"));

export const FRAME_IMAGE_DIR = path.join(path.dirname(DB_PATH), "frame-images");

/**
 * В dev Next перезагружает модули на каждое изменение файла. Без этого
 * тайника каждая перезагрузка открывала бы новое соединение, и через час
 * работы их накопились бы сотни.
 */
const globalForDb = globalThis as unknown as {
  __shopDb?: Database.Database;
};

export function getDb(): Database.Database {
  if (globalForDb.__shopDb) return globalForDb.__shopDb;

  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

  const db = new Database(DB_PATH);

  // WAL: читатели не блокируют писателя. Без него сохранение товара в админке
  // подвешивало бы отрисовку страницы, которую в этот момент открыл покупатель.
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  // Если запись всё-таки застала базу занятой — подождать, а не падать сразу.
  db.pragma("busy_timeout = 5000");
  // NORMAL вместо FULL: на порядок быстрее запись, а риск — потеря последней
  // транзакции только при отключении питания всего сервера (не при падении
  // процесса). Для каталога товаров размен выгодный.
  db.pragma("synchronous = NORMAL");

  migrate(db);

  globalForDb.__shopDb = db;
  return db;
}

/* ------------------------------------------------------------------ */
/* Версия каталога                                                     */
/* ------------------------------------------------------------------ */

/**
 * Счётчики правок. Кеши в catalog.ts и images.ts сверяют свой счётчик перед
 * выдачей и перечитывают базу, только если с прошлого раза что-то менялось.
 * Один дешёвый запрос вместо разбора всех товаров на каждый рендер.
 *
 * Счётчиков два, и это не педантизм: манифест фотографий с их размытыми
 * заглушками весит заметно больше каталога, и пересобирать его из-за правки
 * названия товара незачем.
 */
export function counterValue(name: string): number {
  const row = getDb()
    .prepare("SELECT value FROM settings WHERE key = ?")
    .get(`counter:${name}`) as { value: string } | undefined;
  return row ? Number(row.value) : 0;
}

export function bumpCounter(name: string): void {
  getDb()
    .prepare(
      `INSERT INTO settings (key, value) VALUES (?, '1')
       ON CONFLICT(key) DO UPDATE SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT)`,
    )
    .run(`counter:${name}`);
}

export const catalogVersion = () => counterValue("catalog");
export const bumpCatalogVersion = () => bumpCounter("catalog");
export const imagesVersion = () => counterValue("images");
export const bumpImagesVersion = () => bumpCounter("images");

/** Признак «база ещё пустая» — по нему решаем, предлагать ли импорт. */
export function isEmpty(): boolean {
  const row = getDb()
    .prepare("SELECT COUNT(*) AS n FROM categories")
    .get() as { n: number };
  return row.n === 0;
}
