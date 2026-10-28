export const METRIKA_ID = 112885899;
export const GA_MEASUREMENT_ID = "G-G25SPSVNRC";
export const NO_ANALYTICS_COOKIE = "vdf_noanalytics";
export const NO_ANALYTICS_MAX_AGE = 60 * 60 * 24 * 365;

declare global {
  interface Window {
    ym?: (id: number, action: string, ...rest: unknown[]) => void;
    gtag?: (command: string, event: string, params?: unknown) => void;
    dataLayer?: unknown[];
  }
}

export interface OrderEvent {
  id: number;
  total: number;
  currency: string;
  source: "cart" | "quick";
  items: Array<{
    id: string;
    name: string;
    price: number;
    qty: number;
  }>;
}

export function trackOrder(order: OrderEvent): void {
  if (typeof window === "undefined") return;

  window.dataLayer?.push({
    ecommerce: {
      currencyCode: order.currency,
      purchase: {
        actionField: { id: String(order.id), revenue: order.total },
        products: order.items.map((item) => ({
          id: item.id,
          name: item.name,
          price: item.price,
          quantity: item.qty,
        })),
      },
    },
  });

  window.ym?.(METRIKA_ID, "reachGoal", "order", {
    order_price: order.total,
    currency: order.currency,
    source: order.source,
  });

  window.gtag?.("event", "generate_lead", {
    value: order.total,
    currency: order.currency,
    transaction_id: String(order.id),
    source: order.source,
  });
}

export function trackGoal(name: string, params: Record<string, string> = {}): void {
  if (typeof window === "undefined") return;
  window.ym?.(METRIKA_ID, "reachGoal", name, params);
  window.gtag?.("event", name, params);
}
