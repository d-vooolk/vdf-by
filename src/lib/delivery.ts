import type { DeliveryMethod } from "./schema";

export type DeliveryArea = "city" | "country";

export function deliveryArea(method: DeliveryMethod): DeliveryArea {
  if (method.area) return method.area;
  return method.id === "minsk" || /минск/i.test(method.name) ? "city" : "country";
}
