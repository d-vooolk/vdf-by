import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { pipeline } from "node:stream/promises";

import { bumpCatalogVersion, bumpImagesVersion, DB_PATH, getDb } from "./db";
import { env } from "./env.mjs";
import { invalidateCatalog } from "./catalog";
import { createPanicEncryptStream, panicKeyUsable, verifyPanicPin } from "./panic-crypto";
import { panicGuard } from "./panic-guard";
import { revalidateSite } from "./revalidate";

const WIPE_TABLES = [
  "crm_payments",
  "crm_cancellations",
  "crm_outbox",
  "crm_pull",
  "orders",
  "service_requests",
  "sms_codes",
  "customer_sessions",
  "customers",
  "sessions",
  "ledger_writeoffs",
] as const;

const PROPAGATE_TIMEOUT_MS = 10_000;

let running = false;

function publicKey(): string {
  return env("PANIC_PUBLIC_KEY", "");
}

function pinHash(): string {
  return env("PANIC_PIN_HASH", "");
}

function isConfigured(): boolean {
  return Boolean(pinHash()) && panicKeyUsable(publicKey());
}

function panicRoot(): string {
  return env("PANIC_DIR", path.join(path.dirname(DB_PATH), "panic"));
}

function backupDir(): string {
  return env("BACKUP_DIR", path.join(path.dirname(DB_PATH), "backups"));
}

const ONE_OFF_NAME = /^shop[.-]before.*\.db(-wal|-shm)?$/;

async function encryptDatabase(outPath: string): Promise<void> {
  const tmpDb = `${outPath}.db.tmp`;
  await getDb().backup(tmpDb);
  try {
    const encrypt = createPanicEncryptStream(publicKey());
    await pipeline(fs.createReadStream(tmpDb), zlib.createGzip(), encrypt, fs.createWriteStream(outPath));
  } finally {
    await fs.promises.rm(tmpDb, { force: true }).catch(() => undefined);
    await fs.promises.rm(`${tmpDb}-wal`, { force: true }).catch(() => undefined);
    await fs.promises.rm(`${tmpDb}-shm`, { force: true }).catch(() => undefined);
  }
}

function wipeDatabase(): void {
  const db = getDb();
  db.transaction(() => {
    for (const table of WIPE_TABLES) db.prepare(`DELETE FROM ${table}`).run();
    db.prepare("UPDATE products SET data = json_remove(data, '$.costPrice', '$.costSource')").run();
    db.prepare("UPDATE frame_types SET cost_price = NULL, cost_source = NULL").run();
  })();
}

function scrubDisk(): void {
  const db = getDb();
  db.pragma("wal_checkpoint(TRUNCATE)");
  db.exec("VACUUM");
}

async function deleteLocalBackups(): Promise<void> {
  const dir = backupDir();
  await fs.promises.rm(dir, { recursive: true, force: true }).catch(() => undefined);
  await fs.promises.mkdir(dir, { recursive: true }).catch(() => undefined);
  const varDir = path.dirname(DB_PATH);
  const leftovers = await fs.promises.readdir(varDir).catch(() => [] as string[]);
  for (const name of leftovers) {
    if (ONE_OFF_NAME.test(name)) {
      await fs.promises.rm(path.join(varDir, name), { force: true }).catch(() => undefined);
    }
  }
}

async function requestRemoteWipe(): Promise<void> {
  const sentinel = path.join(path.dirname(DB_PATH), "panic-remote-wipe");
  await fs.promises.writeFile(sentinel, `${Date.now()}\n`).catch(() => undefined);
}

async function propagate(pin: string): Promise<void> {
  const url = env("CRM_URL", undefined);
  const key = env("CRM_INTEGRATION_KEY", undefined);
  if (!url || !key) return;
  try {
    const response = await fetch(`${url.replace(/\/+$/, "")}/api/integrations/panic`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-integration-key": key },
      body: JSON.stringify({ pin }),
      signal: AbortSignal.timeout(PROPAGATE_TIMEOUT_MS),
    });
    if (!response.ok) console.error(`panic: CRM ответила ${response.status} на передачу протокола`);
  } catch (error) {
    console.error("panic: не удалось передать протокол в CRM", error);
  }
}

export function panicConfigured(): boolean {
  return isConfigured();
}

export async function triggerPanic(pin: string, options: { propagate: boolean }): Promise<boolean> {
  if (!isConfigured()) {
    console.error("panic: протокол не настроен (PANIC_PUBLIC_KEY / PANIC_PIN_HASH)");
    return false;
  }
  if (panicGuard.isLocked()) {
    console.warn("panic: попытка во время блокировки");
    return false;
  }
  if (!verifyPanicPin(pin, pinHash())) {
    panicGuard.fail();
    console.warn("panic: неверный PIN");
    return false;
  }
  panicGuard.success();
  if (running) return true;
  running = true;

  const dir = path.join(panicRoot(), new Date().toISOString().replace(/[:.]/g, "-"));

  try {
    await fs.promises.mkdir(dir, { recursive: true });
    await encryptDatabase(path.join(dir, "database.db.gz.enc"));
  } catch (error) {
    running = false;
    console.error("panic: не удалось зашифровать базу, данные не удалены", error);
    await fs.promises.rm(dir, { recursive: true, force: true }).catch(() => undefined);
    return false;
  }

  try {
    wipeDatabase();
  } catch (error) {
    running = false;
    console.error("panic: не удалось очистить базу", error);
    return false;
  }

  const step = async (name: string, fn: () => void | Promise<void>) => {
    try {
      await fn();
    } catch (error) {
      console.error(`panic: ${name}`, error);
    }
  };

  await step("очистка диска", () => scrubDisk());
  await step("сброс кеша каталога", () => {
    invalidateCatalog();
    bumpCatalogVersion();
    bumpImagesVersion();
    revalidateSite();
  });
  await step("удаление локальных копий", () => deleteLocalBackups());
  await step("заявка на удаление копий в Google Drive", () => requestRemoteWipe());
  if (options.propagate) await step("передача протокола в CRM", () => propagate(pin));

  console.warn("panic: база зашифрована и очищена");
  running = false;
  return true;
}
