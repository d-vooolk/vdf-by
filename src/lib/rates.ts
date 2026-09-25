export interface UsdRate {
  rate: number;
  date: string;
}

export type CurrencyRate = UsdRate;

const TTL = 60 * 60 * 1000;

const cached = new Map<string, { value: CurrencyRate; at: number }>();

async function getNbrbRate(code: string): Promise<CurrencyRate | null> {
  const hit = cached.get(code);
  if (hit && Date.now() - hit.at < TTL) return hit.value;

  try {
    const response = await fetch(
      `https://api.nbrb.by/exrates/rates/${code}?parammode=2`,
      { signal: AbortSignal.timeout(8000), cache: "no-store" },
    );
    if (!response.ok) return hit?.value ?? null;

    const data = (await response.json()) as {
      Cur_OfficialRate?: number;
      Cur_Scale?: number;
      Date?: string;
    };
    const rate = Number(data.Cur_OfficialRate) / (Number(data.Cur_Scale) || 1);
    if (!Number.isFinite(rate) || rate <= 0) return hit?.value ?? null;

    const value = { rate, date: String(data.Date ?? "").slice(0, 10) };
    cached.set(code, { value, at: Date.now() });
    return value;
  } catch {
    return hit?.value ?? null;
  }
}

export function getUsdRate(): Promise<UsdRate | null> {
  return getNbrbRate("USD");
}

export function getRubRate(): Promise<CurrencyRate | null> {
  return getNbrbRate("RUB");
}
