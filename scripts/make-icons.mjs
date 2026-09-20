#!/usr/bin/env node
/**
 * Иконки сайта и облегчённый логотип из знака VDF.BY.
 *
 *   npm run icons
 *
 * Собирает из public/brand/logo-source.png четыре файла. Три из них лежат в
 * src/app/, откуда Next подхватывает их по имени и сам вписывает в <head>:
 *
 *   favicon.ico     вкладка браузера, закладки, ярлыки Windows
 *   icon.png        современный rel="icon" для экранов высокой плотности
 *   apple-icon.png  иконка на домашнем экране iOS
 *
 * Четвёртый — public/brand/logo.png, знак под размер шапки. Исходник
 * шириной 2132 px, а в шапке он высотой 20–28 px: браузеру незачем держать
 * в памяти три четверти мегапикселя ради строчки текста.
 *
 * Оба файла лежат в public/brand, а не в public/img: папка с фотографиями
 * целиком в .gitignore (её наполняет конвейер загрузки), а деплой — это
 * git pull на сервере. Логотип оттуда в прод бы не доехал.
 *
 * Знак — широкая надпись, 2132x355. Вписать её целиком в квадратный фавикон
 * нельзя: на 16 px буквы стали бы высотой в два пикселя. Поэтому для иконок
 * вырезается первая буква, «V»: границы её ищутся по альфа-каналу (первый
 * непрозрачный столбец — первый пробел после него), а не задаются числами,
 * чтобы правка исходного файла не превращалась в правку скрипта.
 *
 * Знак одноцветный (#ffd21d) на прозрачном фоне, то есть по сути это
 * альфа-маска. Поэтому уменьшаем не картинку, а маску, а цвет заливаем
 * ровным слоем поверх. Если уменьшать RGBA как есть, по краю остаётся кайма
 * из полупрозрачных пикселей соседнего цвета — на тёмной вкладке она видна.
 *
 * Подложки нет намеренно: прозрачны и поля, и просветы внутри буквы. Белый
 * квадрат под ней выглядел бы заплаткой на тёмной теме браузера. Исключение —
 * apple-icon: iOS прозрачность не понимает и зальёт её чёрным. Подложка там
 * чернильная, brand-900, а не белая: жёлтый на белом почти не виден.
 */

import { Buffer } from "node:buffer";
import { writeFileSync } from "node:fs";

import sharp from "sharp";

const SRC = "public/brand/logo-source.png";
const OUT = "src/app/";
const LOGO = "public/brand/logo.png";
const LOGO_WIDTH = 600;
const YELLOW = { r: 255, g: 210, b: 29 };
const CLEAR = { r: 0, g: 0, b: 0, alpha: 0 };
const INK = { r: 11, g: 16, b: 32, alpha: 1 };

/**
 * Размеры внутри .ico. 16 и 32 — вкладка и панель задач, 24 — ярлыки
 * Windows, дальше — экраны с плотностью выше единицы.
 *
 * contrast растягивает полутона маски от середины: на 16 пикселях штрих
 * буквы после усреднения бледнеет и знак читается как пятно. Чем крупнее
 * размер, тем меньше нужна помощь, на 64 и выше — не нужна вовсе, иначе
 * края становятся ступенчатыми.
 */
const ICO_SIZES = [
  [16, 1.6],
  [24, 1.45],
  [32, 1.35],
  [48, 1.2],
  [64, 1],
  [128, 1],
  [256, 1],
];

async function firstGlyph(file) {
  const { data, info } = await sharp(file)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;
  const opaque = (x, y) => data[(y * width + x) * channels + channels - 1] > 10;

  let left = -1;
  let right = -1;
  for (let x = 0; x < width; x += 1) {
    let filled = false;
    for (let y = 0; y < height && !filled; y += 1) filled = opaque(x, y);
    if (filled) {
      if (left < 0) left = x;
      right = x;
    } else if (left >= 0) break;
  }
  if (left < 0) throw new Error(`${file}: не нашёл ни одного непрозрачного пикселя`);

  let top = -1;
  let bottom = -1;
  for (let y = 0; y < height; y += 1) {
    let filled = false;
    for (let x = left; x <= right && !filled; x += 1) filled = opaque(x, y);
    if (filled) {
      if (top < 0) top = y;
      bottom = y;
    }
  }

  return { left, top, width: right - left + 1, height: bottom - top + 1 };
}

const GLYPH = await firstGlyph(SRC);

/**
 * Квадратная иконка размером size.
 *
 * pad — доля размера, которая остаётся пустой по краям. Для вкладки это
 * потерянные пиксели, поэтому по умолчанию ноль: буква 407x355, при
 * вписывании в квадрат сверху и снизу и так остаётся воздух.
 */
async function icon(size, { contrast = 1, pad = 0, background = CLEAR } = {}) {
  const inset = Math.round(size * pad);
  const fitted = await sharp(SRC)
    .extract(GLYPH)
    .resize(size - inset * 2, size - inset * 2, {
      fit: "contain",
      background: CLEAR,
      kernel: "lanczos3",
    })
    .toBuffer();

  // Квадратим в RGBA, а не на одноканальной маске: fit: "contain" заполняет
  // поля одноканального изображения белым, а не пустотой.
  let mask = sharp({
    create: { width: size, height: size, channels: 4, background: CLEAR },
  })
    .composite([{ input: fitted, left: inset, top: inset }])
    .extractChannel(3);

  if (contrast !== 1) mask = mask.linear(contrast, -(contrast - 1) * 128);
  const alpha = await mask.raw().toBuffer();

  const flat = sharp({
    create: { width: size, height: size, channels: 3, background: YELLOW },
  }).joinChannel(alpha, { raw: { width: size, height: size, channels: 1 } });

  // Непрозрачная иконка — тот же знак, положенный на цвет подложки.
  const composed =
    background === CLEAR
      ? flat
      : sharp({
          create: { width: size, height: size, channels: 4, background },
        }).composite([{ input: await flat.png().toBuffer() }]);

  return composed.png({ compressionLevel: 9, effort: 10 }).toBuffer();
}

/**
 * Контейнер .ico: заголовок, по записи на размер, следом сами картинки.
 * Внутрь кладём обычные PNG — так .ico понимают все браузеры начиная с IE11,
 * а файл выходит втрое легче, чем со старым несжатым BMP.
 */
function ico(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(1, 2); // тип: 1 — иконка
  header.writeUInt16LE(images.length, 4);

  let offset = 6 + 16 * images.length;
  const entries = images.map(({ size, data }) => {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size % 256, 0); // 256 записывается нулём
    entry.writeUInt8(size % 256, 1);
    entry.writeUInt16LE(1, 4); // плоскостей
    entry.writeUInt16LE(32, 6); // бит на пиксель
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += data.length;
    return entry;
  });

  return Buffer.concat([header, ...entries, ...images.map((i) => i.data)]);
}

const frames = await Promise.all(
  ICO_SIZES.map(async ([size, contrast]) => ({
    size,
    data: await icon(size, { contrast }),
  })),
);

writeFileSync(OUT + "favicon.ico", ico(frames));
writeFileSync(OUT + "icon.png", await icon(512));
writeFileSync(
  OUT + "apple-icon.png",
  // Полями отбиваем знак от краёв: iOS обрежет иконку скруглением.
  await icon(180, { pad: 0.1, background: INK }),
);

const logo = await sharp(SRC)
  .resize(LOGO_WIDTH, null, { kernel: "lanczos3" })
  .png({ compressionLevel: 9, effort: 10 })
  .toBuffer();
writeFileSync(LOGO, logo);
const logoMeta = await sharp(logo).metadata();

console.log(
  `Готово: favicon.ico (${ICO_SIZES.map(([s]) => s).join(", ")}), icon.png 512, ` +
    `apple-icon.png 180, brand/logo.png ${logoMeta.width}x${logoMeta.height}`,
);
