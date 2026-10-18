"use client";

import { useActionState } from "react";

import { loginAction } from "@/app/admin/auth-actions";
import { type FormState } from "@/app/admin/form-state";
import { AlertIcon, SpinnerIcon } from "@/components/icons";

const EMPTY: FormState = { ok: false, problems: [], at: 0 };

/**
 * Форма входа.
 *
 * Обычная HTML-форма с action: работает и до того, как загрузится JavaScript.
 * Для страницы входа это не педантизм — если бандл не доехал, войти в админку
 * всё равно можно.
 */
export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(loginAction, EMPTY);

  return (
    <form action={action} className="card space-y-4 p-5">
      <input type="hidden" name="next" value={next} />

      <div>
        <label htmlFor="login" className="label">
          Логин
        </label>
        <input
          id="login"
          name="login"
          autoComplete="username"
          autoFocus
          required
          className="field"
        />
      </div>

      <div>
        <label htmlFor="password" className="label">
          Пароль
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="field"
        />
      </div>

      {state.problems.length > 0 && (
        <p
          className="flex items-start gap-2 rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-800"
          role="alert"
        >
          <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
          {state.problems.join(" ")}
        </p>
      )}

      <button type="submit" disabled={pending} className="btn-primary w-full">
        {pending ? (
          <>
            <SpinnerIcon className="h-5 w-5 animate-spin" />
            Проверяем…
          </>
        ) : (
          "Войти"
        )}
      </button>
    </form>
  );
}
