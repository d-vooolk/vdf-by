import { buildPriceList } from "@/lib/prices";

/**
 * Карта актуальных цен по всем комбинациям опций.
 *
 * Её скачивает корзина, чтобы сверить цены, сохранённые в localStorage.
 * Расчёт общий с приёмом заказа — см. src/lib/prices.ts.
 *
 * Файл кешируется как статический и пересобирается вместе с каталогом, когда
 * в админке меняют цену (см. src/lib/revalidate.ts).
 */
export const dynamic = "force-static";

export function GET() {
  return Response.json(buildPriceList(), { headers: { "x-robots-tag": "noindex" } });
}
