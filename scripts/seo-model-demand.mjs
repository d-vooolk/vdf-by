#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { env } from "../src/lib/env.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = env("SEO_REPORT_DIR", path.join(ROOT, "var", "seo"));
const SITE = env("SITE_URL", "https://vdf.by");

const CATEGORIES = [
  { slug: "stekla-far", title: "Стёкла фар", intent: /стекл|стекол|glass|рассеиват|поликарбонат/ },
  { slug: "svetovody", title: "Световоды", intent: /световод|(^|[^а-я])дхо|ходов(ые|ых|ого)|глазк|led.?полос|lightguide/ },
];
const GENERAL_INTENT = /фар|headlight/;

const MARK_ALIASES = {
  audi: ["ауди"],
  bmw: ["бмв", "бэмвэ"],
  "mercedes-benz": ["mercedes", "мерседес", "мерс", "benz"],
  volkswagen: ["vw", "фольксваген", "фольц", "фв"],
  volvo: ["вольво"],
  skoda: ["шкода"],
  toyota: ["тойота"],
  lexus: ["лексус"],
  nissan: ["ниссан"],
  infiniti: ["инфинити"],
  mazda: ["мазда"],
  honda: ["хонда"],
  mitsubishi: ["мицубиси", "митсубиси"],
  subaru: ["субару"],
  hyundai: ["хендай", "хундай", "хёндай", "хендэ", "хюндай"],
  kia: ["киа"],
  renault: ["рено"],
  peugeot: ["пежо"],
  citroen: ["ситроен"],
  opel: ["опель"],
  ford: ["форд"],
  chevrolet: ["шевроле", "шеви"],
  cadillac: ["кадиллак"],
  gmc: ["джимси", "джи эм си"],
  jeep: ["джип"],
  "land-rover": ["ленд ровер", "лэнд ровер", "range rover", "рендж ровер"],
  jaguar: ["ягуар"],
  porsche: ["порше"],
  tesla: ["тесла"],
  geely: ["джили"],
  haval: ["хавал", "хавейл"],
  chery: ["чери"],
  exeed: ["эксид"],
  jac: ["джак"],
  gac: ["гак"],
  zeekr: ["зикр"],
  voyah: ["вояж", "воя"],
  byd: ["бид", "бяд"],
  lixiang: ["li auto", "лисян", "ли сян"],
  belgee: ["белджи"],
  tank: ["танк"],
};

const MODEL_ALIASES = {
  accord: ["аккорд"],
  camry: ["камри"],
  "land cruiser": ["крузак", "ленд крузер", "лэнд крузер"],
  golf: ["гольф"],
  passat: ["пассат"],
  tiguan: ["тигуан"],
  touareg: ["туарег"],
  octavia: ["октавия"],
  superb: ["суперб"],
  kodiaq: ["кодиак"],
  "santa fe": ["санта фе"],
  tucson: ["туссан", "тусан"],
  sportage: ["спортейдж"],
  sorento: ["соренто"],
  megane: ["меган"],
  equinox: ["эквинокс"],
  terrain: ["терейн", "террейн"],
  malibu: ["малибу"],
  explorer: ["эксплорер"],
  "e-klasse": ["е класс", "e класс"],
  altima: ["алтима"],
  "x-trail": ["икстрейл", "х трейл"],
  qashqai: ["кашкай"],
  carnival: ["карнивал"],
  staria: ["стария"],
};

const NOT_CAR_CODES = new Set(["f50", "f55", "gt13", "h7", "h4", "d2s", "d4s"]);

const LOOKALIKES = { ф: "f", а: "a", в: "b", е: "e", к: "k", м: "m", н: "h", о: "o", р: "p", с: "c", т: "t", х: "x", у: "y" };

const normalize = (text) =>
  String(text)
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[«»"'(),.-]/g, " ")
    .replace(/(^|\s)([a-zа-я])\s(\d{1,3})(?=\s|$)/g, "$1$2$3")
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => (/\d/.test(token) ? token.replace(/[а-я]/g, (char) => LOOKALIKES[char] ?? char) : token))
    .join(" ");

const slugify = (text) => normalize(text).replace(/[^a-z0-9а-я]+/g, "-").replace(/^-|-$/g, "");

function includesPhrase(query, phrase) {
  if (!phrase) return false;
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-zа-я0-9])${escaped}($|[^a-zа-я0-9])`).test(query);
}

function latestAlltime() {
  const files = fs.existsSync(OUT_DIR) ? fs.readdirSync(OUT_DIR).filter((name) => /^alltime-.*\.json$/.test(name)).sort() : [];
  if (!files.length) throw new Error(`В ${OUT_DIR} нет выгрузки alltime-*.json — сначала scripts/seo-alltime.mjs`);
  return path.join(OUT_DIR, files.at(-1));
}

function buildDictionary(catalog) {
  const marks = [];
  for (const mark of catalog.marks) {
    const markSlug = slugify(mark.name);
    const names = [normalize(mark.name), ...(MARK_ALIASES[markSlug] ?? [])];
    const models = mark.models.map((model) => {
      const modelName = normalize(model.name);
      const names = [modelName, ...(MODEL_ALIASES[modelName] ?? [])];
      const codes = new Map();
      for (const generation of model.generations) {
        for (const raw of normalize(generation.name).split(/[\s/,]+/)) {
          if (!/^[a-z]{1,2}\d{1,3}[a-z]?$/.test(raw) || raw.length < 3) continue;
          const variants = /^[a-z]\dx$/.test(raw) ? Array.from({ length: 10 }, (_, digit) => raw.replace("x", String(digit))) : [raw];
          for (const value of variants) if (!NOT_CAR_CODES.has(value)) codes.set(value, generation.name);
        }
      }
      return { name: model.name, names, codes };
    });
    marks.push({ name: mark.name, names, models });
  }
  return marks;
}

function detectCar(query, marks) {
  let best = null;
  const consider = (candidate) => {
    if (!best || candidate.score > best.score) best = candidate;
  };
  for (const mark of marks) {
    const markHit = mark.names.some((name) => includesPhrase(query, name));
    if (markHit) consider({ score: 2, mark: mark.name, model: null, generation: null });
    for (const model of mark.models) {
      const code = [...model.codes.keys()].find((value) => includesPhrase(query, value));
      const modelName = model.names
        .filter((name) => (/^\d{1,2}$/.test(name) ? markHit : name.length >= 2) && includesPhrase(query, name))
        .sort((a, b) => b.length - a.length)[0];
      if (!markHit && !(code && modelName) && !(code && code.length >= 3 && /^[a-z]\d{2}$/.test(code))) continue;
      if (!modelName && !code) continue;
      consider({
        score:
          (markHit ? 2 : 0) + (modelName ? 2 + modelName.length / 100 : 0) + (code ? 3 : 0) + mark.models.length / 100000,
        mark: mark.name,
        model: model.name,
        generation: code ? model.codes.get(code) : null,
      });
    }
  }
  return best;
}

async function sitemapUrls() {
  const urls = [];
  const queue = [`${SITE}/sitemap.xml`];
  while (queue.length) {
    const body = await fetch(queue.shift()).then((response) => response.text());
    for (const [, loc] of body.matchAll(/<loc>([^<]+)<\/loc>/g)) {
      if (body.includes("<sitemapindex")) queue.push(loc);
      else urls.push(loc.replace(SITE, ""));
    }
  }
  return new Set(urls);
}

function coverage(car, category, tree, urls) {
  const mark = tree.find((entry) => normalize(entry.n) === normalize(car.mark));
  if (!mark) return { level: "нет", path: null };
  const markPath = `/catalog/${category}/${mark.s}/`;
  if (!car.model) return { level: urls.has(markPath) ? "марка есть" : "нет", path: markPath };
  const model = mark.m.find((entry) => normalize(entry.n) === normalize(car.model));
  const modelPath = model ? `${markPath}${model.s}/` : null;
  if (!modelPath || !urls.has(modelPath)) return { level: urls.has(markPath) ? "только другие модели марки" : "нет", path: null };
  if (!car.generation) return { level: "есть", path: modelPath };
  const code = normalize(car.generation).match(/[a-z]{1,3}\d{1,3}[a-z]?/)?.[0];
  const generation = model.g.find((entry) => code && normalize(entry.n).includes(code));
  const generationPath = generation ? `${modelPath}${generation.s}/` : null;
  return generationPath && urls.has(generationPath)
    ? { level: "есть", path: generationPath }
    : { level: "модель есть, поколения нет", path: modelPath };
}

function collectQueries(data) {
  const rows = [];
  const google = data.google?.data;
  if (google) {
    const landing = new Map();
    for (const row of google.queryPages ?? []) {
      const current = landing.get(row.keys[0]);
      if (!current || row.impressions > current.impressions) landing.set(row.keys[0], { page: row.keys[1], impressions: row.impressions });
    }
    for (const row of google.queries) {
      rows.push({
        source: "Google",
        query: row.keys[0],
        shows: row.impressions,
        clicks: row.clicks,
        position: row.position,
        landing: landing.get(row.keys[0])?.page?.replace(SITE, "") ?? null,
      });
    }
  }
  for (const row of data.webmaster?.data?.popular?.queries ?? []) {
    rows.push({
      source: "Яндекс",
      query: row.query_text,
      shows: row.indicators?.TOTAL_SHOWS ?? 0,
      clicks: row.indicators?.TOTAL_CLICKS ?? 0,
      position: row.indicators?.AVG_SHOW_POSITION ?? null,
      landing: null,
    });
  }
  for (const row of data.metrika?.data?.phrases?.rows ?? []) {
    if (!row.dimensions[0]?.name) continue;
    rows.push({ source: "Метрика", query: row.dimensions[0].name, shows: 0, clicks: row.metrics[0], position: null, landing: null });
  }
  for (const row of data.metrika?.data?.siteSearch?.rows ?? []) {
    const url = row.dimensions[0]?.name ?? "";
    const query = new URL(url, SITE).searchParams.get("q");
    if (query) rows.push({ source: "Поиск по сайту", query, shows: row.metrics[0], clicks: 0, position: null, landing: null });
  }
  return rows;
}

const number = (value, digits = 0) =>
  value === null || value === undefined ? "—" : Number(value).toLocaleString("ru-RU", { maximumFractionDigits: digits });

function table(headers, rows) {
  if (!rows.length) return "_нет данных_\n";
  const escape = (value) => String(value ?? "").replace(/\|/g, "\\|");
  return [`| ${headers.join(" | ")} |`, `| ${headers.map(() => "---").join(" | ")} |`, ...rows.map((row) => `| ${row.map(escape).join(" | ")} |`)].join("\n") + "\n";
}

const input = process.argv[2] ?? latestAlltime();
const data = JSON.parse(fs.readFileSync(input, "utf8"));
const catalog = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "cars-catalog.json"), "utf8"));
const marks = buildDictionary(catalog);
const [urls, tree] = await Promise.all([sitemapUrls(), fetch(`${SITE}/car-tree.json`).then((response) => response.json())]);

const queries = collectQueries(data).map((row) => ({ ...row, normalized: normalize(row.query) }));
const sections = [];
for (const category of [...CATEGORIES, { slug: null, title: "Фары без уточнения детали", intent: GENERAL_INTENT }]) {
  const cars = new Map();
  for (const row of queries) {
    if (!category.intent.test(row.normalized)) continue;
    if (!category.slug && CATEGORIES.some((other) => other.intent.test(row.normalized))) continue;
    const car = detectCar(row.normalized, marks);
    if (!car) continue;
    const key = [car.mark, car.model ?? "", car.generation ?? ""].join("|");
    const entry = cars.get(key) ?? { car, shows: 0, clicks: 0, queries: [] };
    entry.shows += row.shows;
    entry.clicks += row.clicks;
    entry.queries.push(row);
    cars.set(key, entry);
  }
  const entries = [...cars.values()].map((entry) => ({
    ...entry,
    coverage: category.slug ? coverage(entry.car, category.slug, tree, urls) : null,
  }));
  sections.push({ category, entries: entries.sort((a, b) => b.shows + b.clicks * 10 - (a.shows + a.clicks * 10)) });
}

const carLabel = ({ mark, model, generation }) => [mark, model, generation].filter(Boolean).join(" ");
const queryList = (entry) =>
  entry.queries
    .sort((a, b) => b.shows - a.shows)
    .slice(0, 4)
    .map((row) => `${row.query} (${row.source}${row.shows ? `, ${row.shows} пок.` : ""}${row.position ? `, поз. ${number(row.position, 1)}` : ""})`)
    .join("; ");

const lines = [
  `# Спрос на модели: стёкла фар и световоды`,
  "",
  `Источник: ${path.basename(input)} (Google — до 16 месяцев, Яндекс — популярные запросы за год, Метрика — фразы из поиска и поиск по сайту). Каталог — sitemap ${SITE} на ${new Date().toISOString().slice(0, 10)}.`,
  "",
  "Google раскрывает только часть запросов, редкие скрыты — список показывает, что точно ищут, но не всё. «Нет» — в разделе нет страницы этой модели; «модель есть, поколения нет» — ищут кузов, которого в разделе нет.",
  "",
];
for (const { category, entries } of sections) {
  lines.push(`## ${category.title}`, "");
  if (category.slug) {
    const gaps = entries.filter((entry) => entry.coverage.level !== "есть");
    const covered = entries.filter((entry) => entry.coverage.level === "есть");
    lines.push(`### Ищут, а в каталоге нет — ${gaps.length}`, "");
    lines.push(
      table(
        ["Автомобиль", "Показы", "Клики", "В каталоге", "Запросы"],
        gaps.map((entry) => [carLabel(entry.car), number(entry.shows), number(entry.clicks), entry.coverage.level, queryList(entry)]),
      ),
    );
    lines.push(`### Ищут и есть — ${covered.length}`, "");
    lines.push(
      table(
        ["Автомобиль", "Показы", "Клики", "Страница", "Запросы"],
        covered.map((entry) => [carLabel(entry.car), number(entry.shows), number(entry.clicks), entry.coverage.path, queryList(entry)]),
      ),
    );
  } else {
    lines.push("Запросы с моделью и словом «фара», но без стекла или световода — подсказка, какие машины вообще приводят людей.", "");
    lines.push(
      table(
        ["Автомобиль", "Показы", "Клики", "Запросы"],
        entries.slice(0, 40).map((entry) => [carLabel(entry.car), number(entry.shows), number(entry.clicks), queryList(entry)]),
      ),
    );
  }
}

fs.mkdirSync(OUT_DIR, { recursive: true });
const file = path.join(OUT_DIR, `model-demand-${new Date().toISOString().slice(0, 10)}.md`);
fs.writeFileSync(file, lines.join("\n"));
console.log(file);
