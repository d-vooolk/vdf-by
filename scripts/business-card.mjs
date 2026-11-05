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
const GREEN_SOFT = "#2f4a3d";
const QR_URL = "https://vdf.by/?utm_source=vizitka&utm_medium=print&utm_campaign=business_card";

const TRIM = { width: 90, height: 50 };
const BLEED = 2;
const SAFE = 4;

const card = {
  brand: "VDF.BY",
  subtitle: "Магазин автосвета",
  goods: [
    "Стёкла фар",
    "Корпуса фар",
    "Переходные рамки для линз",
    "Bi-LED модули",
    "Светодиодные лампы",
    "Товары для ретрофита фар",
  ],
  phone: "+375 (33) 305-33-28",
  site: "vdf.by",
  address: "Минск, Брилевский тупик, 5",
  hours: "Пн–Пт 9:00–19:00",
};

async function whiteLogo() {
  const source = path.join(ROOT, "public", "brand", "logo-source.png");
  const { width, height } = await sharp(source).metadata();
  const alpha = await sharp(source).ensureAlpha().extractChannel("alpha").toBuffer();
  const png = await sharp({ create: { width, height, channels: 3, background: "#ffffff" } })
    .joinChannel(alpha)
    .png()
    .toBuffer();
  return `data:image/png;base64,${png.toString("base64")}`;
}

async function qrSvg() {
  return QRCode.toString(QR_URL, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 0,
    color: { dark: GREEN, light: "#0000" },
  });
}

function fontUrl(file) {
  return pathToFileURL(path.join(ROOT, "node_modules", "@fontsource-variable", "inter", "files", file)).href;
}

function render({ logo, qr, preview }) {
  const pageWidth = TRIM.width + BLEED * 2;
  const pageHeight = TRIM.height + BLEED * 2;
  const inset = BLEED + SAFE;
  const goods = card.goods.map((item) => `<li>${item}</li>`).join("");

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
  body { font-family: "Inter", sans-serif; color: ${GREEN}; }
  .side { position: relative; width: ${pageWidth}mm; height: ${pageHeight}mm; overflow: hidden; page-break-after: always; }
  .side:last-child { page-break-after: auto; }

  .front { background: ${GREEN}; display: flex; align-items: center; justify-content: center; }
  .front img { width: 72mm; height: auto; display: block; }

  .back { background: #ffffff; padding: ${inset}mm; display: grid; grid-template-columns: 1fr 23mm; column-gap: 4mm; }
  .info { display: flex; flex-direction: column; min-width: 0; }
  .brand { font-size: 14pt; font-weight: 850; letter-spacing: 0.02em; line-height: 1; }
  .subtitle { margin-top: 1.2mm; font-size: 6.2pt; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: ${GREEN_SOFT}; }
  .goods { list-style: none; margin-top: 2.6mm; font-size: 6.8pt; font-weight: 500; line-height: 1.38; }
  .goods li { padding-left: 2.6mm; position: relative; }
  .goods li::before { content: ""; position: absolute; left: 0; top: 0.95mm; width: 1.1mm; height: 1.1mm; background: ${GREEN}; }
  .contacts { margin-top: auto; font-size: 6.2pt; line-height: 1.35; color: ${GREEN_SOFT}; }
  .phone { font-size: 9pt; font-weight: 750; color: ${GREEN}; letter-spacing: 0.01em; }

  .qr { display: flex; flex-direction: column; align-items: center; justify-content: space-between; }
  .qr svg { width: 23mm; height: 23mm; display: block; }
  .qr-caption { margin-top: 1.4mm; font-size: 5.6pt; line-height: 1.3; text-align: center; color: ${GREEN_SOFT}; }
  .site { font-size: 10pt; font-weight: 800; letter-spacing: 0.02em; color: ${GREEN}; }

  ${preview ? `
  body { background: #d9dedb; padding: 8mm; display: flex; gap: 8mm; }
  .side { box-shadow: 0 1mm 4mm rgba(0,0,0,.25); }
  .side::after { content: ""; position: absolute; inset: ${BLEED}mm; outline: 0.2mm dashed rgba(220,0,0,.55); pointer-events: none; }
  ` : ""}
</style>
</head>
<body>
  <section class="side front">
    <img src="${logo}" alt="${card.brand}">
  </section>
  <section class="side back">
    <div class="info">
      <div class="brand">${card.brand}</div>
      <div class="subtitle">${card.subtitle}</div>
      <ul class="goods">${goods}</ul>
      <div class="contacts">
        <div class="phone">${card.phone}</div>
        <div>${card.address} · ${card.hours}</div>
      </div>
    </div>
    <div class="qr">
      <div>
        ${qr}
        <div class="qr-caption">Каталог и подбор<br>по марке авто</div>
      </div>
      <div class="site">${card.site}</div>
    </div>
  </section>
</body>
</html>`;
}

function chrome(args) {
  execFileSync(CHROME, ["--headless", "--disable-gpu", "--no-sandbox", "--hide-scrollbars", ...args], {
    stdio: ["ignore", "ignore", "pipe"],
  });
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const logo = await whiteLogo();
  const qr = await qrSvg();

  const printHtml = path.join(OUT_DIR, "vizitka.html");
  const previewHtml = path.join(OUT_DIR, "vizitka-preview.html");
  fs.writeFileSync(printHtml, render({ logo, qr, preview: false }));
  fs.writeFileSync(previewHtml, render({ logo, qr, preview: true }));

  const pdf = path.join(OUT_DIR, "vizitka-vdf-90x50.pdf");
  chrome(["--no-pdf-header-footer", `--print-to-pdf=${pdf}`, pathToFileURL(printHtml).href]);

  const png = path.join(OUT_DIR, "vizitka-preview.png");
  const mmToPx = 96 / 25.4;
  const width = Math.ceil((8 * 3 + (TRIM.width + BLEED * 2) * 2) * mmToPx);
  const height = Math.ceil((8 * 2 + TRIM.height + BLEED * 2) * mmToPx);
  chrome([
    `--window-size=${width},${height}`,
    "--force-device-scale-factor=4",
    `--screenshot=${png}`,
    pathToFileURL(previewHtml).href,
  ]);

  console.log(`PDF: ${path.relative(ROOT, pdf)}`);
  console.log(`Превью: ${path.relative(ROOT, png)}`);
  console.log(`QR: ${QR_URL}`);
}

await main();
