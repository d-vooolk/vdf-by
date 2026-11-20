"use client";

import { useEffect, useState } from "react";

export type DisclaimerVariant = "short" | "full";

type DisclaimerTexts = Record<DisclaimerVariant, string>;

let pending: Promise<DisclaimerTexts | null> | null = null;

function loadDisclaimer() {
  pending ??= fetch("/api/disclaimer/")
    .then((response) => (response.ok ? (response.json() as Promise<DisclaimerTexts>) : null))
    .catch(() => null);
  return pending;
}

export function useDisclaimer(variant: DisclaimerVariant) {
  const [text, setText] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    loadDisclaimer().then((texts) => {
      if (active && texts) setText(texts[variant]);
    });
    return () => {
      active = false;
    };
  }, [variant]);

  return text;
}

export function DisclaimerText({ variant = "full", className }: { variant?: DisclaimerVariant; className?: string }) {
  const text = useDisclaimer(variant);
  if (!text) return null;
  return (
    <p className={className} data-nosnippet="">
      {text}
    </p>
  );
}
