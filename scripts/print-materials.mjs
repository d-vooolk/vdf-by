import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import QRCode from "qrcode";
import sharp from "sharp";

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, "var", "print");
const CHROME = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const GREEN = "#1a2b20";
const GREEN_SOFT = "#3d5a4c";
const GREEN_TINT = "#24392d";
const PAPER = "#f3f5f2";
const BLEED = 2;

const shop = {
  brand: "VDF.BY",
  site: "vdf.by",
  phone: "+375 (33) 305-33-28",
  address: "Минск, Брилевский тупик, 5",
  hours: "Пн–Пт 9:00–19:00",
};

const cardGoods = [
  "Стёкла фар",
  "Корпуса фар",
  "Переходные рамки для линз",
  "Bi-LED модули",
  "Светодиодные лампы",
  "Товары для ретрофита фар",
];

const warrantyRules = [
  "Гарантия распространяется на изделие при полностью заполненном гарантийном талоне.",
  "Установка изделия производится в специализированных центрах с обязательной регулировкой света фар.",
  "Самостоятельная установка производится под свою ответственность.",
  "Гарантия не распространяется на изделия с механическими повреждениями, а также с повреждениями, вызванными попаданием внутрь жидкости, агрессивных сред и иных посторонних тел.",
];

const warrantyFields = [
  { label: "Наименование модели" },
  { label: "Дата продажи / установки" },
  { label: "Продавец" },
  { label: "Гарантия", suffix: "мес.", short: true },
];

async function tintedLogo(color) {
  const source = path.join(ROOT, "public", "brand", "logo-source.png");
  const { width, height } = await sharp(source).metadata();
  const alpha = await sharp(source).ensureAlpha().extractChannel("alpha").toBuffer();
  const png = await sharp({ create: { width, height, channels: 3, background: color } })
    .joinChannel(alpha)
    .png()
    .toBuffer();
  return `data:image/png;base64,${png.toString("base64")}`;
}

function qrSvg(url) {
  return QRCode.toString(url, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 0,
    color: { dark: GREEN, light: "#0000" },
  });
}

function fontUrl(file) {
  return pathToFileURL(path.join(ROOT, "node_modules", "@fontsource-variable", "inter", "files", file)).href;
}

function documentHtml({ width, height, css, sides, preview }) {
  const pageWidth = width + BLEED * 2;
  const pageHeight = height + BLEED * 2;
  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<style>
  @font-face { font-family: "Inter"; src: url("${fontUrl("inter-cyrillic-wght-normal.woff2")}") format("woff2"); font-weight: 100 900; unicode-range: U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116; }
  @font-face { font-family: "Inter"; src: url("${fontUrl("inter-latin-wght-normal.woff2")}") format("woff2"); font-weight: 100 900; }
  @page { size: ${pageWidth}mm ${pageHeight}mm; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: "Inter", sans-serif; color: ${GREEN}; font-feature-settings: "tnum" 0, "ss01" 1; }
  .side { position: relative; width: ${pageWidth}mm; height: ${pageHeight}mm; overflow: hidden; page-break-after: always; }
  .side:last-child { page-break-after: auto; }
  .watermark { position: absolute; display: block; pointer-events: none; }
  ${css}
  ${
    preview
      ? `
  body { background: #cfd5d1; padding: 8mm; display: flex; gap: 8mm; align-items: flex-start; }
  .side { box-shadow: 0 1mm 4mm rgba(0,0,0,.25); }
  .side::after { content: ""; position: absolute; inset: ${BLEED}mm; outline: 0.2mm dashed rgba(220,0,0,.55); pointer-events: none; }`
      : ""
  }
</style>
</head>
<body>
${sides.join("\n")}
</body>
</html>`;
}

function businessCard({ logoWhite, logoGreen, qr }) {
  const width = 90;
  const height = 50;
  const inset = BLEED + 4;
  const goods = cardGoods
    .map((item, index) => `<li><span class="num">${String(index + 1).padStart(2, "0")}</span>${item}</li>`)
    .join("");

  const css = `
  .front { background: ${GREEN}; }
  .front .logo { position: absolute; left: 50%; top: 50%; width: 70mm; transform: translate(-50%, -50%); }

  .back { background: ${PAPER}; }
  .back .watermark { width: 112mm; left: 40mm; top: 36mm; opacity: 0.06; }
  .back .band { position: absolute; left: 0; top: 0; bottom: 0; width: ${BLEED + 1.6}mm; background: ${GREEN}; }
  .back .content { position: absolute; inset: ${inset}mm ${inset}mm ${inset}mm ${inset + 1}mm; display: grid; grid-template-columns: 1fr 22mm; column-gap: 4mm; }
  .info { display: flex; flex-direction: column; min-width: 0; }
  .eyebrow { font-size: 5.4pt; font-weight: 650; letter-spacing: 0.22em; text-transform: uppercase; color: ${GREEN_SOFT}; }
  .brand { margin-top: 0.8mm; height: 4.6mm; }
  .brand img { height: 100%; display: block; }
  .rule { margin: 2.2mm 0 1.8mm; width: 9mm; height: 0.5mm; background: ${GREEN}; }
  .goods { list-style: none; font-size: 6.5pt; font-weight: 500; line-height: 1.42; }
  .goods .num { display: inline-block; width: 4.2mm; font-size: 5pt; font-weight: 700; color: ${GREEN_SOFT}; opacity: 0.7; letter-spacing: 0.04em; }
  .contacts { margin-top: auto; }
  .phone { font-size: 8.6pt; font-weight: 750; letter-spacing: 0.01em; white-space: nowrap; }
  .place { margin-top: 0.6mm; font-size: 5.4pt; line-height: 1.35; color: ${GREEN_SOFT}; white-space: nowrap; }

  .qr-col { display: flex; flex-direction: column; align-items: stretch; justify-content: space-between; }
  .qr-box { background: #ffffff; border-radius: 1.6mm; padding: 1.6mm; box-shadow: 0 0 0 0.2mm rgba(26,43,32,.14); }
  .qr-box svg { width: 100%; height: auto; display: block; }
  .qr-caption { margin-top: 1.2mm; font-size: 5pt; line-height: 1.3; text-align: center; color: ${GREEN_SOFT}; }
  .site { text-align: center; font-size: 9.5pt; font-weight: 800; letter-spacing: 0.02em; }`;

  const front = `<section class="side front">
    <img class="logo" src="${logoWhite}" alt="${shop.brand}">
  </section>`;

  const back = `<section class="side back">
    <img class="watermark" src="${logoGreen}" alt="">
    <div class="band"></div>
    <div class="content">
      <div class="info">
        <div class="eyebrow">Магазин автосвета</div>
        <div class="brand"><img src="${logoGreen}" alt="${shop.brand}"></div>
        <div class="rule"></div>
        <ul class="goods">${goods}</ul>
        <div class="contacts">
          <div class="phone">${shop.phone}</div>
          <div class="place">${shop.address} · ${shop.hours}</div>
        </div>
      </div>
      <div class="qr-col">
        <div>
          <div class="qr-box">${qr}</div>
          <div class="qr-caption">Каталог и подбор<br>по марке авто</div>
        </div>
        <div class="site">${shop.site}</div>
      </div>
    </div>
  </section>`;

  return { width, height, css, sides: [front, back], name: "vizitka-vdf-90x50" };
}

function warrantyCard({ logoWhite, logoTint, logoGreen }) {
  const width = 103;
  const height = 146;
  const inset = BLEED + 7;
  const rules = warrantyRules.map((rule) => `<li>${rule}</li>`).join("");
  const fields = warrantyFields
    .map(
      (field) => `<div class="field${field.short ? " short" : ""}">
        <span class="label">${field.label}</span>
        <span class="line"></span>
        ${field.suffix ? `<span class="suffix">${field.suffix}</span>` : ""}
      </div>`,
    )
    .join("");

  const css = `
  .front { background: ${GREEN}; color: #ffffff; }
  .front .watermark { width: 150mm; left: 50%; bottom: -6mm; transform: translateX(-50%); }
  .front .center { position: absolute; left: ${inset}mm; right: ${inset}mm; top: 50%; transform: translateY(-58%); text-align: center; }
  .front .logo { width: 76mm; display: block; margin: 0 auto; }
  .front .divider { width: 12mm; height: 0.5mm; background: #ffffff; opacity: 0.55; margin: 7mm auto 5mm; }
  .front .tagline { font-size: 10pt; font-weight: 500; line-height: 1.45; letter-spacing: 0.01em; opacity: 0.92; }
  .front .site { position: absolute; left: 0; right: 0; bottom: ${inset + 4}mm; text-align: center; font-size: 12pt; font-weight: 750; letter-spacing: 0.16em; }

  .back { background: ${PAPER}; }
  .back .watermark { width: 150mm; left: 30mm; top: 8mm; opacity: 0.045; }
  .back .band { position: absolute; left: 0; right: 0; top: 0; height: ${BLEED + 2}mm; background: ${GREEN}; }
  .back .content { position: absolute; inset: ${inset + 2}mm ${inset}mm ${inset}mm; display: flex; flex-direction: column; }
  .head { display: flex; align-items: flex-end; justify-content: space-between; }
  .eyebrow { font-size: 6.4pt; font-weight: 650; letter-spacing: 0.22em; text-transform: uppercase; color: ${GREEN_SOFT}; }
  .title { margin-top: 1.4mm; font-size: 19pt; font-weight: 800; line-height: 1; letter-spacing: -0.01em; }
  .head img { height: 4.2mm; display: block; margin-bottom: 0.6mm; }
  .rule { margin: 4.5mm 0 4mm; height: 0.3mm; background: ${GREEN}; opacity: 0.25; }
  .rules { list-style: none; counter-reset: rule; display: flex; flex-direction: column; gap: 2.2mm; font-size: 7.6pt; line-height: 1.4; }
  .rules li { counter-increment: rule; position: relative; padding-left: 7mm; }
  .rules li::before { content: counter(rule, decimal-leading-zero); position: absolute; left: 0; top: 0.35mm; font-size: 6.6pt; font-weight: 750; letter-spacing: 0.04em; color: ${GREEN_SOFT}; }
  .fields { margin-top: auto; padding-top: 7mm; display: flex; flex-direction: column; gap: 5mm; }
  .field { display: flex; align-items: flex-end; gap: 2mm; font-size: 8pt; }
  .field .label { font-weight: 650; white-space: nowrap; }
  .field .line { flex: 1; border-bottom: 0.25mm solid ${GREEN}; height: 4.4mm; }
  .field.short .line { flex: 0 0 16mm; }
  .field .suffix { font-weight: 500; }
  .sign { margin-top: 6mm; display: flex; justify-content: space-between; align-items: flex-end; font-size: 6.4pt; color: ${GREEN_SOFT}; }
  .sign .stamp { width: 18mm; height: 18mm; border: 0.25mm dashed ${GREEN_SOFT}; border-radius: 50%; display: flex; align-items: center; justify-content: center; letter-spacing: 0.12em; }
  .sign .contacts { text-align: right; line-height: 1.45; }
  .sign .contacts b { color: ${GREEN}; font-size: 7.4pt; }`;

  const front = `<section class="side front">
    <img class="watermark" src="${logoTint}" alt="">
    <div class="center">
      <img class="logo" src="${logoWhite}" alt="${shop.brand}">
      <div class="divider"></div>
      <div class="tagline">Магазин автосвета<br>и товаров для ретрофита</div>
    </div>
    <div class="site">${shop.site.toUpperCase()}</div>
  </section>`;

  const back = `<section class="side back">
    <img class="watermark" src="${logoGreen}" alt="">
    <div class="band"></div>
    <div class="content">
      <div class="head">
        <div>
          <div class="eyebrow">${shop.brand} · магазин автосвета</div>
          <div class="title">Гарантийный талон</div>
        </div>
      </div>
      <div class="rule"></div>
      <ol class="rules">${rules}</ol>
      <div class="fields">${fields}</div>
      <div class="sign">
        <div class="stamp">М.П.</div>
        <div class="contacts"><b>${shop.phone}</b><br>${shop.site} · ${shop.address}</div>
      </div>
    </div>
  </section>`;

  return { width, height, css, sides: [front, back], name: "garantiynyy-talon-vdf-103x146" };
}

function chrome(args) {
  execFileSync(CHROME, ["--headless", "--disable-gpu", "--no-sandbox", "--hide-scrollbars", ...args], {
    stdio: ["ignore", "ignore", "pipe"],
  });
}

function build(item) {
  const printHtml = path.join(OUT_DIR, `${item.name}.html`);
  const previewHtml = path.join(OUT_DIR, `${item.name}-preview.html`);
  fs.writeFileSync(printHtml, documentHtml({ ...item, preview: false }));
  fs.writeFileSync(previewHtml, documentHtml({ ...item, preview: true }));

  const pdf = path.join(OUT_DIR, `${item.name}.pdf`);
  chrome(["--no-pdf-header-footer", `--print-to-pdf=${pdf}`, pathToFileURL(printHtml).href]);

  const png = path.join(OUT_DIR, `${item.name}-preview.png`);
  const mmToPx = 96 / 25.4;
  const width = Math.ceil((8 * 3 + (item.width + BLEED * 2) * 2) * mmToPx);
  const height = Math.ceil((8 * 2 + item.height + BLEED * 2) * mmToPx);
  chrome([
    `--window-size=${width},${height}`,
    `--force-device-scale-factor=${item.width > 100 ? 2 : 4}`,
    `--screenshot=${png}`,
    pathToFileURL(previewHtml).href,
  ]);
  return { pdf, png };
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const assets = {
    logoWhite: await tintedLogo("#ffffff"),
    logoTint: await tintedLogo(GREEN_TINT),
    logoGreen: await tintedLogo(GREEN),
    qr: await qrSvg("https://vdf.by/?utm_source=vizitka&utm_medium=print&utm_campaign=business_card"),
  };

  const only = process.argv[2];
  const items = [businessCard(assets), warrantyCard(assets)].filter((item) => !only || item.name.includes(only));
  for (const item of items) {
    const { pdf, png } = build(item);
    console.log(`${path.relative(ROOT, pdf)}  ·  превью ${path.relative(ROOT, png)}`);
  }
}

await main();
