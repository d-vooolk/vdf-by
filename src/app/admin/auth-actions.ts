"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { login, logout } from "@/lib/auth";
import { clientIp } from "@/lib/client-ip";
import { fail, type FormState } from "./form-state";

/* ------------------------------------------------------------------ */
/* Вход и выход                                                        */
/* ------------------------------------------------------------------ */

export async function loginAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const name = String(formData.get("login") ?? "");
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "");

  if (!name || !password) return fail(["Заполните логин и пароль"]);

  const requestHeaders = await headers();
  const userAgent = requestHeaders.get("user-agent") ?? "";
  const result = await login(name, password, userAgent, clientIp(requestHeaders));

  if (!result.ok) return fail([result.error]);

  // Возвращаем туда, откуда человека развернули на форму входа. Чужие адреса
  // сюда подставить нельзя: берём только путь внутри админки.
  redirect(next.startsWith("/admin") ? next : "/admin/");
}

export async function logoutAction(): Promise<void> {
  await logout();
  redirect("/admin/login/");
}
