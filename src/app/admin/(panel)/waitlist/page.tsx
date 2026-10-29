import type { Metadata } from "next";
import Link from "next/link";

import { WaitlistControls } from "@/components/admin/WaitlistControls";
import { WaitlistForm } from "@/components/admin/WaitlistForm";
import { listWholesaleCompanies } from "@/lib/customers";
import { formatPhone } from "@/lib/phone";
import {
  isWaitlistStatus,
  listWaitlist,
  productBackInStock,
  WAITLIST_STATUSES,
  waitlistCounts,
  type WaitlistStatus,
} from "@/lib/waitlist";

export const metadata: Metadata = { title: "Лист ожидания" };

function date(timestamp: number): string {
  return new Date(timestamp).toLocaleString("ru-RU", {
    timeZone: "Europe/Minsk",
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function WaitlistPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab: raw } = await searchParams;
  const tab: WaitlistStatus = raw && isWaitlistStatus(raw) ? raw : "waiting";
  const entries = listWaitlist(tab).map((entry) => ({ ...entry, ready: productBackInStock(entry.productId) }));
  if (tab === "waiting") entries.sort((a, b) => Number(b.ready) - Number(a.ready));
  const counts = waitlistCounts();
  const companies = listWholesaleCompanies().map(({ id, name, phone }) => ({ id, name, phone: formatPhone(phone) }));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-brand-900">Лист ожидания</h1>
        <p className="mt-1 text-sm text-brand-500">
          Кто ждёт товар, которого нет в наличии: компания-оптовик или человек с именем и телефоном. Когда товар из
          каталога снова появляется, запись поднимается наверх с зелёной меткой, а в меню горит счётчик — позвоните
          и нажмите «Сообщили».
        </p>
      </div>

      <WaitlistForm companies={companies} />

      <nav className="flex flex-wrap gap-2">
        {WAITLIST_STATUSES.map((entry) => (
          <Link
            key={entry.id}
            href={`/admin/waitlist/?tab=${entry.id}`}
            className={`rounded-xl px-3 py-1.5 text-sm font-medium ${
              tab === entry.id ? "bg-brand-700 text-white" : "bg-brand-100 text-brand-700"
            }`}
          >
            {entry.label} <span className="tnum">{counts[entry.id]}</span>
          </Link>
        ))}
      </nav>

      {entries.length === 0 ? (
        <p className="card p-10 text-center text-sm text-brand-400">Здесь пока никого нет.</p>
      ) : (
        <ul className="card divide-y divide-brand-100">
          {entries.map((entry) => (
            <li key={entry.id} className="flex flex-wrap items-start gap-3 px-4 py-3">
              <div className="min-w-0 flex-1 space-y-0.5 text-sm">
                <p className="font-medium text-brand-900">
                  {entry.companyName ?? entry.name}
                  {entry.customerId && <span className="badge ml-2 bg-sky-100 text-sky-800">оптовик</span>}{" "}
                  {entry.phone && (
                    <a href={`tel:+${entry.phone}`} className="tnum font-normal text-brand-600 underline">
                      {formatPhone(entry.phone)}
                    </a>
                  )}
                </p>
                <p className="text-brand-700">
                  {entry.productId ? (
                    <Link href={`/admin/products/${entry.productId}/`} className="underline">
                      {entry.productTitle}
                    </Link>
                  ) : (
                    entry.productTitle
                  )}
                  <span className="tnum text-brand-500"> × {entry.qty}</span>
                  {entry.productId &&
                    (entry.ready ? (
                      <span className="badge ml-2 bg-green-100 text-green-800">появился в наличии</span>
                    ) : (
                      <span className="badge ml-2 bg-brand-100 text-brand-500">нет в наличии</span>
                    ))}
                </p>
                <p className="text-xs text-brand-400">
                  Добавлен {date(entry.createdAt)}
                  {entry.closedAt ? ` · ${tab === "notified" ? "сообщили" : "закрыт"} ${date(entry.closedAt)}` : ""}
                </p>
              </div>
              <WaitlistControls id={entry.id} status={entry.status} note={entry.note} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
