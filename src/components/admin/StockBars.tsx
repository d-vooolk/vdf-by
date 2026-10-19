import Link from "next/link";

import type { CategoryStock } from "@/lib/product-store";

import { Empty, formatNumber } from "./SeoParts";

function Swatch({ color }: { color: string }) {
  return <span className="inline-block h-2.5 w-2.5 rounded-[3px]" style={{ background: color }} aria-hidden />;
}

export function StockBars({ rows }: { rows: CategoryStock[] }) {
  if (!rows.length) return <Empty />;

  return (
    <figure className="px-4 py-3">
      <div className="mb-3 flex flex-wrap gap-4 text-xs text-brand-500">
        <span className="inline-flex items-center gap-1.5">
          <Swatch color="var(--a-chart-1)" />В наличии
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Swatch color="var(--a-chart-2)" />Нет в наличии
        </span>
      </div>
      <ul className="space-y-2.5">
        {rows.map((row) => {
          const missing = row.total - row.inStock;
          const share = row.total ? (row.inStock / row.total) * 100 : 0;
          return (
            <li key={row.id} className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)_6rem] items-center gap-3 text-xs">
              <Link
                href={`/admin/products/?category=${encodeURIComponent(row.id)}`}
                className="truncate text-brand-700 hover:underline"
                title={row.name}
              >
                {row.name}
              </Link>
              <div className="flex h-3 gap-[2px]" role="img" aria-label={`${row.name}: в наличии ${row.inStock} из ${row.total}`}>
                {row.inStock > 0 && (
                  <span
                    className="h-full rounded-l-[4px] last:rounded-r-[4px] hover:brightness-110"
                    style={{ width: `${share}%`, minWidth: 2, background: "var(--a-chart-1)" }}
                    title={`${row.name}: в наличии ${formatNumber(row.inStock)}`}
                  />
                )}
                {missing > 0 && (
                  <span
                    className="h-full rounded-r-[4px] first:rounded-l-[4px] hover:brightness-110"
                    style={{ width: `${100 - share}%`, minWidth: 2, background: "var(--a-chart-2)" }}
                    title={`${row.name}: нет в наличии ${formatNumber(missing)}`}
                  />
                )}
              </div>
              <span className="tnum text-right whitespace-nowrap text-brand-500">
                {formatNumber(row.inStock)} из {formatNumber(row.total)}
              </span>
            </li>
          );
        })}
      </ul>
      <figcaption className="mt-3 text-xs text-brand-400">
        Доля товаров в наличии внутри каждого раздела, разделы — по числу товаров. Наведите на полосу — покажется
        число.
      </figcaption>
    </figure>
  );
}
