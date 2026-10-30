#!/usr/bin/env node
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import readline from "node:readline";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

import Database from "better-sqlite3";

import { AI_BOTS, botOf, parseLogLine, SCANNER_PATH, SKIP_PATH, STATIC_PATH } from "../src/lib/ai-seo-shared.mjs";
import { env } from "../src/lib/env.mjs";
import { openDatabase } from "../src/lib/migrations.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DB_FILE = env("DATABASE_PATH", path.join(ROOT, "var", "shop.db"));
const LOG_DIR = env("NGINX_LOG_DIR", "/var/log/nginx");
const LOG_FILE = /^vdf\.by\.access\.log(\.\d+(\.gz)?)?$/;
const KEEP_DAYS = 800;
const DAY_MS = 24 * 60 * 60 * 1000;

function toBig(ip) {
  if (net.isIPv4(ip)) return { v: 4, n: ip.split(".").reduce((acc, part) => (acc << 8n) + BigInt(part), 0n) };
  const [head, tail = ""] = ip.split("::");
  const left = head ? head.split(":") : [];
  const right = tail ? tail.split(":") : [];
  const parts = ip.includes("::") ? [...left, ...Array(8 - left.length - right.length).fill("0"), ...right] : left;
  return { v: 6, n: parts.reduce((acc, part) => (acc << 16n) + BigInt(parseInt(part || "0", 16)), 0n) };
}

function toRange(cidr) {
  const [ip, bits] = cidr.split("/");
  const { v, n } = toBig(ip);
  const shift = (v === 4 ? 32n : 128n) - BigInt(bits);
  const from = (n >> shift) << shift;
  return { v, from, to: from + (1n << shift) - 1n };
}

async function loadRanges(url) {
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "vdf.by ai-seo" },
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    return (data.prefixes ?? []).map((prefix) => prefix.ipv4Prefix ?? prefix.ipv6Prefix).filter(Boolean).map(toRange);
  } catch (error) {
    console.error(`список IP ${url}: ${error.message}`);
    return null;
  }
}

function inRanges(ip, ranges) {
  if (!net.isIP(ip)) return false;
  const { v, n } = toBig(ip);
  return ranges.some((range) => range.v === v && n >= range.from && n <= range.to);
}

async function* lines(file) {
  const stream = fs.createReadStream(file);
  const input = file.endsWith(".gz") ? stream.pipe(zlib.createGunzip()) : stream;
  yield* readline.createInterface({ input, crlfDelay: Infinity });
}

const official = new Map();
for (const bot of AI_BOTS.filter((entry) => entry.ips)) {
  const lists = await Promise.all(bot.ips.map(loadRanges));
  if (lists.every(Boolean)) official.set(bot.id, lists.flat());
}

const scanners = new Set();
const candidates = [];
const seenDays = new Set();
const files = fs.readdirSync(LOG_DIR).filter((name) => LOG_FILE.test(name)).map((name) => path.join(LOG_DIR, name));
for (const file of files) {
  for await (const line of lines(file)) {
    const hit = parseLogLine(line);
    if (!hit) continue;
    seenDays.add(hit.day);
    if (SCANNER_PATH.test(hit.path)) scanners.add(hit.ip);
    const bot = botOf(hit.ua);
    if (bot && hit.status < 400 && !STATIC_PATH.test(hit.path) && !SKIP_PATH.test(hit.path)) {
      candidates.push({ ...hit, bot: bot.id });
    }
  }
}

const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Minsk" }).format(new Date());
const days = [...seenDays].filter((day) => day < today).sort();
const counts = new Map();
let fakes = 0;
for (const hit of candidates) {
  if (hit.day >= today) continue;
  const ranges = official.get(hit.bot);
  const real = ranges ? inRanges(hit.ip, ranges) : !scanners.has(hit.ip);
  if (!real) {
    fakes += 1;
    continue;
  }
  const page = hit.path.toLowerCase().replace(/\/+$/, "") || "/";
  const key = `${hit.day}\t${hit.bot}\t${page}`;
  counts.set(key, (counts.get(key) ?? 0) + 1);
}

const db = openDatabase(Database, DB_FILE);
const existing = new Set(db.prepare("SELECT DISTINCT day FROM ai_bot_hits").all().map((row) => row.day));
const writable = days.filter((day, index) => index > 0 || !existing.has(day));
const daysWithHits = new Set([...counts.keys()].map((key) => key.split("\t")[0]));
db.transaction(() => {
  const remove = db.prepare("DELETE FROM ai_bot_hits WHERE day = ?");
  for (const day of writable) remove.run(day);
  const insert = db.prepare("INSERT INTO ai_bot_hits (day, bot, path, hits) VALUES (?, ?, ?, ?)");
  for (const [key, n] of counts) {
    const [day, bot, page] = key.split("\t");
    if (writable.includes(day)) insert.run(day, bot, page, n);
  }
  for (const day of writable) if (!daysWithHits.has(day)) insert.run(day, "-", "-", 0);
  const oldest = new Date(Date.now() - KEEP_DAYS * DAY_MS).toISOString().slice(0, 10);
  db.prepare("DELETE FROM ai_bot_hits WHERE day < ?").run(oldest);
})();
db.close();

const counted = [...counts.values()].reduce((sum, n) => sum + n, 0);
console.log(
  `${new Date().toISOString()} ИИ-боты: файлов ${files.length}, дней ${writable.length} ` +
    `(${writable[0] ?? "—"} — ${writable.at(-1) ?? "—"}), засчитано ${counted}, подделок отброшено ${fakes}; ` +
    `списки IP: ${official.size}/${AI_BOTS.filter((bot) => bot.ips).length}`,
);
