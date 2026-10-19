import { notFound, permanentRedirect } from "next/navigation";

import { bumpCatalogVersion, getDb } from "./db";

/**
 * Переадресация со старых адресов.
 *
 * Адрес страницы (slug) вообще-то менять не стоит — он уже в поиске и в
 * чужих ссылках. Но иногда приходится: товар переименовали из «Линзы Hella»
 * в «Линзы Aozoom», и адрес /product/linzy-hella/ теперь просто врёт.
 *
 * Поэтому смена адреса разрешена, но не бесплатна: старый адрес остаётся
 * жить здесь и отвечает постоянной переадресацией на новый. Поисковик
 * переносит на новую страницу накопленный вес, человек из закладки попадает
 * куда собирался, а не на 404.
 *
 * Где это срабатывает: в самих страницах товара и раздела, перед тем как
 * отдать 404 (см. src/app/(shop)/product/[slug]/page.tsx и соседние).
 * Не в proxy.ts — там переадресацию пришлось бы искать на каждый запрос к
 * витрине, а витрина обязана оставаться статикой из кеша. Здесь же лишний
 * запрос к базе достаётся только тем, кто и так шёл на несуществующий
 * адрес.
 */

/** Приводит адрес к тому виду, в котором живут все ссылки: с конечным слешем. */
function normalize(path: string): string {
  const trimmed = path.trim();
  if (!trimmed.startsWith("/")) return "";
  return trimmed.endsWith("/") ? trimmed : `${trimmed}/`;
}

/**
 * Запоминает переезд `from` → `to`.
 *
 * Три вещи происходят одной транзакцией, и каждая нужна:
 *
 *  1. Схлопывание цепочек. Если A когда-то переехал на B, а теперь B
 *     переезжает на C, то A должен вести сразу на C. Иначе через три
 *     переименования получится цепочка из трёх переадресаций, а поисковики
 *     перестают их проходить где-то на пятой.
 *  2. Сама запись о переезде.
 *  3. Удаление записи про `to`. Если раньше с этого адреса кто-то уезжал, а
 *     теперь по нему снова живая страница — переадресовывать с неё некуда.
 */
export function rememberRedirect(from: string, to: string): void {
  const source = normalize(from);
  const target = normalize(to);
  if (!source || !target || source === target) return;

  const db = getDb();
  db.transaction(() => {
    db.prepare("UPDATE redirects SET to_path = ? WHERE to_path = ?").run(
      target,
      source,
    );
    db.prepare(
      `INSERT INTO redirects (from_path, to_path, created_at) VALUES (?, ?, ?)
       ON CONFLICT(from_path) DO UPDATE SET
         to_path = excluded.to_path, created_at = excluded.created_at`,
    ).run(source, target, Date.now());
    db.prepare("DELETE FROM redirects WHERE from_path = ?").run(target);
  })();

  bumpCatalogVersion();
}

/**
 * Страницы больше нет — переадресации на неё тоже не нужны.
 * Вести человека со старого адреса на новый 404 хуже, чем сразу на старый.
 */
export function forgetRedirectsTo(path: string): void {
  const target = normalize(path);
  if (!target) return;
  getDb().prepare("DELETE FROM redirects WHERE to_path = ?").run(target);
}

/** Куда уехала страница с этого адреса. null — никуда, это честный 404. */
export function findRedirect(path: string): string | null {
  const source = normalize(path);
  if (!source) return null;

  const row = getDb()
    .prepare("SELECT to_path FROM redirects WHERE from_path = ?")
    .get(source) as { to_path: string } | undefined;

  return row?.to_path ?? null;
}

export function redirectOrNotFound(path: string): never {
  const target = findRedirect(path);
  if (target) permanentRedirect(target);
  notFound();
}
