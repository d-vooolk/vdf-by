import { crmPullState } from "@/lib/accounting";

function formatMoment(timestamp: number): string {
  return new Date(timestamp).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function CrmPullNote() {
  const pull = crmPullState();

  if (pull?.error) {
    return (
      <p className="rounded-card border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
        Последняя сверка с CRM ({formatMoment(pull.at)}) не удалась: {pull.error}.
        {pull.okAt ? ` Данные на ${formatMoment(pull.okAt)}.` : ""} Повтор каждые 5 минут.
      </p>
    );
  }
  if (pull?.okAt) {
    return <p className="text-xs text-brand-400">Сверено с CRM {formatMoment(pull.okAt)}</p>;
  }
  return <p className="text-xs text-brand-400">С CRM ещё не сверялись — нажмите «Обновить из CRM».</p>;
}
