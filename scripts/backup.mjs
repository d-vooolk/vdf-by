#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Database from "better-sqlite3";

import { env } from "../src/lib/env.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DB_PATH = env("DATABASE_PATH", path.join(ROOT, "var", "shop.db"));
const BACKUP_DIR = env("BACKUP_DIR", path.join(ROOT, "var", "backups"));
const BACKUP_NAME = /^shop-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}(-\d+)?\.db$/;
const DEFAULT_KEEP = 30;

function arg(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function fail(text) {
  console.error(`\n${text}\n`);
  process.exit(1);
}

function stamp(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    pad(date.getHours()),
    pad(date.getMinutes()),
  ].join("-");
}

function freeTarget() {
  const base = `shop-${stamp(new Date())}`;
  let candidate = path.join(BACKUP_DIR, `${base}.db`);
  for (let counter = 2; fs.existsSync(candidate); counter += 1) {
    candidate = path.join(BACKUP_DIR, `${base}-${counter}.db`);
  }
  return candidate;
}

function megabytes(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
}

const keepArg = arg("keep");
const keep = keepArg === undefined ? DEFAULT_KEEP : Number(keepArg);
if (!Number.isInteger(keep) || keep < 0) {
  fail("--keep ждёт целое число: сколько последних копий оставить (0 — не удалять старые)");
}

if (!fs.existsSync(DB_PATH)) {
  fail(`База не найдена: ${DB_PATH}`);
}

fs.mkdirSync(BACKUP_DIR, { recursive: true });
const target = freeTarget();

const source = new Database(DB_PATH, { readonly: true, fileMustExist: true });
try {
  await source.backup(target);
} catch (error) {
  fs.rmSync(target, { force: true });
  fail(`Копия не создалась: ${error.message}`);
} finally {
  source.close();
}

const copy = new Database(target);
copy.pragma("journal_mode = DELETE");
const integrity = copy.pragma("integrity_check", { simple: true });
const tables = copy
  .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('products', 'categories', 'orders', 'users')")
  .all()
  .map(({ name }) => `${name}: ${copy.prepare(`SELECT COUNT(*) AS count FROM "${name}"`).get().count}`);
copy.close();

if (integrity !== "ok") {
  fail(`Копия ${target} создана, но проверка целостности не прошла: ${integrity}`);
}

const shown = path.relative(ROOT, target).startsWith("..") ? target : path.relative(ROOT, target);
console.log(`Копия базы: ${shown} (${megabytes(fs.statSync(target).size)})`);
console.log(`Целостность: ok; ${tables.join(", ")}`);

if (keep > 0) {
  const stale = fs
    .readdirSync(BACKUP_DIR)
    .filter((name) => BACKUP_NAME.test(name))
    .map((name) => ({ name, time: fs.statSync(path.join(BACKUP_DIR, name)).mtimeMs }))
    .sort((a, b) => b.time - a.time)
    .slice(keep)
    .map(({ name }) => name);
  for (const name of stale) {
    for (const suffix of ["", "-wal", "-shm"]) {
      fs.rmSync(path.join(BACKUP_DIR, `${name}${suffix}`), { force: true });
    }
  }
  if (stale.length) {
    console.log(`Удалены старые копии (оставлено ${keep} последних): ${stale.length}`);
  }
}
