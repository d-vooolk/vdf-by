export const FOREIGN_CURRENCIES = { RUB: "₽", USD: "$" } as const;

export type ForeignCurrency = keyof typeof FOREIGN_CURRENCIES;

export interface MoneySource {
  amount: number;
  currency: ForeignCurrency;
}

export interface RateEntry {
  rate: number;
  date: string;
}

export type CurrencyRates = Record<ForeignCurrency, RateEntry | null>;

export type Rounding = "ruble" | "kopeck";

export const LINKED_FIELDS = [
  { value: "price", source: "priceSource", rounding: "ruble" },
  { value: "wholesalePrice", source: "wholesaleSource", rounding: "ruble" },
  { value: "costPrice", source: "costSource", rounding: "kopeck" },
] as const;

export type LinkedValues = {
  price?: number | null;
  wholesalePrice?: number | null;
  costPrice?: number | null;
  priceSource?: MoneySource | null;
  wholesaleSource?: MoneySource | null;
  costSource?: MoneySource | null;
};

export function isForeignCurrency(value: unknown): value is ForeignCurrency {
  return typeof value === "string" && Object.hasOwn(FOREIGN_CURRENCIES, value);
}

export function convertToByn(amount: number, rate: number, rounding: Rounding): number {
  const exact = Math.round(amount * rate * 100) / 100;
  return rounding === "ruble" ? Math.ceil(exact) : exact;
}

export function relinkValues<T extends LinkedValues>(values: T, rates: CurrencyRates): T {
  const next = { ...values };
  for (const field of LINKED_FIELDS) {
    const source = next[field.source];
    const rate = source ? rates[source.currency] : null;
    if (source && rate) next[field.value] = convertToByn(source.amount, rate.rate, field.rounding);
  }
  return next;
}

export function describeRate(currency: ForeignCurrency, rate: RateEntry): string {
  const scale = currency === "RUB" ? 100 : 1;
  const date = rate.date.split("-").reverse().join(".");
  return `${(rate.rate * scale).toFixed(4)} BYN за ${scale} ${FOREIGN_CURRENCIES[currency]} на ${date}`;
}
