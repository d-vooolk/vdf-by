import Link from "next/link";
import { redirect } from "next/navigation";

import { AlertIcon, CartIcon, ChartIcon, PackageIcon, WalletIcon, WrenchIcon } from "@/components/icons";
import { DashboardTabs } from "@/components/admin/DashboardTabs";
import { NeonBars, NeonDelta, NeonLine, NeonTile } from "@/components/admin/NeonDash";
import { DataTable, Empty, formatNumber, formatPercent, Panel } from "@/components/admin/SeoParts";
import { StockBars } from "@/components/admin/StockBars";
import { getSite } from "@/lib/catalog";
import { checkStats, orderSources, RESTOCK_SOLD_DAYS, restockCandidates, serviceStats, viewedNotBought, VIEWS_DAYS } from "@/lib/dashboard";
import { formatPrice, plural } from "@/lib/format";
import { isLiteMode } from "@/lib/lite-mode";
import { orderStats, orderTimeline } from "@/lib/orders";
import { listCategoriesBrief } from "@/lib/category-store";
import { countOutOfStock, listProducts, stockByCategory } from "@/lib/product-store";

const SOURCE_DAYS = 30;
const ORDERS = ["заказ", "заказа", "заказов"] as const;

/** Сводка: с чего начинается рабочий день — сколько новых заказов и что в каталоге. */
export default function DashboardPage() {
  if (isLiteMode()) redirect("/admin/seo/");
  const site = getSite();
  const { weekCounts, weekTotals } = orderStats();
  const categories = listCategoriesBrief();
  const products = listProducts({ limit: 5 });
  const outOfStock = countOutOfStock();
  const daily = orderTimeline();
  const check = checkStats(SOURCE_DAYS);
  const service = serviceStats();
  const restock = restockCandidates();
  const viewed = viewedNotBought();
  const sources = orderSources(SOURCE_DAYS);
  const [ordersNow, ordersBefore] = [weekCounts.at(-1) ?? 0, weekCounts.at(-2) ?? 0];
  const [salesNow, salesBefore] = [weekTotals.at(-1) ?? 0, weekTotals.at(-2) ?? 0];
  const stock = stockByCategory();
  const positions = stock.reduce((sum, row) => sum + row.total, 0);
  const missingPositions = positions - stock.reduce((sum, row) => sum + row.inStock, 0);
  const missingShare = positions ? Math.round((missingPositions / positions) * 100) : 0;
  const money = (value: number) => formatPrice(Math.round(value), site.currencySymbol);
  const productLink = (id: string, title: string) => (
    <Link href={`/admin/products/${id}/`} className="text-brand-900 hover:underline">
      {title}
    </Link>
  );

  return (
    <div className="neon-dash space-y-6">
      <div>
        <DashboardTabs active="overview" />
        <h1 className="text-xl font-semibold text-brand-900">Сводка</h1>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <NeonTile
          tone="cyan"
          icon={<CartIcon />}
          label="Заказов за неделю"
          value={String(ordersNow)}
          badge={<NeonDelta current={ordersNow} previous={ordersBefore} />}
          hint={`было ${ordersBefore} за 7 дней до этого`}
          spark={weekCounts}
          href="/admin/orders/"
        />
        <NeonTile
          tone="lime"
          icon={<WalletIcon />}
          label="Продажи за неделю"
          value={formatPrice(salesNow, site.currencySymbol)}
          badge={<NeonDelta current={salesNow} previous={salesBefore} />}
          hint="без отменённых и сотрудников"
          spark={weekTotals}
        />
        <NeonTile
          tone="amber"
          icon={<ChartIcon />}
          label="Средний чек"
          value={money(check.average)}
          badge={<NeonDelta current={check.average} previous={check.previousAverage} period={`К предыдущим ${SOURCE_DAYS} дням`} />}
          hint={`за ${SOURCE_DAYS} дней; опт — ${check.wholesaleOrders} из ${check.orders} заказов, ${formatPercent(check.wholesaleRevenueShare, 0)} выручки`}
        />
        <NeonTile
          tone="violet"
          icon={<PackageIcon />}
          label="Позиций в каталоге"
          value={formatNumber(positions)}
          hint={`${formatNumber(products.total)} товаров в ${categories.length} раздел(ах); стороны считаются отдельно`}
          href="/admin/products/"
        />
        <NeonTile
          tone="pink"
          icon={<AlertIcon />}
          label="Нет в наличии"
          value={formatNumber(missingPositions)}
          hint={`${missingShare}% позиций; целиком без наличия ${formatNumber(outOfStock)} ${plural(outOfStock, "товар", "товара", "товаров")}`}
          href="/admin/out-of-stock/"
        />
        <NeonTile
          tone="sky"
          icon={<WrenchIcon />}
          label="Заявки на установку"
          value={String(service.week)}
          badge={<NeonDelta current={service.week} previous={service.previousWeek} />}
          hint={service.open ? `не закрыто: ${service.open}` : "все закрыты"}
          href="/admin/service-requests/"
        />
      </div>

      <Panel title="Заказы по дням" note="Последние 30 дней, без заказов сотрудников">
        <NeonLine points={daily} unit={ORDERS} tone="cyan" />
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel
          title="Откуда заказы"
          note={`Последние ${SOURCE_DAYS} дней, без заказов сотрудников: с какого сайта посетитель последний раз пришёл перед заказом`}
        >
          <NeonBars
            tone="lime"
            empty="Заказов с известным источником пока нет"
            rows={sources.rows.slice(0, 8).map((row) => ({
              label: row.name,
              value: row.orders,
              valueText: `${formatNumber(row.orders)} ${plural(row.orders, ...ORDERS)}`,
              note: `${money(row.revenue)} без отменённых`,
            }))}
          />
          <p className="px-4 pb-3 text-xs text-brand-400">
            {sources.trackedSince
              ? `Источник записывается в заказ с ${new Date(sources.trackedSince).toLocaleDateString("ru-RU", { timeZone: "Europe/Minsk" })}.`
              : "Источник записывается в заказы, оформленные после обновления сайта."}
            {sources.unknown &&
              ` Без источника: ${formatNumber(sources.unknown.orders)} ${plural(sources.unknown.orders, ...ORDERS)} на ${money(sources.unknown.revenue)} — оформлены раньше.`}
          </p>
        </Panel>

        <Panel title="Наличие по разделам" note="Сколько позиций каждого раздела можно заказать. Опции с остатком считаются отдельно: правое и левое стекло — две позиции">
          <StockBars rows={stock} />
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel
          title="Что заказать у поставщика"
          note={`Товары без наличия, на которые есть спрос: ждут в листе ожидания, покупали за ${RESTOCK_SOLD_DAYS} дней, смотрели за ${VIEWS_DAYS} дней`}
        >
          {restock.length ? (
            <DataTable
              headers={["Товар", "Ждут", "Продано", "Просмотры"]}
              rows={restock.map((row) => [
                productLink(row.id, row.title),
                row.waiting ? <span className="font-semibold text-red-700">{row.waiting}</span> : "—",
                row.sold || "—",
                formatNumber(row.views),
              ])}
            />
          ) : (
            <Empty>Спроса на товары без наличия не видно</Empty>
          )}
        </Panel>

        <Panel
          title="Смотрят, но не покупают"
          note={
            <>
              Товары в наличии с просмотрами за {VIEWS_DAYS} дней и без единого заказа.
              {viewed.viewsPerOrder !== null && <> В среднем по сайту 1 заказ на {formatNumber(viewed.viewsPerOrder)} просмотров товаров.</>}
            </>
          }
        >
          {viewed.rows.length ? (
            <DataTable
              headers={["Товар", "Цена", "Просмотры"]}
              rows={viewed.rows.map((row) => [productLink(row.id, row.title), money(row.price), formatNumber(row.views)])}
            />
          ) : (
            <Empty>Таких товаров нет</Empty>
          )}
        </Panel>
      </div>
    </div>
  );
}
