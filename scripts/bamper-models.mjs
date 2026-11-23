#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = "https://bamper.by/personal/import/bamper_marki-modeli.php";
const TARGET = path.join(ROOT, "data", "bamper-models.json");

const ENTITIES = { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " " };

function decode(text) {
  return text
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&([a-z]+);?/gi, (match, name) => ENTITIES[name.toLowerCase()] ?? match)
    .trim();
}

const response = await fetch(SOURCE, { headers: { "user-agent": "Mozilla/5.0" } });
if (!response.ok) throw new Error(`${SOURCE}: HTTP ${response.status}`);
const page = await response.text();
const body = page.slice(page.indexOf("<h1>"), page.indexOf("<!--content-->"));

const marks = {};
let current = null;
for (const match of body.matchAll(/<h5>(.*?)<\/h5>|(?:&nbsp;?)+([^<]*?)<br\s*\/?>/g)) {
  if (match[1] !== undefined) {
    current = decode(match[1]);
    marks[current] = [];
  } else if (current && match[2].trim()) {
    marks[current].push(decode(match[2]));
  }
}

const markCount = Object.keys(marks).length;
const modelCount = Object.values(marks).reduce((sum, models) => sum + models.length, 0);
if (markCount < 100 || modelCount < 1000) {
  throw new Error(`Похоже, разметка страницы изменилась: ${markCount} марок, ${modelCount} моделей`);
}

fs.writeFileSync(TARGET, `${JSON.stringify({ source: SOURCE, fetchedAt: new Date().toISOString(), marks }, null, 1)}\n`);
console.log(`${path.relative(ROOT, TARGET)}: ${markCount} марок, ${modelCount} моделей`);
