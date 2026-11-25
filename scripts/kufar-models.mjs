#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SPREADSHEET = "1wrGqiNIJLrNElJitAALiv_hd0HLOY-R4SKXYSTB-lhs";
const SOURCE = `https://docs.google.com/spreadsheets/d/${SPREADSHEET}`;
const TARGET = path.join(ROOT, "data", "kufar-models.json");

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        field += '"';
        index++;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[index + 1] === "\n") index++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.slice(1).map((cells) => cells.map((cell) => cell.trim()));
}

async function sheet(name) {
  const url = `${SOURCE}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(name)}`;
  const response = await fetch(url, { headers: { "user-agent": "Mozilla/5.0" } });
  if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
  return parseCsv(await response.text());
}

function year(value) {
  const number = Number.parseInt(value, 10);
  return Number.isFinite(number) ? number : null;
}

const [markRows, modelRows, generationRows] = await Promise.all([
  sheet("cars_brand_v2 (марка)"),
  sheet("cars_model_v2 (модель)"),
  sheet("cars_gen_v2 (поколение)"),
]);

const marks = {};
const modelsByTag = new Map();

for (const [name, tag] of markRows) {
  if (name && tag?.startsWith("category_2040.mark_")) marks[name] = { tag, models: {} };
}

const markByTag = new Map(Object.values(marks).map((mark) => [mark.tag, mark]));

for (const [, name, tag] of modelRows) {
  if (!name || !tag) continue;
  const mark = markByTag.get(tag.slice(0, tag.lastIndexOf(".model_")));
  if (!mark) continue;
  const model = { tag, generations: [] };
  mark.models[name] = model;
  modelsByTag.set(tag, model);
}

for (const [, , name, tag, from, to] of generationRows) {
  if (!name || !tag) continue;
  const model = modelsByTag.get(tag.slice(0, tag.lastIndexOf(".generation_")));
  if (model) model.generations.push({ name, yearFrom: year(from), yearTo: year(to), tag });
}

const markCount = Object.keys(marks).length;
const modelCount = modelsByTag.size;
const generationCount = [...modelsByTag.values()].reduce((sum, model) => sum + model.generations.length, 0);
if (markCount < 100 || modelCount < 1000 || generationCount < 3000) {
  throw new Error(
    `Похоже, таблица Куфара изменилась: ${markCount} марок, ${modelCount} моделей, ${generationCount} поколений`,
  );
}

fs.writeFileSync(TARGET, `${JSON.stringify({ source: SOURCE, fetchedAt: new Date().toISOString(), marks }, null, 1)}\n`);
console.log(`${path.relative(ROOT, TARGET)}: ${markCount} марок, ${modelCount} моделей, ${generationCount} поколений`);
