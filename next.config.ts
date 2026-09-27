import fs from "node:fs";
import path from "node:path";

import type { NextConfig } from "next";

function activeDistDir(): string {
  if (process.env.NEXT_DIST_DIR) return process.env.NEXT_DIST_DIR;
  try {
    const slot = fs.readFileSync(path.join(process.cwd(), "var", "dist-slot"), "utf8").trim();
    if (/^\.next(-[ab])?$/.test(slot)) return slot;
  } catch {}
  return ".next";
}

const LISTING_PAGE = "(?<page>[1-9]\\d{0,3})";
const LISTING_SORT = "(?<sort>default|price-asc|price-desc|name)";

function listingRewrites() {
  const scopes = [
    { source: "/catalog/", path: "" },
    { source: "/catalog/:category/", path: ":category/" },
    { source: "/catalog/:category/:branch/", path: ":category/:branch/" },
  ];
  const pageQuery = { type: "query" as const, key: "page", value: LISTING_PAGE };
  const sortQuery = { type: "query" as const, key: "sort", value: LISTING_SORT };

  return scopes.flatMap(({ source, path }) => [
    {
      source,
      has: [pageQuery, sortQuery],
      destination: `/listing/:page/:sort/${path}`,
    },
    {
      source,
      has: [pageQuery],
      missing: [{ type: "query" as const, key: "sort" }],
      destination: `/listing/:page/default/${path}`,
    },
    {
      source,
      has: [sortQuery],
      missing: [{ type: "query" as const, key: "page" }],
      destination: `/listing/1/:sort/${path}`,
    },
  ]);
}

const nextConfig: NextConfig = {
  // Сайт работает Node-сервером под systemd, за nginx. Статического экспорта
  // больше нет: админке нужны запись, сессии и загрузка файлов, а всё это
  // требует живого сервера.
  //
  // Витрина при этом не стала медленнее. Страницы товаров и разделов
  // по-прежнему собираются заранее (generateStaticParams) и отдаются готовым
  // HTML из кеша; после сохранения в админке нужные адреса пересобираются
  // точечно через revalidatePath. См. src/lib/revalidate.ts
  //
  // Режим `standalone` намеренно не включён: он собирает отдельную папку с
  // урезанным node_modules, но public/ и .next/static туда надо докладывать
  // руками. На сервере и так лежит весь репозиторий с зависимостями, так что
  // обычный `next start` из него — меньше движущихся частей.

  // /catalog/linzy/ -> /catalog/linzy/
  // Адреса не меняются относительно прежней статической версии — это важно:
  // они уже проиндексированы.
  trailingSlash: true,

  distDir: activeDistDir(),

  // Встроенный оптимизатор картинок не используется: все размеры и форматы
  // делает наш конвейер (src/lib/image-pipeline.mjs) в момент загрузки фото,
  // а готовые файлы раздаёт nginx напрямую из public/img.
  images: { unoptimized: true },

  // Ошибки типов должны валить сборку, а не уезжать в прод.
  // Линт в Next 16 из сборки вынесен — он запускается отдельно: npm run check
  typescript: { ignoreBuildErrors: false },

  productionBrowserSourceMaps: false,

  poweredByHeader: false,

  compress: false,

  async rewrites() {
    return { beforeFiles: listingRewrites() };
  },
};

export default nextConfig;
