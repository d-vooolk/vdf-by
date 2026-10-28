export type SellerMode = "staff" | "retail" | "wholesale";

export const SELLER_MODES: ReadonlyArray<{ id: SellerMode; label: string }> = [
  { id: "staff", label: "Сотрудник" },
  { id: "retail", label: "Покупатель" },
  { id: "wholesale", label: "Оптовик" },
];

export const SELLER_MODE_COOKIE = "vdf_mode";

export function parseSellerMode(value: string | undefined): SellerMode {
  return SELLER_MODES.find((mode) => mode.id === value)?.id ?? "staff";
}
