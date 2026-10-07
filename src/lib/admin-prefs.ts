export const LAST_CATEGORY_COOKIE = "admin-last-category";

export const PRODUCTS_VIEW_COOKIE = "admin-products-view";

export const PRODUCTS_VIEWS = [
  { id: "standard", label: "Стандартный" },
  { id: "wholesale", label: "Опт" },
  { id: "warehouse", label: "Склад" },
] as const;

export type ProductsView = (typeof PRODUCTS_VIEWS)[number]["id"];

export function parseProductsView(value: string | undefined): ProductsView {
  return PRODUCTS_VIEWS.find((view) => view.id === value)?.id ?? "standard";
}
