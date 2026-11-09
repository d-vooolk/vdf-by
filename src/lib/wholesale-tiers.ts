export type WholesaleTier = "base" | "plus20";

export const WHOLESALE_TIERS: Record<WholesaleTier, { label: string; markupPercent: number }> = {
  base: { label: "опт", markupPercent: 0 },
  plus20: { label: "опт +20%", markupPercent: 20 },
};

export function toWholesaleTier(value: unknown): WholesaleTier {
  return value === "plus20" ? "plus20" : "base";
}
