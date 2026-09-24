import type { Metadata } from "next";

import { AiConnectionCheck } from "@/components/admin/AiConnectionCheck";
import { AlertIcon } from "@/components/icons";
import { aiConfig } from "@/lib/ai";
import { aiUsage, fetchOpenRouterAccount, type ModelInfo } from "@/lib/ai-status";
import { formatAmount } from "@/lib/format";

export const metadata: Metadata = { title: "Нейросеть" };

const TYPICAL_TOKENS_IN = 1500;
const TYPICAL_TOKENS_OUT = 450;

const TASK_LABEL: Record<string, string> = {
  rewrite: "Рерайт",
  faq: "Вопросы",
  check: "Проверка",
};

function usd(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  if (value === 0) return "$0";
  if (Math.abs(value) >= 1) return `$${value.toFixed(2)}`;
  if (Math.abs(value) >= 0.01) return `$${value.toFixed(3)}`;
  return `$${value.toFixed(5)}`;
}

function seconds(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return "—";
  return `${(ms / 1000).toFixed(1)} с`;
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString("ru-RU", {
    timeZone: "Europe/Minsk",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function rewriteCost(model: ModelInfo): number {
  return (
    (model.promptPerMillion * TYPICAL_TOKENS_IN + model.completionPerMillion * TYPICAL_TOKENS_OUT) /
    1e6
  );
}

export default async function AiPage() {
  const config = aiConfig();
  const [account, usage] = await Promise.all([fetchOpenRouterAccount(), Promise.resolve(aiUsage())]);

  const balance = account.credits ? account.credits.total - account.credits.used : null;
  const rewritesLeft =
    balance !== null && usage.averageRewriteCost > 0
      ? Math.floor(balance / usage.averageRewriteCost)
      : null;
  const month = usage.periods[2];
  const day = usage.periods[0];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-brand-900">Нейросеть</h1>
        <p className="mt-1 text-sm text-brand-400">
          Рерайт описаний и вопросы-ответы в карточке товара. Данные о балансе
          берутся из OpenRouter при каждом открытии страницы.
        </p>
      </div>

      {!config.keyConfigured && (
        <p className="card flex items-start gap-2 p-4 text-sm text-amber-800">
          <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
          В .env на сервере не задан AI_API_KEY — нейросеть выключена.
        </p>
      )}

      {account.errors.length > 0 && (
        <div className="card space-y-1 p-4 text-sm text-red-700" role="alert">
          <p className="font-semibold">OpenRouter ответил не на всё:</p>
          {account.errors.map((error) => (
            <p key={error} className="flex items-start gap-1.5">
              <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
              {error}
            </p>
          ))}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Остаток на счёте"
          value={usd(balance)}
          hint={
            account.credits
              ? `пополнено ${usd(account.credits.total)}, потрачено ${usd(account.credits.used)}`
              : undefined
          }
          accent={balance !== null && balance < 1}
        />
        <Stat
          label="Хватит примерно на"
          value={rewritesLeft === null ? "—" : `${formatAmount(rewritesLeft)} рерайтов`}
          hint={`по ${usd(usage.averageRewriteCost)} за рерайт`}
        />
        <Stat
          label="Потрачено за 30 дней"
          value={usd(month.cost)}
          hint={`${month.total} запрос(ов), за сутки ${usd(day.cost)}`}
        />
        <Stat
          label="Среднее время ответа"
          value={seconds(month.avgDurationMs)}
          hint={
            month.avgFirstTokenMs === null
              ? "запросов ещё не было"
              : `первые слова через ${seconds(month.avgFirstTokenMs)}`
          }
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card overflow-hidden">
          <Header title="Подключение" />
          <dl className="divide-y divide-brand-100 text-sm">
            <Row label="Ключ" value={config.keyConfigured ? "задан" : "не задан"} />
            {account.key && (
              <>
                <Row label="Название ключа" value={account.key.label || "—"} />
                <Row
                  label="Лимит ключа"
                  value={
                    account.key.limit === null
                      ? "без лимита"
                      : `${usd(account.key.limit)}, осталось ${usd(account.key.limitRemaining)}`
                  }
                />
              </>
            )}
            <Row label="Адрес API" value={config.baseUrl} mono />
            <Row
              label="Прокси"
              value={config.proxy ? `${config.proxy} (VPN)` : "напрямую, без прокси"}
              mono={Boolean(config.proxy)}
            />
            <Row label="Ответ OpenRouter" value={seconds(account.latencyMs)} />
            <Row label="Таймаут запроса" value={seconds(config.timeout)} />
          </dl>
          <div className="border-t border-brand-100 px-4 py-3">
            <AiConnectionCheck disabled={!config.keyConfigured} />
            <p className="mt-2 text-xs text-brand-400">
              Короткий запрос к первой модели из списка. Стоит меньше сотой цента.
            </p>
          </div>
        </section>

        <section className="card overflow-hidden">
          <Header title="Модели по порядку" />
          <ol className="divide-y divide-brand-100">
            {account.models.map((model, index) => {
              const free = model.promptPerMillion === 0 && model.completionPerMillion === 0;
              return (
                <li key={model.id} className="px-4 py-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 text-sm font-medium text-brand-900">
                      <span className="tnum mr-1.5 text-brand-300">{index + 1}.</span>
                      {model.name}
                    </span>
                    <span className="tnum shrink-0 text-sm text-brand-600">
                      {!model.found ? "—" : free ? "бесплатно" : `≈ ${usd(rewriteCost(model))} за рерайт`}
                    </span>
                  </div>
                  <p className="mt-0.5 font-mono text-xs text-brand-400">{model.id}</p>
                  {model.found ? (
                    !free && (
                      <p className="tnum mt-0.5 text-xs text-brand-400">
                        {usd(model.promptPerMillion)} за млн токенов запроса,{" "}
                        {usd(model.completionPerMillion)} за млн токенов ответа
                      </p>
                    )
                  ) : (
                    <p className="mt-0.5 text-xs text-amber-700">
                      Нет в каталоге OpenRouter — проверьте название в AI_MODEL
                    </p>
                  )}
                </li>
              );
            })}
          </ol>
          <p className="border-t border-brand-100 px-4 py-3 text-xs text-brand-400">
            Если первая модель занята, запрос сам уходит к следующей. Порядок
            задаётся в AI_MODEL в .env на сервере.
          </p>
        </section>
      </div>

      <section className="card overflow-hidden">
        <Header title="Статистика запросов" />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-brand-400">
              <tr className="border-b border-brand-100">
                <th className="px-4 py-2 font-medium">Период</th>
                <th className="px-4 py-2 font-medium">Запросов</th>
                <th className="px-4 py-2 font-medium">С ошибкой</th>
                <th className="px-4 py-2 font-medium">Первые слова</th>
                <th className="px-4 py-2 font-medium">Весь ответ</th>
                <th className="px-4 py-2 font-medium">Расходы</th>
              </tr>
            </thead>
            <tbody className="tnum divide-y divide-brand-100">
              {usage.periods.map((period) => (
                <tr key={period.label}>
                  <td className="px-4 py-2 text-brand-900">{period.label}</td>
                  <td className="px-4 py-2">{period.total}</td>
                  <td className={`px-4 py-2 ${period.failed > 0 ? "text-red-700" : ""}`}>
                    {period.failed}
                  </td>
                  <td className="px-4 py-2">{seconds(period.avgFirstTokenMs)}</td>
                  <td className="px-4 py-2">{seconds(period.avgDurationMs)}</td>
                  <td className="px-4 py-2">{usd(period.cost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {account.key && account.key.usageDaily !== null && (
          <p className="tnum border-t border-brand-100 px-4 py-3 text-xs text-brand-400">
            По данным OpenRouter с этого ключа потрачено: сегодня {usd(account.key.usageDaily)},
            за неделю {usd(account.key.usageWeekly)}, за месяц {usd(account.key.usageMonthly)},
            всего {usd(account.key.usage)}.
          </p>
        )}
      </section>

      {usage.byModel.length > 0 && (
        <section className="card overflow-hidden">
          <Header title="Кто отвечал за 30 дней" />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-brand-400">
                <tr className="border-b border-brand-100">
                  <th className="px-4 py-2 font-medium">Модель</th>
                  <th className="px-4 py-2 font-medium">Площадка</th>
                  <th className="px-4 py-2 font-medium">Запросов</th>
                  <th className="px-4 py-2 font-medium">С ошибкой</th>
                  <th className="px-4 py-2 font-medium">В среднем</th>
                  <th className="px-4 py-2 font-medium">Расходы</th>
                </tr>
              </thead>
              <tbody className="tnum divide-y divide-brand-100">
                {usage.byModel.map((row) => (
                  <tr key={`${row.model}|${row.provider}`}>
                    <td className="px-4 py-2 font-mono text-xs text-brand-900">
                      {row.model || "не дошло до модели"}
                    </td>
                    <td className="px-4 py-2">{row.provider || "—"}</td>
                    <td className="px-4 py-2">{row.total}</td>
                    <td className={`px-4 py-2 ${row.failed > 0 ? "text-red-700" : ""}`}>
                      {row.failed}
                    </td>
                    <td className="px-4 py-2">{seconds(row.avgDurationMs)}</td>
                    <td className="px-4 py-2">{usd(row.cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="card overflow-hidden">
        <Header title="Последние запросы" />
        {usage.recent.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-brand-400">
            Запросов пока не было. Они появятся после первого рерайта или
            генерации вопросов.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-brand-400">
                <tr className="border-b border-brand-100">
                  <th className="px-4 py-2 font-medium">Когда</th>
                  <th className="px-4 py-2 font-medium">Что</th>
                  <th className="px-4 py-2 font-medium">Модель</th>
                  <th className="px-4 py-2 font-medium">Время</th>
                  <th className="px-4 py-2 font-medium">Токены</th>
                  <th className="px-4 py-2 font-medium">Цена</th>
                  <th className="px-4 py-2 font-medium">Итог</th>
                </tr>
              </thead>
              <tbody className="tnum divide-y divide-brand-100 align-top">
                {usage.recent.map((row) => (
                  <tr key={row.id}>
                    <td className="px-4 py-2 whitespace-nowrap text-brand-500">
                      {formatTime(row.createdAt)}
                    </td>
                    <td className="px-4 py-2 text-brand-900">{TASK_LABEL[row.task] ?? row.task}</td>
                    <td className="px-4 py-2">
                      <span className="block font-mono text-xs text-brand-900">
                        {row.model || "—"}
                      </span>
                      {row.provider && (
                        <span className="block text-xs text-brand-400">{row.provider}</span>
                      )}
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap">
                      {seconds(row.durationMs)}
                      {row.firstTokenMs !== null && row.task === "rewrite" && (
                        <span className="block text-xs text-brand-400">
                          первые слова {seconds(row.firstTokenMs)}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap text-brand-500">
                      {row.tokensIn === null ? "—" : `${row.tokensIn} → ${row.tokensOut ?? 0}`}
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap">{usd(row.cost)}</td>
                    <td className="px-4 py-2">
                      {row.ok ? (
                        <span className="text-green-700">готово</span>
                      ) : (
                        <span className="block max-w-xs text-xs text-red-700">{row.error}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card p-4 text-sm">
        <h2 className="mb-2 text-sm font-bold text-brand-900">Ссылки OpenRouter</h2>
        <ul className="flex flex-wrap gap-x-5 gap-y-1.5">
          <li>
            <a href="https://openrouter.ai/settings/credits" target="_blank" rel="noreferrer" className="text-brand-700 hover:underline">
              Пополнить баланс
            </a>
          </li>
          <li>
            <a href="https://openrouter.ai/activity" target="_blank" rel="noreferrer" className="text-brand-700 hover:underline">
              История запросов
            </a>
          </li>
          <li>
            <a href="https://openrouter.ai/settings/keys" target="_blank" rel="noreferrer" className="text-brand-700 hover:underline">
              Ключи
            </a>
          </li>
          <li>
            <a href="https://openrouter.ai/models?max_price=0" target="_blank" rel="noreferrer" className="text-brand-700 hover:underline">
              Бесплатные модели
            </a>
          </li>
        </ul>
      </section>
    </div>
  );
}

function Header({ title }: { title: string }) {
  return (
    <div className="border-b border-brand-100 px-4 py-3">
      <h2 className="text-sm font-bold text-brand-900">{title}</h2>
    </div>
  );
}

function Row({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 px-4 py-2.5">
      <dt className="shrink-0 text-brand-400">{label}</dt>
      <dd className={`min-w-0 truncate text-right text-brand-900 ${mono ? "font-mono text-xs" : ""}`}>
        {value}
      </dd>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  accent = false,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <div className="card p-4">
      <p className="text-xs font-medium text-brand-400">{label}</p>
      <p className={`tnum mt-1 text-2xl font-semibold ${accent ? "text-amber-600" : "text-brand-900"}`}>
        {value}
      </p>
      {hint && <p className="mt-0.5 text-xs text-brand-400">{hint}</p>}
    </div>
  );
}
