export const DEBT_CURRENCIES = ["BYN", "USD", "EUR"] as const;

export type DebtCurrency = (typeof DEBT_CURRENCIES)[number];
export type ForeignCurrency = Exclude<DebtCurrency, "BYN">;
export type DebtDirection = "we_owe" | "owed_to_us";
export type DebtStatus = "active" | "settled";

export interface DebtPayment {
  id: number;
  amount: number;
  paidCurrency: DebtCurrency;
  paidAmount: number;
  rate: number | null;
  paidAt: number;
}

export interface Debt {
  id: number;
  description: string;
  currency: DebtCurrency;
  initialAmount: number;
  remainingAmount: number;
  direction: DebtDirection;
  status: DebtStatus;
  category: string;
  createdAt: number;
  settledAt: number | null;
  payments: DebtPayment[];
}

export interface DebtInput {
  description: string;
  amount: number;
  currency: DebtCurrency;
  direction: DebtDirection;
  category: string;
}

export interface DebtUpdate {
  description: string;
  amount: number;
  category: string;
}

export interface DebtPaymentInput {
  amount: number;
  currency: DebtCurrency;
  rate: number | null;
}

export function isDebtCurrency(value: string): value is DebtCurrency {
  return (DEBT_CURRENCIES as readonly string[]).includes(value);
}

export function debtPaymentNeedsRate(debtCurrency: DebtCurrency, paidCurrency: DebtCurrency): boolean {
  return debtCurrency !== "BYN" || paidCurrency !== "BYN";
}

export function debtPaymentOptions(debtCurrency: DebtCurrency): DebtCurrency[] {
  return debtCurrency === "BYN" ? ["BYN", "USD", "EUR"] : [debtCurrency, "BYN"];
}

const roundMoney = (value: number) => Math.round(value * 100) / 100;

export function debtReduction(
  debtCurrency: DebtCurrency,
  paidCurrency: DebtCurrency,
  paid: number,
  rate: number | null,
): number {
  if (paidCurrency === debtCurrency) return roundMoney(paid);
  if (!rate) return 0;
  return paidCurrency === "BYN" ? roundMoney(paid / rate) : roundMoney(paid * rate);
}

export function cashAmountInByn(paidCurrency: DebtCurrency, paid: number, rate: number | null): number {
  if (paidCurrency === "BYN") return roundMoney(paid);
  return rate ? roundMoney(paid * rate) : 0;
}

export function formatMoney(value: number, currency: DebtCurrency): string {
  const amount = value.toLocaleString("ru-RU", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  return currency === "BYN" ? `${amount} р.` : `${amount} ${currency}`;
}

export function debtPaidTotal(debt: Debt): number {
  return roundMoney(debt.payments.reduce((sum, payment) => sum + payment.amount, 0));
}
