import crypto from "node:crypto";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { getDb } from "./db";
// Формат хеша описан один раз в password.mjs — оттуда же его берёт
// scripts/admin.mjs, который заводит администратора на сервере.
import { hashPassword, verifyPassword } from "./password.mjs";

export { hashPassword, verifyPassword };

/**
 * Вход в админку.
 *
 * Своя реализация вместо готовой библиотеки — потому что задача ровно одна:
 * пустить в админку владельца магазина. Внешних провайдеров, регистрации,
 * подтверждения почты и восстановления пароля здесь нет и не планируется, а
 * любая auth-библиотека тянет их за собой вместе со своей моделью данных.
 *
 * Как это устроено:
 *
 *   пароль   — scrypt со случайной солью; в базе только хеш;
 *   сессия   — 32 случайных байта в httpOnly-куке, в базе лежит её sha256.
 *
 * Хеш токена, а не сам токен, лежит в базе намеренно: если дамп базы утечёт,
 * из него нельзя собрать рабочую куку и зайти под чужой сессией.
 */

const COOKIE = "vdf_admin";
const SESSION_DAYS = 30;
const SESSION_MS = SESSION_DAYS * 24 * 60 * 60 * 1000;

/* ------------------------------------------------------------------ */
/* Пользователи                                                        */
/* ------------------------------------------------------------------ */

export interface AdminUser {
  id: number;
  login: string;
}

export function hasAdmin(): boolean {
  const row = getDb().prepare("SELECT COUNT(*) AS n FROM users").get() as {
    n: number;
  };
  return row.n > 0;
}

export function createAdmin(login: string, password: string): void {
  getDb()
    .prepare(
      "INSERT INTO users (login, password_hash, created_at) VALUES (?, ?, ?)",
    )
    .run(login.trim().toLowerCase(), hashPassword(password), Date.now());
}

export function setPassword(login: string, password: string): boolean {
  const result = getDb()
    .prepare("UPDATE users SET password_hash = ? WHERE login = ?")
    .run(hashPassword(password), login.trim().toLowerCase());
  return result.changes > 0;
}

/* ------------------------------------------------------------------ */
/* Защита от подбора пароля                                            */
/* ------------------------------------------------------------------ */

const attempts = new Map<string, number[]>();
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const ATTEMPT_LIMIT = 10;

function tooManyAttempts(key: string): boolean {
  const now = Date.now();
  const recent = (attempts.get(key) ?? []).filter(
    (time) => now - time < ATTEMPT_WINDOW_MS,
  );
  attempts.set(key, recent);
  return recent.length >= ATTEMPT_LIMIT;
}

function recordAttempt(key: string): void {
  const recent = attempts.get(key) ?? [];
  recent.push(Date.now());
  attempts.set(key, recent);
}

/* ------------------------------------------------------------------ */
/* Сессии                                                              */
/* ------------------------------------------------------------------ */

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/**
 * Хеш несуществующего пароля. Считается один раз при старте, чтобы попытка
 * входа под несуществующим логином занимала столько же времени, сколько под
 * существующим.
 */
const DUMMY_HASH = hashPassword(crypto.randomBytes(32).toString("hex"));

export type LoginResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Проверяет логин с паролем и ставит куку. Вызывается из Server Action,
 * поэтому имеет право писать куки.
 */
export async function login(
  login: string,
  password: string,
  userAgent: string,
): Promise<LoginResult> {
  const key = login.trim().toLowerCase();

  if (tooManyAttempts(key)) {
    return {
      ok: false,
      error: "Слишком много попыток. Подождите 15 минут.",
    };
  }

  const user = getDb()
    .prepare("SELECT id, login, password_hash FROM users WHERE login = ?")
    .get(key) as
    | { id: number; login: string; password_hash: string }
    | undefined;

  // Пароль проверяем даже когда пользователя нет: иначе несуществующий логин
  // отвечает мгновенно, а существующий — через 100 мс, и по этой разнице
  // логин можно угадать. Хеш-пустышка посчитан заранее — считать его здесь
  // значило бы выполнить scrypt дважды и создать ту же утечку наоборот.
  const valid = verifyPassword(password, user?.password_hash ?? DUMMY_HASH);

  if (!user || !valid) {
    recordAttempt(key);
    return { ok: false, error: "Неверный логин или пароль" };
  }

  attempts.delete(key);

  const token = crypto.randomBytes(32).toString("base64url");
  const expiresAt = Date.now() + SESSION_MS;

  const db = getDb();
  db.prepare(
    `INSERT INTO sessions (token_hash, user_id, created_at, expires_at, user_agent)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(hashToken(token), user.id, Date.now(), expiresAt, userAgent.slice(0, 300));
  db.prepare("UPDATE users SET last_login_at = ? WHERE id = ?").run(
    Date.now(),
    user.id,
  );

  // Заодно подчищаем протухшие сессии — отдельная задача по расписанию ради
  // одной строчки не нужна.
  db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(Date.now());

  const store = await cookies();
  store.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(expiresAt),
  });

  return { ok: true };
}

export async function logout(): Promise<void> {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (token) {
    getDb().prepare("DELETE FROM sessions WHERE token_hash = ?").run(
      hashToken(token),
    );
  }
  store.delete(COOKIE);
}

/**
 * Текущий администратор или null.
 *
 * Обёрнуто в react cache: за один рендер страницы функцию дёргают и layout, и
 * сама страница, и каждое действие — запрос к базе при этом ровно один.
 */
export const getAdmin = cache(async (): Promise<AdminUser | null> => {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (!token) return null;

  const row = getDb()
    .prepare(
      `SELECT u.id, u.login, s.expires_at
         FROM sessions s JOIN users u ON u.id = s.user_id
        WHERE s.token_hash = ?`,
    )
    .get(hashToken(token)) as
    | { id: number; login: string; expires_at: number }
    | undefined;

  if (!row) return null;

  if (row.expires_at < Date.now()) {
    getDb().prepare("DELETE FROM sessions WHERE token_hash = ?").run(
      hashToken(token),
    );
    return null;
  }

  return { id: row.id, login: row.login };
});

/**
 * Обязательная проверка перед любым действием админки.
 *
 * Проверка в proxy.ts не заменяет эту: Server Actions и route handlers —
 * это обычные POST-адреса, до них можно достучаться в обход интерфейса.
 * Поэтому каждое действие вызывает requireAdmin() у себя внутри.
 */
export async function requireAdmin(): Promise<AdminUser> {
  const admin = await getAdmin();
  if (!admin) redirect("/admin/login/");
  return admin;
}
