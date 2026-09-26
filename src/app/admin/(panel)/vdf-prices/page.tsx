import { RatesRefreshButton } from "@/components/admin/RatesRefreshButton";
import { VdfPricesPanel } from "@/components/admin/VdfPricesPanel";
import { convertToByn, describeRate, FOREIGN_CURRENCIES, type ForeignCurrency } from "@/lib/currency";
import { formatPrice } from "@/lib/format";
import { ratesReport } from "@/lib/linked-prices";
import { vdfPriceStatus } from "@/lib/vdf-prices";

export const metadata = { title: "Курсы и цены VDF" };

export const dynamic = "force-dynamic";

function when(at: number): string {
  return new Date(at).toLocaleString("ru-RU", { timeZone: "Europe/Minsk" });
}

function SkuList({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <details className="text-sm">
      <summary className="cursor-pointer text-brand-700">
        {title}: <b className="tnum">{items.length}</b>
      </summary>
      <p className="mt-2 break-words text-xs text-brand-500">{items.join(", ")}</p>
    </details>
  );
}

export default function VdfPricesPage() {
  const status = vdfPriceStatus();
  const report = status.report;
  const rates = ratesReport();

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-semibold text-brand-900">Курсы и цены VDF</h1>

      <div className="card space-y-3 p-5">
        <h2 className="font-semibold text-brand-900">Пересчёт по курсу НБРБ</h2>
        <p className="max-w-3xl text-sm text-brand-500">
          Цена, оптовая цена и себестоимость, введённые в ₽ или $ с галочкой «Привязать к курсу»,
          каждый день в 04:30 по Минску пересчитываются в белорусские рубли. Сумма в валюте не
          меняется. Цена и оптовая цена округляются вверх до рубля, себестоимость — до копеек.
        </p>
        {rates ? (
          <>
            <p className={`text-sm ${rates.ok ? "text-green-700" : "text-red-700"}`}>
              {when(rates.at)} — {rates.ok ? "пересчитано" : rates.error}. Изменились цены у
              товаров: <b className="tnum">{rates.products}</b>, у типов рамок:{" "}
              <b className="tnum">{rates.frameTypes}</b>
            </p>
            <ul className="text-sm text-brand-700">
              {(Object.keys(FOREIGN_CURRENCIES) as ForeignCurrency[]).map((code) => {
                const rate = rates.rates[code];
                return (
                  <li key={code}>
                    {rate ? (
                      <>
                        {describeRate(code, rate)}. Например, 1000 {FOREIGN_CURRENCIES[code]} в
                        цене — {formatPrice(convertToByn(1000, rate.rate, "ruble"), "BYN")}
                      </>
                    ) : (
                      `Курс ${code} не получен`
                    )}
                  </li>
                );
              })}
            </ul>
          </>
        ) : (
          <p className="text-sm text-brand-500">Пересчёт ещё не запускался.</p>
        )}
        <RatesRefreshButton />
      </div>

      <div className="space-y-3">
        <h2 className="font-semibold text-brand-900">Загрузка цен рамок с vdf-light.ru</h2>
        <p className="max-w-3xl text-sm text-brand-500">
          Разовая загрузка из оптового кабинета: розница в ₽ записывается в цену рамки, опт в ₽ — в
          себестоимость, обе с привязкой к курсу. Товары сопоставляются по артикулу. Запускайте,
          только когда vdf-light поменял прайс: загрузка перезапишет цены рамок, вписанные вручную.
        </p>
        <VdfPricesPanel
          email={status.email}
          wholesale={status.wholesale}
          running={status.running}
        />
      </div>

      {report && (
        <div className="card space-y-3 p-5">
          <h2 className="font-semibold text-brand-900">Последняя загрузка с vdf-light.ru</h2>
          <p className={`text-sm ${report.ok ? "text-green-700" : "text-red-700"}`}>
            {when(report.at)} — {report.ok ? "успешно" : `ошибка: ${report.error}`}
          </p>
          {report.ok && (
            <p className="tnum text-sm text-brand-700">
              На vdf-light рамок: {report.listed} · найдено в магазине: {report.matched} · цены
              изменились: {report.updated}
            </p>
          )}
          <SkuList title="Нет оптовой цены на vdf-light" items={report.withoutWholesale} />
          <SkuList
            title="Были импортированы, но пропали с vdf-light (цены не тронуты)"
            items={report.missingOnVdf}
          />
          <SkuList title="Есть на vdf-light, но нет в магазине" items={report.notInShop} />
        </div>
      )}
    </div>
  );
}
