import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AuthForm } from "@/components/AuthForm";
import { getCustomer } from "@/lib/customer-auth";
import { buildMetadata } from "@/lib/seo";

export function generateMetadata(): Metadata {
  return buildMetadata({
    title: "Вход в личный кабинет",
    description: "Вход и регистрация по номеру телефона. Оптовым покупателям — оптовые цены.",
    path: "/account/login/",
    noIndex: true,
  });
}

interface PageProps {
  searchParams: Promise<{ mode?: string }>;
}

export default async function AccountLoginPage({ searchParams }: PageProps) {
  if (await getCustomer()) redirect("/account/");
  const { mode } = await searchParams;

  return (
    <div className="container-page py-10 sm:py-16">
      <h1 className="mb-6 text-center text-2xl font-semibold text-brand-900 sm:text-3xl">
        Личный кабинет
      </h1>
      <AuthForm initialMode={mode === "register" ? "register" : "login"} />
    </div>
  );
}
