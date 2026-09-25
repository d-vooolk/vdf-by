import Link from "next/link";
import { notFound } from "next/navigation";

import { FrameTypeForm } from "@/components/admin/FrameTypeForm";
import { getSite } from "@/lib/catalog";
import { formatPrice } from "@/lib/format";
import {
  defaultFrameCategory,
  frameCategories,
  listFrameTypes,
  type FrameTypeValues,
} from "@/lib/frame-types";

interface PageProps {
  params: Promise<{ type: string }>;
  searchParams: Promise<{ category?: string }>;
}

export async function generateMetadata({ params }: PageProps) {
  const { type } = await params;
  return { title: `Тип рамки ${type}` };
}

export default async function FrameTypePage({ params, searchParams }: PageProps) {
  const { type } = await params;
  if (!/^\d{3}$/.test(type)) notFound();
  const { category } = await searchParams;
  const categories = frameCategories();
  const categoryId =
    categories.find((entry) => entry.id === category)?.id ?? defaultFrameCategory(categories);
  const group = listFrameTypes(categoryId).find((entry) => entry.type === type);
  const site = getSite();
  const money = (value: number | null) =>
    value === null || value <= 0 ? "—" : formatPrice(value, site.currencySymbol);

  const products = group?.products ?? [];
  const first = products[0];
  const initial: FrameTypeValues = group?.saved ??
    (first && group?.uniform
      ? {
          costPrice: first.costPrice,
          price: first.price > 0 ? first.price : null,
          wholesalePrice: first.wholesalePrice,
          stockQty: first.stockQty,
          inStock: first.inStock,
        }
      : { costPrice: null, price: null, wholesalePrice: null, stockQty: null, inStock: false });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href={`/admin/frame-types/?category=${encodeURIComponent(categoryId)}`}
          className="btn-ghost py-2 text-sm"
        >
          ← Все типы
        </Link>
        <h1 className="text-xl font-semibold text-brand-900">Тип рамки {type}</h1>
      </div>

      <FrameTypeForm
        key={`${categoryId}-${type}`}
        categoryId={categoryId}
        type={type}
        initial={initial}
        count={products.length}
        currencySymbol={site.currencySymbol}
      />

      <section className="space-y-2">
        <h2 className="font-semibold text-brand-900">
          Товары с этим типом <span className="tnum text-brand-400">{products.length}</span>
        </h2>
        {products.length === 0 ? (
          <p className="card p-8 text-center text-sm text-brand-400">
            В разделе нет товаров с артикулом на {type}.
          </p>
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-brand-400">
                <tr>
                  <th className="px-4 py-2 font-medium">Товар</th>
                  <th className="px-3 py-2 font-medium">Артикул</th>
                  <th className="px-3 py-2 text-right font-medium">Себест.</th>
                  <th className="px-3 py-2 text-right font-medium">Цена</th>
                  <th className="px-3 py-2 text-right font-medium">Опт</th>
                  <th className="px-3 py-2 text-right font-medium">Остаток</th>
                  <th className="px-3 py-2 font-medium">Наличие</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-100">
                {products.map((product) => (
                  <tr key={product.id}>
                    <td className="px-4 py-2">
                      <Link
                        href={`/admin/products/${product.id}/`}
                        className="text-brand-900 hover:text-brand-600"
                      >
                        {product.title}
                      </Link>
                    </td>
                    <td className="tnum px-3 py-2 text-brand-500">{product.sku}</td>
                    <td className="tnum px-3 py-2 text-right">{money(product.costPrice)}</td>
                    <td className="tnum px-3 py-2 text-right">{money(product.price)}</td>
                    <td className="tnum px-3 py-2 text-right">{money(product.wholesalePrice)}</td>
                    <td className="tnum px-3 py-2 text-right">{product.stockQty ?? "—"}</td>
                    <td className="px-3 py-2">{product.inStock ? "есть" : "нет"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
