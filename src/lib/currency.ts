import { isPairValue, isSidesGroup } from "./side-options";

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

interface LinkedOption {
  id?: string;
  label?: string;
  price?: number;
  priceSource?: MoneySource;
  wholesalePrice?: number;
  wholesaleSource?: MoneySource;
}

export function hasLinkedOptions(values: LinkedValues): boolean {
  return Boolean(
    values.optionGroups?.some((group) =>
      group.values.some((value) => value.priceSource || value.wholesaleSource),
    ),
  );
}

function relinkOption<T extends LinkedOption>(value: T, rates: CurrencyRates): T {
  const next = { ...value };
  const priceRate = next.priceSource ? rates[next.priceSource.currency] : null;
  if (next.priceSource && priceRate) {
    next.price = convertToByn(next.priceSource.amount, priceRate.rate, "ruble");
  }
  const wholesaleRate = next.wholesaleSource ? rates[next.wholesaleSource.currency] : null;
  if (next.wholesaleSource && wholesaleRate) {
    next.wholesalePrice = convertToByn(next.wholesaleSource.amount, wholesaleRate.rate, "ruble");
  }
  return next;
}

function isDoubleOf(pair: MoneySource | undefined, single: MoneySource | undefined): boolean {
  return Boolean(pair && single && pair.currency === single.currency && Math.abs(pair.amount - single.amount * 2) < 0.005);
}

function pairFromSingle<T extends LinkedOption>(pair: T, single: LinkedOption): T {
  const next = { ...pair };
  if (single.price !== undefined && isDoubleOf(pair.priceSource, single.priceSource)) next.price = single.price * 2;
  if (single.wholesalePrice !== undefined && isDoubleOf(pair.wholesaleSource, single.wholesaleSource)) {
    next.wholesalePrice = single.wholesalePrice * 2;
  }
  return next;
}

function relinkGroup<G extends LinkedGroup>(group: G, rates: CurrencyRates): G {
  const values = group.values.map((value) => relinkOption(value, rates));
  const sides = group.id !== undefined && group.name !== undefined && isSidesGroup({ id: group.id, name: group.name });
  const single = sides ? values.find((value) => !isPairValue({ id: value.id ?? "", label: value.label ?? "" })) : undefined;
  return {
    ...group,
    values: single
      ? values.map((value) => (isPairValue({ id: value.id ?? "", label: value.label ?? "" }) ? pairFromSingle(value, single) : value))
      : values,
  };
}

interface LinkedGroup {
  id?: string;
  name?: string;
  values: LinkedOption[];
}

export type LinkedValues = {
  optionGroups?: LinkedGroup[];
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
  if (next.optionGroups && hasLinkedOptions(next)) {
    next.optionGroups = next.optionGroups.map((group) => relinkGroup(group, rates));
  }
  return next;
}

export function describeRate(currency: ForeignCurrency, rate: RateEntry): string {
  const scale = currency === "RUB" ? 100 : 1;
  const date = rate.date.split("-").reverse().join(".");
  return `${(rate.rate * scale).toFixed(4)} BYN за ${scale} ${FOREIGN_CURRENCIES[currency]} на ${date}`;
}
