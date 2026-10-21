import { ORDER_STATUSES, type OrderStatus } from "@/lib/order-types";

/**
 * Цветная метка статуса заказа.
 *
 * Классы перечислены полными строками, а не собраны из кусков: Tailwind ищет
 * имена классов по исходнику текстом, и `bg-${tone}-100` он бы не нашёл — в
 * сборке таких стилей просто не оказалось бы.
 */
const TONES: Record<OrderStatus, string> = {
  new: "order-status order-status-new",
  called: "order-status order-status-called",
  ready: "order-status order-status-ready",
  shipped: "order-status order-status-shipped",
  done: "order-status order-status-done",
  cancelled: "order-status order-status-cancelled",
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const meta = ORDER_STATUSES.find((entry) => entry.id === status);
  return (
    <span className={`badge shrink-0 ${TONES[status]}`}>
      {meta?.name ?? status}
    </span>
  );
}
