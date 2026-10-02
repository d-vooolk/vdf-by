import { redirect } from "next/navigation";

import { AccountNav } from "@/components/AccountNav";
import { getCustomer } from "@/lib/customer-auth";
import { customerOrders } from "@/lib/customers";
import { formatPhone } from "@/lib/phone";

export default async function CabinetLayout({ children }: { children: React.ReactNode }) {
  const customer = await getCustomer();
  if (!customer) redirect("/account/login/");

  return (
    <div className="container-page max-w-[1100px] py-8 sm:py-12">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-brand-900 sm:text-3xl">Личный кабинет</h1>
        <p className="mt-1 text-sm text-brand-500">
          {customer.name} · <span className="tnum">{formatPhone(customer.phone)}</span>
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)] lg:items-start">
        <aside className="lg:sticky lg:top-28">
          <AccountNav orderCount={customerOrders(customer.phone).length} />
        </aside>
        <div className="min-w-0 space-y-6">{children}</div>
      </div>
    </div>
  );
}
