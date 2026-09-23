export interface UsdRate {
  rate: number;
  date: string;
}

const TTL = 60 * 60 * 1000;

let cached: { value: UsdRate; at: number } | null = null;

export async function getUsdRate(): Promise<UsdRate | null> {
  if (cached && Date.now() - cached.at < TTL) return cached.value;

  try {
    const response = await fetch(
      "https://api.nbrb.by/exrates/rates/USD?parammode=2",
      { signal: AbortSignal.timeout(8000), cache: "no-store" },
    );
    if (!response.ok) return cached?.value ?? null;

    const data = (await response.json()) as {
      Cur_OfficialRate?: number;
      Cur_Scale?: number;
      Date?: string;
    };
    const rate = Number(data.Cur_OfficialRate) / (Number(data.Cur_Scale) || 1);
    if (!Number.isFinite(rate) || rate <= 0) return cached?.value ?? null;

    const value = { rate, date: String(data.Date ?? "").slice(0, 10) };
    cached = { value, at: Date.now() };
    return value;
  } catch {
    return cached?.value ?? null;
  }
}
