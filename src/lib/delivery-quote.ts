import type { DeliveryMethod, WeightTariff } from "./schema";

export interface ParcelLine {
  weight: number | null;
  categoryId: string;
  qty: number;
}

export interface Parcel {
  weight: number;
  glass: boolean;
}

export const MM_COURIER_TARIFF: WeightTariff = {
  homeCity: "Минск",
  inCity: [
    { upTo: 3, price: 22.9 },
    { upTo: 5, price: 23 },
    { upTo: 10, price: 38.5 },
    { upTo: 15, price: 38.7 },
    { upTo: 20, price: 38.9 },
    { upTo: 30, price: 39.1 },
  ],
  intercity: [
    { upTo: 3, price: 23.1 },
    { upTo: 5, price: 23.3 },
    { upTo: 10, price: 38.9 },
    { upTo: 15, price: 46.2 },
    { upTo: 20, price: 48.8 },
    { upTo: 30, price: 54.4 },
    { upTo: 40, price: 61.8 },
    { upTo: 50, price: 67.3 },
  ],
  glassCategoryIds: ["glasses"],
  glassPercent: 20,
  defaultItemWeight: 1,
};

function normalizeCity(value: string): string {
  return value
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/(^|\s)(г|гор|город)\.?\s+/g, "$1")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export function isHomeCity(tariff: WeightTariff, city: string): boolean {
  const home = normalizeCity(tariff.homeCity);
  const wanted = normalizeCity(city);
  return Boolean(wanted) && (wanted === home || wanted.split(" ")[0] === home);
}

export function parcelOf(lines: ParcelLine[], tariff: WeightTariff): Parcel {
  const weight = lines.reduce((sum, line) => sum + (line.weight ?? tariff.defaultItemWeight) * line.qty, 0);
  const glass = lines.some((line) => tariff.glassCategoryIds.includes(line.categoryId));
  return { weight: Math.round(weight * 1000) / 1000, glass };
}

export function tariffPrice(tariff: WeightTariff, parcel: Parcel, city: string): number | null {
  const bands = [...(isHomeCity(tariff, city) ? tariff.inCity : tariff.intercity)].sort((a, b) => a.upTo - b.upTo);
  const band = bands.find((entry) => parcel.weight <= entry.upTo);
  if (!band) return null;
  const price = parcel.glass ? band.price * (1 + tariff.glassPercent / 100) : band.price;
  return Math.round(price * 100) / 100;
}

export function deliveryPrice(
  method: DeliveryMethod,
  subtotal: number,
  parcel: Parcel | null,
  city: string,
): number | null {
  if (method.freeFrom != null && subtotal >= method.freeFrom) return 0;
  if (!method.weightTariff) return method.price;
  if (!parcel) return null;
  return tariffPrice(method.weightTariff, parcel, city);
}
