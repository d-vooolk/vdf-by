"use client";

import { useSyncExternalStore } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Корзина. Живёт в localStorage: бэкенда нет, и это ровно то место, где
 * состояние корзины и должно храниться на статическом сайте.
 *
 * Цена сохраняется на момент добавления, а на странице корзины сверяется с
 * актуальной из /variants.json — иначе корзина, полежавшая неделю, покажет
 * старую цену, и клиент увидит одну сумму, а менеджер другую.
 */

export interface CartOption {
  groupName: string;
  label: string;
}

export interface CartItem {
  /** variantKey: товар + выбранные опции. Уникален в пределах корзины. */
  key: string;
  productId: string;
  slug: string;
  title: string;
  /** «H7 · 5000K», пусто если у товара нет опций. */
  optionLabel: string;
  options: CartOption[];
  price: number;
  unit?: string;
  sku?: string | null;
  imageUrl?: string | null;
  stock?: number;
  qty: number;
}

export interface StockCut {
  title: string;
  stock: number;
}

interface CartState {
  items: CartItem[];
  add: (item: Omit<CartItem, "qty">, qty?: number) => void;
  remove: (key: string) => void;
  setQty: (key: string, qty: number) => void;
  /** Подтянуть актуальные цены и наличие. Возвращает список изменений. */
  reprice: (prices: Record<string, { price: number; inStock: boolean; stock?: number }>) => {
    priceChanges: Array<{ title: string; from: number; to: number }>;
    stockCuts: StockCut[];
  };
  clear: () => void;
}

const MAX_QTY = 99;

export function lineLimit(line: Pick<CartItem, "stock">): number {
  return Math.min(MAX_QTY, line.stock ?? MAX_QTY);
}

function lineTitle(line: CartItem): string {
  return `${line.title}${line.optionLabel ? ` (${line.optionLabel})` : ""}`;
}

export const useCart = create<CartState>()(
  persist(
    (set) => ({
      items: [],

      add: (item, qty = 1) =>
        set((state) => {
          const existing = state.items.find((line) => line.key === item.key);
          if (existing) {
            return {
              items: state.items.map((line) => {
                if (line.key !== item.key) return line;
                const next = { ...line, ...item };
                return { ...next, qty: Math.min(lineLimit(next), line.qty + qty) };
              }),
            };
          }
          const added = Math.min(lineLimit(item), qty);
          return added < 1 ? state : { items: [...state.items, { ...item, qty: added }] };
        }),

      remove: (key) =>
        set((state) => ({
          items: state.items.filter((line) => line.key !== key),
        })),

      setQty: (key, qty) =>
        set((state) => ({
          items: state.items.flatMap((line) => {
            if (line.key !== key) return [line];
            const next = Math.min(lineLimit(line), Math.floor(qty));
            // Количество 0 — это удаление позиции, а не строка с нулём.
            return next < 1 ? [] : [{ ...line, qty: next }];
          }),
        })),

      reprice: (prices) => {
        const priceChanges: Array<{ title: string; from: number; to: number }> = [];
        const stockCuts: StockCut[] = [];
        set((state) => ({
          items: state.items.flatMap((line) => {
            const actual = prices[line.key];
            if (!actual) return [line];
            if (actual.price !== line.price) {
              priceChanges.push({ title: lineTitle(line), from: line.price, to: actual.price });
            }
            const next: CartItem = { ...line, price: actual.price, stock: actual.stock };
            if (actual.stock === undefined) delete next.stock;
            const qty = Math.min(line.qty, lineLimit(next));
            if (qty < line.qty) stockCuts.push({ title: lineTitle(line), stock: Math.max(0, qty) });
            return qty < 1 ? [] : [{ ...next, qty }];
          }),
        }));
        return { priceChanges, stockCuts };
      },

      clear: () => set({ items: [] }),
    }),
    {
      name: "vdf-cart-v1",
      version: 1,
      partialize: (state) => ({ items: state.items }),
    },
  ),
);

/* ------------------------------------------------------------------ */
/* Селекторы                                                           */
/* ------------------------------------------------------------------ */

export function cartCount(items: CartItem[]): number {
  return items.reduce((sum, line) => sum + line.qty, 0);
}

export function cartTotal(items: CartItem[]): number {
  return items.reduce((sum, line) => sum + line.price * line.qty, 0);
}

/**
 * Страницы сгенерированы на сборке, когда корзина ещё пуста, а в браузере
 * zustand поднимает её из localStorage до первого рендера. Если показать
 * настоящее число сразу, React сообщит о несовпадении разметки — поэтому до
 * гидратации отдаём false.
 *
 * useSyncExternalStore вместо useState + useEffect: у него отдельный
 * снимок для сервера, поэтому «на сервере false, в браузере true» получается
 * без лишнего рендера и без setState внутри эффекта.
 */
const neverChanges = () => () => {};

export function useHydrated(): boolean {
  return useSyncExternalStore(
    neverChanges,
    () => true, // в браузере
    () => false, // при генерации на сборке
  );
}
