import { MONEY_STATUSES, type MoneyStatus } from "@/lib/accounting";

const TONES: Record<MoneyStatus, string> = {
  awaiting: "order-status order-status-new",
  partial: "order-status order-status-called",
  paid: "order-status order-status-done",
  cancelled: "order-status order-status-cancelled",
};

export function MoneyStatusBadge({ status }: { status: MoneyStatus }) {
  const meta = MONEY_STATUSES.find((entry) => entry.id === status);
  return <span className={`badge shrink-0 ${TONES[status]}`}>{meta?.name ?? status}</span>;
}
