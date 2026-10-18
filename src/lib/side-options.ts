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
}

const PAIR_ID = "para";
const SINGLE_SIDES = [
  { id: "pravoe", label: "Правое" },
  { id: "levoe", label: "Левое" },
];

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
      ...SINGLE_SIDES.map((side) => withoutEmpty({ ...side, ...sideFields(base, 1) } as OptionValue)),
      withoutEmpty({ id: PAIR_ID, label: "Пара", ...sideFields(base, 2) } as OptionValue),
    ],
  };
}

export function isSidesGroup(group: OptionGroup): boolean {
  return group.id === SIDES_GROUP_ID || /^сторона$/i.test(group.name.trim());
}

export function refreshSides(group: OptionGroup, base: SideBase): OptionGroup {
  return {
    ...group,
    values: group.values.map((value) => {
      const pair = value.id === PAIR_ID || /пара|комплект/i.test(value.label);
      return withoutEmpty({ ...value, ...sideFields(base, pair ? 2 : 1) });
    }),
  };
}
