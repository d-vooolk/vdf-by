export const FRAME_TYPE_PATTERN = /^\d[0-9A-Z]{0,9}$/;
export const FRAME_SUFFIX_PATTERN = /^[0-9A-ZА-ЯЁ]+(?:-[0-9A-ZА-ЯЁ]+)*$/;

export interface FrameSkuParts {
  number: string;
  suffix: string;
  type: string;
}

export function normalizeFrameType(value: string): string {
  return value.trim().toUpperCase();
}

export function normalizeFrameSuffix(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "");
}

export function isFrameType(value: string): boolean {
  return FRAME_TYPE_PATTERN.test(value);
}

export function isFrameSuffix(value: string): boolean {
  return value === "" || FRAME_SUFFIX_PATTERN.test(value);
}

export function splitFrameSku(sku: string | undefined | null): FrameSkuParts {
  const value = (sku ?? "").trim().toUpperCase();
  if (value.includes("-")) {
    const parts = value.split("-").filter(Boolean);
    const type = parts.length > 1 ? parts[parts.length - 1] : "";
    if (isFrameType(type)) {
      return { number: parts[0], suffix: parts.slice(1, -1).join("-"), type };
    }
    return { number: value, suffix: "", type: "" };
  }
  return { number: value, suffix: "", type: "" };
}

export function frameTypeOfSku(sku: string | undefined | null): string {
  return splitFrameSku(sku).type;
}

export function buildFrameSku({ number, suffix, type }: FrameSkuParts): string {
  return [number, suffix, type].filter(Boolean).join("-");
}
