"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  addToFrameTypeAction,
  removeFromFrameTypeAction,
  setProductCarsAction,
} from "@/app/admin/actions";
import { CarFitmentEditor } from "@/components/admin/CarFitmentEditor";
import { AlertIcon, PlusIcon } from "@/components/icons";
import { years, type ProductCar } from "@/lib/car-types";

const THIS_YEAR = new Date().getFullYear();
const SEARCH_LIMIT = 30;

export interface FrameTypeProductRow {
  id: string;
  title: string;
  sku: string;
  price: string;
  stockQty: number | null;
  cars: ProductCar[];
}

export interface FrameTypeCandidate {
  id: string;
  title: string;
  sku: string;
  currentType: string;
}

function carLabel(car: ProductCar): string {
  return `${car.markName} ${car.modelName} ${car.generationName} ${years(car, THIS_YEAR)}`.trim();
}

function CarsCell({ product }: { product: FrameTypeProductRow }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [cars, setCars] = useState(product.cars);
  const [problem, setProblem] = useState("");
  const [pending, startTransition] = useTransition();

  const save = () =>
    startTransition(async () => {
      setProblem("");
      const result = await setProductCarsAction(
        product.id,
        cars.map((car) => car.generationId),
      );
      if (!result.ok) {
        setProblem(result.problems.join(" "));
        return;
      }
      setEditing(false);
      router.refresh();
    });

  if (!editing) {
    return (
      <div className="space-y-1">
        {product.cars.length ? (
          <ul className="space-y-0.5 text-xs text-brand-600">
            {product.cars.map((car) => (
              <li key={car.generationId}>{carLabel(car)}</li>
            ))}
          </ul>
        ) : (
          <span className="text-xs text-amber-700">машина не указана</span>
        )}
        <button type="button" onClick={() => setEditing(true)} className="text-xs text-brand-600 underline">
          Изменить машины
        </button>
      </div>
    );
  }

  return (
    <div className="min-w-[22rem] space-y-2">
      <CarFitmentEditor value={cars} onChange={setCars} />
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={save} disabled={pending} className="btn-primary py-1.5 text-xs">
          {pending ? "Сохраняем…" : "Сохранить машины"}
        </button>
        <button
          type="button"
          onClick={() => {
            setCars(product.cars);
            setEditing(false);
          }}
          className="btn-ghost py-1.5 text-xs"
        >
          Отмена
        </button>
      </div>
      {problem && <p className="text-xs text-red-700">{problem}</p>}
    </div>
  );
}

export function FrameTypeProducts({
  categoryId,
  type,
  products,
  candidates,
}: {
  categoryId: string;
  type: string;
  products: FrameTypeProductRow[];
  candidates: FrameTypeCandidate[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [problem, setProblem] = useState("");
  const [pending, startTransition] = useTransition();

  const run = (action: () => Promise<{ ok: boolean; problems: string[] }>) =>
    startTransition(async () => {
      setProblem("");
      const result = await action();
      if (!result.ok) {
        setProblem(result.problems.join(" "));
        return;
      }
      router.refresh();
    });

  const needle = query.trim().toLowerCase();
  const found = needle
    ? candidates
        .filter(
          (candidate) =>
            candidate.title.toLowerCase().includes(needle) || candidate.sku.toLowerCase().includes(needle),
        )
        .slice(0, SEARCH_LIMIT)
    : [];

  return (
    <section className="space-y-3">
      <h2 className="font-semibold text-brand-900">
        Товары с этим типом <span className="tnum text-brand-400">{products.length}</span>
      </h2>

      {products.length === 0 ? (
        <p className="card p-8 text-center text-sm text-brand-400">
          В типе пока нет товаров — добавьте их ниже.
        </p>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-brand-400">
              <tr>
                <th className="px-4 py-2 font-medium">Товар</th>
                <th className="px-3 py-2 font-medium">Артикул</th>
                <th className="px-3 py-2 font-medium">Машины</th>
                <th className="px-3 py-2 text-right font-medium">Цена</th>
                <th className="px-3 py-2 text-right font-medium">Остаток</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-100 align-top">
              {products.map((product) => (
                <tr key={product.id}>
                  <td className="px-4 py-2">
                    <Link href={`/admin/products/${product.id}/`} className="text-brand-900 hover:text-brand-600">
                      {product.title}
                    </Link>
                  </td>
                  <td className="tnum px-3 py-2 whitespace-nowrap text-brand-500">{product.sku}</td>
                  <td className="px-3 py-2">
                    <CarsCell key={product.cars.map((car) => car.generationId).join()} product={product} />
                  </td>
                  <td className="tnum px-3 py-2 text-right whitespace-nowrap">{product.price}</td>
                  <td className="tnum px-3 py-2 text-right">{product.stockQty ?? "—"}</td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => run(() => removeFromFrameTypeAction(categoryId, product.id))}
                      className="text-xs whitespace-nowrap text-red-700 underline"
                    >
                      Убрать из типа
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="card space-y-3 p-4">
        <label className="block">
          <span className="label">Добавить товар из раздела</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Название или артикул"
            className="field py-2 text-sm"
          />
        </label>
        <p className="text-xs text-brand-400">
          Артикул товара перепишется на «номер-дополнение-{type}», а цены, остаток и складской
          номер возьмутся из типа. Товар из другого типа переедет в этот.
        </p>
        {needle && (
          <ul className="divide-y divide-brand-100 rounded-lg border border-brand-100">
            {found.length === 0 && <li className="px-3 py-2 text-sm text-brand-400">Ничего не нашлось</li>}
            {found.map((candidate) => (
              <li key={candidate.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate text-brand-900">{candidate.title}</span>
                <span className="tnum text-xs text-brand-500">{candidate.sku || "без артикула"}</span>
                {candidate.currentType && (
                  <span className="badge bg-amber-100 text-amber-900">сейчас в типе {candidate.currentType}</span>
                )}
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => run(() => addToFrameTypeAction(categoryId, type, candidate.id))}
                  className="btn-secondary py-1 text-xs"
                >
                  <PlusIcon className="h-3.5 w-3.5" />
                  Добавить
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {problem && (
        <p className="flex items-start gap-1.5 text-sm text-red-700" role="alert">
          <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
          {problem}
        </p>
      )}
    </section>
  );
}
