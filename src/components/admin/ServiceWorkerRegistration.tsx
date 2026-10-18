"use client";

import { useEffect, useRef, useState } from "react";

const UPDATE_CHECK_MS = 60 * 60 * 1000;

export function ServiceWorkerRegistration() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const [applying, setApplying] = useState(false);
  const registration = useRef<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
    if (!("serviceWorker" in navigator) || process.env.NODE_ENV !== "production") return;
    const container = navigator.serviceWorker;

    const markWaiting = (worker: ServiceWorker | null) => {
      if (worker && container.controller) setWaiting(worker);
    };

    let reloading = false;
    const onControllerChange = () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    };
    container.addEventListener("controllerchange", onControllerChange);

    const checkForUpdate = () => {
      if (document.visibilityState === "visible") registration.current?.update().catch(() => undefined);
    };
    document.addEventListener("visibilitychange", checkForUpdate);
    const timer = setInterval(checkForUpdate, UPDATE_CHECK_MS);

    container
      .register("/admin/sw.js", { scope: "/admin/" })
      .then((registered) => {
        registration.current = registered;
        markWaiting(registered.waiting);
        registered.addEventListener("updatefound", () => {
          const installing = registered.installing;
          installing?.addEventListener("statechange", () => {
            if (installing.state === "installed") markWaiting(installing);
          });
        });
      })
      .catch(() => undefined);

    return () => {
      container.removeEventListener("controllerchange", onControllerChange);
      document.removeEventListener("visibilitychange", checkForUpdate);
      clearInterval(timer);
    };
  }, []);

  if (!waiting) return null;

  return (
    <div role="status" aria-live="polite" className="admin-update-toast">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">Доступна новая версия</p>
        <p className="mt-0.5 text-xs opacity-80">Сохраните открытые формы и обновите приложение.</p>
      </div>
      <button
        type="button"
        disabled={applying}
        onClick={() => {
          setApplying(true);
          waiting.postMessage({ type: "SKIP_WAITING" });
        }}
        className="admin-update-button"
      >
        {applying ? "Обновляем…" : "Обновить"}
      </button>
      <button type="button" onClick={() => setWaiting(null)} aria-label="Позже" className="admin-update-later">
        ×
      </button>
    </div>
  );
}
