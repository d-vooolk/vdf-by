import Link from "next/link";

import { DashboardTabs } from "@/components/admin/DashboardTabs";
import { DailyBars, Panel } from "@/components/admin/SeoParts";
import { StockBars } from "@/components/admin/StockBars";
import { getSite } from "@/lib/catalog";
import { formatPrice } from "@/lib/format";
import { orderStats, orderTimeline } from "@/lib/orders";
import { listCategoriesBrief } from "@/lib/category-store";
import { countOutOfStock, listProducts, stockByCategory } from "@/lib/product-store";

/** Сводка: с чего начинается рабочий день — сколько новых заказов и что в каталоге. */
export default function DashboardPage() {
  const site = getSite();
  const stats = orderStats();
  const categories = listCategoriesBrief();
  const products = listProducts({ limit: 5 });
  const outOfStock = countOutOfStock();
  const timeline = orderTimeline();
  const money = [site.currencySymbol, site.currencySymbol, site.currencySymbol] as const;

  return (
    <div className="space-y-6">
      <div>
        <DashboardTabs active="overview" />
        <h1 className="text-xl font-semibold text-brand-900">Сводка</h1>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Stat
          label="Новых заказов"
          value={String(stats.newCount)}
          hint={stats.newCount > 0 ? "ждут звонка" : "всё обработано"}
          href="/admin/orders/?status=new"
          accent={stats.newCount > 0}
        />
        <Stat
          label="Заказов за сутки"
          value={String(stats.todayCount)}
          href="/admin/orders/?status=new"
        />
        <Stat
          label="Продажи за неделю"
          value={formatPrice(stats.weekTotal, site.currencySymbol)}
          hint="без отменённых"
        />
        <Stat
          label="Товаров в каталоге"
          value={String(products.total)}
          hint={`${categories.length} раздел(ов)`}
          href="/admin/products/"
        />
        <Stat
          label="Нет в наличии"
          value={String(outOfStock)}
          hint="кнопки заказа у них нет"
          href="/admin/out-of-stock/"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Заказы по дням" note="Последние 30 дней, все заказы — как в плитке «Заказов за сутки»">
          <DailyBars points={timeline.daily} unit={["заказ", "заказа", "заказов"]} />
        </Panel>
        <Panel title="Продажи по неделям" note="Последние 12 недель, без отменённых; неделя — с понедельника">
          <DailyBars points={timeline.weekly} unit={money} step="week" />
        </Panel>
      </div>

      <Panel title="Наличие по разделам" note="Сколько товаров каждого раздела можно заказать — к плиткам «Товаров в каталоге» и «Нет в наличии»">
        <StockBars rows={stockByCategory()} />
      </Panel>

    </div>
  );
}

/* ------------------------------------------------------------------ */

interface StatProps {
  label: string;
  value: string;
  hint?: string;
  href?: string;
  accent?: boolean;
}

function Stat({ label, value, hint, href, accent }: StatProps) {
  const body = (
    <>
      <p className="text-xs font-medium text-brand-400">{label}</p>
      <p
        className={`tnum mt-1 text-2xl font-semibold ${
          accent ? "text-amber-600" : "text-brand-900"
        }`}
      >
        {value}
      </p>
      {hint && <p className="mt-0.5 text-xs text-brand-400">{hint}</p>}
    </>
  );

  return href ? (
    <Link href={href} className="card block p-4 transition-colors hover:bg-brand-50">
      {body}
    </Link>
  ) : (
    <div className="card p-4">{body}</div>
  );
}
