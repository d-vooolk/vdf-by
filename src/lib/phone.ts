export function normalizePhone(raw: string): string | null {
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("80") && digits.length === 11) digits = `375${digits.slice(2)}`;
  if (digits.length === 9) digits = `375${digits}`;
  return /^375\d{9}$/.test(digits) ? digits : null;
}

export function formatPhone(digits: string): string {
  const match = digits.match(/^375(\d{2})(\d{3})(\d{2})(\d{2})$/);
  return match ? `+375 ${match[1]} ${match[2]}-${match[3]}-${match[4]}` : `+${digits}`;
}

export function localPart(digits: string): string {
  return digits.replace(/\D/g, "").slice(-9);
}
