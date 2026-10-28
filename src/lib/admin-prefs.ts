export const LAST_CATEGORY_COOKIE = "admin-last-category";

export const PRODUCTS_VIEW_COOKIE = "admin-products-view";
export const FRAME_TYPES_VIEW_COOKIE = "admin-frame-types-view";

export const PRODUCTS_VIEWS = [
  { id: "standard", label: "Стандартный" },
  { id: "wholesale", label: "Опт" },
  { id: "warehouse", label: "Склад" },
] as const;

export type ProductsView = (typeof PRODUCTS_VIEWS)[number]["id"];

export function parseProductsView(value: string | undefined): ProductsView {
  return PRODUCTS_VIEWS.find((view) => view.id === value)?.id ?? "standard";
}

export const ADMIN_THEME_COOKIE = "admin-theme";

export const ADMIN_THEMES = [
  { id: "dark", label: "Тёмная" },
  { id: "light", label: "Светлая" },
] as const;

export type AdminTheme = (typeof ADMIN_THEMES)[number]["id"];

export function parseAdminTheme(value: string | undefined): AdminTheme {
  return value === "light" ? "light" : "dark";
}

export const BOTTOM_NAV_COOKIE = "admin-bottom-nav";

export const BOTTOM_NAV_MAX = 5;

export const DEFAULT_BOTTOM_NAV = [
  "/admin/",
  "/admin/orders/",
  "/admin/products/",
  "/admin/frame-types/",
  "/admin/service-requests/",
];

export function parseBottomNav(value: string | undefined): string[] | null {
  if (!value) return null;
  const paths = decodeURIComponent(value)
    .split(",")
    .filter((path) => /^\/admin\/[a-z0-9/-]*$/.test(path));
  return paths.length ? paths.slice(0, BOTTOM_NAV_MAX) : null;
}

export function writeAdminCookie(name: string, value: string | null): void {
  const expires = value === null ? "Max-Age=0" : "Max-Age=31536000";
  document.cookie = `${name}=${value === null ? "" : encodeURIComponent(value)}; Path=/admin; ${expires}; SameSite=Lax`;
}
