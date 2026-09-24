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
};

export default nextConfig;
