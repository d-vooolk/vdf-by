import type { OptionGroup, OptionValue, Product } from "./schema";

export const SIDES_GROUP_ID = "storona";
export const SIDE_WEIGHT_KG = 0.5;

type MoneySource = NonNullable<Product["priceSource"]>;

export interface SideBase {
  price: number;
  oldPrice?: number | null;
  wholesalePrice?: number | null;
  priceSource?: MoneySource | null;
  wholesaleSource?: MoneySource | null;
  weight?: number | null;
  sku?: string | null;
}

const PAIR_ID = "para";
const SINGLE_SIDES = [
  { id: "pravoe", label: "Правое", suffix: "R" },
  { id: "levoe", label: "Левое", suffix: "L" },
];
const PAIR_SUFFIX = "P";

function sideSku(base: SideBase, suffix: string): string | undefined {
  const sku = base.sku?.trim();
  return sku ? `${sku}-${suffix}` : undefined;
}

function suffixOf(value: OptionValue): string | null {
  if (value.id === PAIR_ID || /пара|комплект/i.test(value.label)) return PAIR_SUFFIX;
  if (/прав/i.test(value.label)) return "R";
  if (/лев/i.test(value.label)) return "L";
  return null;
}

export function isPairValue(value: Pick<OptionValue, "id" | "label">): boolean {
  return suffixOf(value as OptionValue) === PAIR_SUFFIX;
}

const round = (value: number) => Math.round(value * 100) / 100;

function doubled(source: MoneySource | null | undefined): MoneySource | undefined {
  return source ? { ...source, amount: round(source.amount * 2) } : undefined;
}

function sideFields(base: SideBase, factor: 1 | 2): Partial<OptionValue> {
  const weight = round((base.weight || SIDE_WEIGHT_KG) * factor);
  return {
    price: base.price > 0 ? round(base.price * factor) : undefined,
    oldPrice: base.oldPrice ? round(base.oldPrice * factor) : undefined,
    wholesalePrice: base.wholesalePrice ? round(base.wholesalePrice * factor) : undefined,
    priceSource: factor === 2 ? doubled(base.priceSource) : (base.priceSource ?? undefined),
    wholesaleSource: factor === 2 ? doubled(base.wholesaleSource) : (base.wholesaleSource ?? undefined),
    weight,
  };
}

function withoutEmpty(value: OptionValue): OptionValue {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as OptionValue;
}

export function sidesGroup(base: SideBase): OptionGroup {
  return {
    id: SIDES_GROUP_ID,
    name: "Сторона",
    values: [
      ...SINGLE_SIDES.map(({ suffix, ...side }) =>
        withoutEmpty({ ...side, ...sideFields(base, 1), sku: sideSku(base, suffix) } as OptionValue),
      ),
      withoutEmpty({ id: PAIR_ID, label: "Пара", ...sideFields(base, 2), sku: sideSku(base, PAIR_SUFFIX) } as OptionValue),
    ],
  };
}

export function isSidesGroup(group: Pick<OptionGroup, "id" | "name">): boolean {
  return group.id === SIDES_GROUP_ID || /^сторона$/i.test(group.name.trim());
}

export interface SideValues {
  right: OptionValue;
  left: OptionValue;
  pair: OptionValue;
}

export function sideValues(group: OptionGroup): SideValues | null {
  if (!isSidesGroup(group)) return null;
  const find = (suffix: string) => group.values.find((value) => suffixOf(value) === suffix);
  const right = find("R");
  const left = find("L");
  const pair = find(PAIR_SUFFIX);
  return right && left && pair ? { right, left, pair } : null;
}

export function refreshSides(group: OptionGroup, base: SideBase): OptionGroup {
  return {
    ...group,
    values: group.values.map((value) => {
      const suffix = suffixOf(value);
      const sku = suffix ? sideSku(base, suffix) : undefined;
      return withoutEmpty({
        ...value,
        ...sideFields(base, suffix === PAIR_SUFFIX ? 2 : 1),
        ...(sku ? { sku } : {}),
      });
    }),
  };
}

export function withSideWeight(
  group: OptionGroup,
  unitWeight: number | null | undefined,
  baseWeight: number | null | undefined,
): OptionGroup {
  const sides = sideValues(group);
  if (!sides) return group;
  const unit = unitWeight && unitWeight > 0 ? round(unitWeight) : undefined;
  const pairUnit = unit ?? (baseWeight && baseWeight > 0 ? baseWeight : undefined);
  const pairWeight = pairUnit ? round(pairUnit * 2) : undefined;
  return {
    ...group,
    values: group.values.map((value) => {
      if (value !== sides.right && value !== sides.left && value !== sides.pair) return value;
      const next = { ...value };
      const weight = value === sides.pair ? pairWeight : unit;
      if (weight === undefined) delete next.weight;
      else next.weight = weight;
      return next;
    }),
  };
}

export function normalizeSideWeight(group: OptionGroup, baseWeight: number | null | undefined): OptionGroup {
  const sides = sideValues(group);
  if (!sides) return group;
  return withSideWeight(group, sides.right.weight ?? sides.left.weight, baseWeight);
}
