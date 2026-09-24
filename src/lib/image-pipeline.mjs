import fsp from "node:fs/promises";
import path from "node:path";

/**
 * Обработка одной фотографии: из исходника получаются avif/webp в нескольких
 * ширинах, jpeg-фолбэк и размытая заглушка.
 *
 * Раньше это делалось только на сборке (scripts/images.mjs) — при статическом
 * экспорте иначе было нельзя. Теперь то же самое происходит в момент загрузки
 * фото через админку: положил файл в форму — через секунду он готов.
 *
 * Файл намеренно на чистом JavaScript, а не на TypeScript: его импортируют и
 * route handler админки, и консольный скрипт импорта. Две копии одного
 * конвейера неизбежно разъехались бы по качеству и набору ширин, а разница
 * вылезла бы уже на готовых картинках.
 */

/** Ширины под карточки (400), основное фото товара (800) и retina (1200/1600). */
export const WIDTHS = [400, 800, 1200, 1600];

const FORMATS = [
  { ext: "avif", options: { quality: 52, effort: 3 } },
  { ext: "webp", options: { quality: 78, effort: 4 } },
];

/** Фолбэк для браузеров без webp/avif — один размер, больше не нужно. */
/**
 * Ширина jpeg-фолбэка.
 *
 * 1200, а не 800: этот файл идёт не только в <img src> для браузеров без
 * avif и webp (таких почти не осталось), но и в разметку товара и в превью
 * для соцсетей — а там и Google, и мессенджеры ждут картинку от 1200 px.
 * У фотографий, загруженных до этой правки, фолбэк остался 800; для них
 * разметка берёт webp нужной ширины (см. bigImageUrl в src/lib/seo.ts),
 * поэтому перезаливать их не нужно.
 */
const FALLBACK_WIDTH = 1200;

/** Форматы, которые принимаем на загрузку. */
export const ACCEPTED = new Set(["jpg", "jpeg", "png", "webp", "avif"]);

/**
 * Приводит имя файла к пути, который не выведет за пределы папки с картинками.
 *
 * Проверка не косметическая: имя приходит из браузера, и «../../etc/passwd»
 * там оказаться может.
 */
export function safeImagePath(folder, filename) {
  const ext = path.extname(filename).slice(1).toLowerCase();
  const base = path
    .basename(filename, path.extname(filename))
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 60);

  const dir = String(folder ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9/_-]+/g, "-")
    .replace(/\.+/g, "")
    .replace(/\/{2,}/g, "/")
    .replace(/^\/+|\/+$/g, "")
    .split("/")
    .filter(Boolean)
    .slice(0, 3)
    .join("/");

  const name = base || "photo";
  const safeExt = ACCEPTED.has(ext) ? ext : "jpg";

  return dir ? `${dir}/${name}.${safeExt}` : `${name}.${safeExt}`;
}

function outputName(relativePath, suffix) {
  const dir = path.dirname(relativePath);
  const base = path.basename(relativePath, path.extname(relativePath));
  const name = `${base}-${suffix}`;
  return dir === "." ? name : `${dir}/${name}`;
}

/**
 * Делает все варианты картинки и возвращает запись для манифеста.
 *
 * @param {object} params
 * @param {Buffer|string} params.source   буфер загруженного файла или путь к нему
 * @param {string} params.relativePath    путь вида "lamps/osram/h7-1.jpg"
 * @param {string} params.outDir          куда писать (обычно public/img)
 * @param {(source: Buffer|string, options?: object) => any} params.sharp
 * @returns {Promise<{entry: object, bytes: number}|null>} null — если это не картинка
 */
export async function processImage({ source, relativePath, outDir, sharp }) {
  const meta = await sharp(source, { failOn: "error" }).metadata();
  if (!meta.width || !meta.height) return null;

  const upright = sharp(source, { failOn: "error" }).rotate().toColourspace("srgb");
  const { data: pixels, info } = await upright
    .resize({ width: Math.max(...WIDTHS, FALLBACK_WIDTH), withoutEnlargement: true })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const orientedWidth = (meta.orientation ?? 1) >= 5 ? meta.height : meta.width;
  const orientedHeight = (meta.orientation ?? 1) >= 5 ? meta.width : meta.height;

  const fromPixels = () =>
    sharp(pixels, {
      raw: { width: info.width, height: info.height, channels: info.channels },
    });

  const widths = WIDTHS.filter((w) => w <= info.width);
  if (!widths.length) widths.push(info.width);

  const writeVariant = async (relativeOut, width, encode) => {
    const outPath = path.join(/*turbopackIgnore: true*/ outDir, relativeOut);
    await fsp.mkdir(path.dirname(outPath), { recursive: true });
    const result = await encode(
      fromPixels().resize({ width, withoutEnlargement: true }),
    ).toFile(outPath);
    return result.size ?? 0;
  };

  const jobs = FORMATS.flatMap((format) =>
    widths.map((w) => {
      const relativeOut = `${outputName(relativePath, w)}.${format.ext}`;
      return {
        format: format.ext,
        w,
        url: `/img/${relativeOut}`,
        run: () =>
          writeVariant(relativeOut, w, (image) => image[format.ext](format.options)),
      };
    }),
  );

  const fallbackWidth = Math.min(FALLBACK_WIDTH, info.width);
  const fallbackRelative = `${outputName(relativePath, fallbackWidth)}.jpg`;

  const [sizes, fallbackSize, blur] = await Promise.all([
    Promise.all(jobs.map((job) => job.run())),
    writeVariant(fallbackRelative, fallbackWidth, (image) =>
      image.jpeg({ quality: 80, mozjpeg: true }),
    ),
    fromPixels().resize({ width: 16 }).webp({ quality: 30 }).toBuffer(),
  ]);

  const entry = {
    w: orientedWidth,
    h: orientedHeight,
    blur: `data:image/webp;base64,${blur.toString("base64")}`,
    sources: {},
    fallback: `/img/${fallbackRelative}`,
  };
  for (const format of FORMATS) {
    entry.sources[format.ext] = jobs
      .filter((job) => job.format === format.ext)
      .map((job) => ({ w: job.w, url: job.url }));
  }

  const bytes = sizes.reduce((sum, size) => sum + size, 0) + fallbackSize;
  return { entry, bytes };
}

/**
 * Удаляет все файлы, сделанные из одной фотографии.
 * Список берётся из записи манифеста, а не сканированием папки.
 */
export async function removeImageFiles(entry, publicDir) {
  const urls = [
    ...Object.values(entry.sources ?? {}).flatMap((variants) =>
      variants.map((variant) => variant.url),
    ),
    entry.fallback,
  ].filter(Boolean);

  for (const url of urls) {
    // url вида /img/lamps/osram/h7-1-400.avif → путь внутри public
    const relative = url.replace(/^\//, "");
    await fsp.rm(path.join(/*turbopackIgnore: true*/ publicDir, relative), {
      force: true,
    });
  }
}
