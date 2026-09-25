import { VdfPricesPanel } from "@/components/admin/VdfPricesPanel";
import { formatPrice } from "@/lib/format";
import { costToByn, retailToByn, vdfPriceStatus } from "@/lib/vdf-prices";

export const metadata = { title: "Цены VDF" };

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

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-brand-900">Цены VDF</h1>
        <p className="mt-1 max-w-3xl text-sm text-brand-500">
          Раз в сутки, в 04:30 по Минску, магазин берёт цены переходных рамок из оптового кабинета
          vdf-light.ru и пересчитывает рубли РФ в белорусские по курсу НБРБ. Цена на сайте —
          розничная, округлённая вверх до целого рубля. Себестоимость — оптовая, до копеек. Товары
          сопоставляются по артикулу. Цены, вписанные вручную, при обновлении перезаписываются.
        </p>
      </div>

      <VdfPricesPanel email={status.email} wholesale={status.wholesale} running={status.running} />

      {report && (
        <div className="card space-y-3 p-5">
          <h2 className="font-semibold text-brand-900">Последнее обновление</h2>
          <p className={`text-sm ${report.ok ? "text-green-700" : "text-red-700"}`}>
            {when(report.at)} — {report.ok ? "успешно" : `ошибка: ${report.error}`}
          </p>
          {report.rate > 0 && (
            <p className="text-sm text-brand-700">
              Курс НБРБ на {report.rateDate}:{" "}
              <b className="tnum">{(report.rate * 100).toFixed(4)}</b> BYN за 100 ₽. Например,
              1000 ₽ в рознице — {formatPrice(retailToByn(1000, report.rate), "BYN")}, 1000 ₽ опта
              — {formatPrice(costToByn(1000, report.rate), "BYN")}.
            </p>
          )}
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
