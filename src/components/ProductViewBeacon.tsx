"use client";

import { useEffect } from "react";

export function ProductViewBeacon({ productId }: { productId: string }) {
  useEffect(() => {
    const key = `viewed:${productId}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {}
    if (!navigator.sendBeacon?.("/api/view/", productId)) {
      fetch("/api/view/", { method: "POST", body: productId, keepalive: true }).catch(() => {});
    }
  }, [productId]);

  return null;
}
