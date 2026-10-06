import { MONEY_STATUSES, type MoneyStatus } from "@/lib/accounting";

const TONES: Record<MoneyStatus, string> = {
  awaiting: "bg-amber-100 text-amber-900",
  paid: "bg-green-100 text-green-900",
  cancelled: "bg-red-100 text-red-800",
};

export function MoneyStatusBadge({ status }: { status: MoneyStatus }) {
  const meta = MONEY_STATUSES.find((entry) => entry.id === status);
  return <span className={`badge shrink-0 ${TONES[status]}`}>{meta?.name ?? status}</span>;
}
