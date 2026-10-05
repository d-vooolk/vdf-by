export function storageSkuPart(storageCode: string | undefined | null): string {
  return (storageCode ?? "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "");
}

export function joinSku(base: string, storageCode: string | undefined | null, ...rest: string[]): string {
  return [base.trim(), storageSkuPart(storageCode), ...rest.map((part) => part.trim())]
    .filter(Boolean)
    .join("-");
}

export function buildProductSku(base: string | undefined | null, storageCode: string | undefined | null): string {
  const trimmed = (base ?? "").trim();
  return trimmed ? joinSku(trimmed, storageCode) : "";
}

export function productSkuBase(sku: string | undefined | null, storageCode: string | undefined | null): string {
  const value = (sku ?? "").trim();
  const tail = storageSkuPart(storageCode);
  return tail && value.endsWith(`-${tail}`) ? value.slice(0, -tail.length - 1) : value;
}
