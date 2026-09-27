import { buildSearchIndex } from "@/lib/search-index";

/**
 * Индекс для поиска по каталогу.
 *
 * Лежит отдельным файлом и качается только когда пользователь коснулся поля
 * поиска: на скорость главной и каталога он не влияет вообще. Сторонний
 * поисковый сервис при 300–1000 товарах не нужен — фильтрация массива в
 * браузере занимает доли миллисекунды.
 */
export const dynamic = "force-static";

export function GET() {
  return Response.json(buildSearchIndex(), { headers: { "x-robots-tag": "noindex" } });
}
