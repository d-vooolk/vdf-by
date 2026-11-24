import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { AccountWiki } from "@/components/wiki/AccountWiki";
import { getCustomer } from "@/lib/customer-auth";
import { isWholesale } from "@/lib/customers";
import { buildMetadata } from "@/lib/seo";

export function generateMetadata(): Metadata {
  return buildMetadata({
    title: "Wiki",
    description: "База знаний по автомобилям для оптовых покупателей.",
    path: "/account/wiki/",
    noIndex: true,
  });
}

export default async function AccountWikiPage() {
  const customer = await getCustomer();
  if (!customer) redirect("/account/login/");
  if (!isWholesale(customer)) {
    return (
      <p className="card p-8 text-center text-sm text-brand-500">
        Wiki по автомобилям доступна оптовым покупателям. Оставьте заявку на опт в разделе «Данные».
      </p>
    );
  }
  return (
    <Suspense>
      <AccountWiki />
    </Suspense>
  );
}
