import { joinSku } from "./sku";

export const FRAME_TYPE_PATTERN = /^\d[0-9A-Z]{0,9}$/;

export interface FrameSkuParts {
  number: string;
  storage: string;
  type: string;
}

export function normalizeFrameType(value: string): string {
  return value.trim().toUpperCase();
}

export function isFrameType(value: string): boolean {
  return FRAME_TYPE_PATTERN.test(value);
}

export function splitFrameSku(sku: string | undefined | null): FrameSkuParts {
  const value = (sku ?? "").trim().toUpperCase();
  if (value.includes("-")) {
    const parts = value.split("-").filter(Boolean);
    const type = parts.length > 1 ? parts[parts.length - 1] : "";
    if (isFrameType(type)) {
      return { number: parts[0], storage: parts.slice(1, -1).join("-"), type };
    }
    return { number: value, storage: "", type: "" };
  }
  return { number: value, storage: "", type: "" };
}

export function buildFrameSku({ number, storage, type }: FrameSkuParts): string {
  return joinSku(number, storage, type);
}
