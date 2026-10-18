type HeaderSource = Pick<Headers, "get">;

export function clientIp(source: Request | HeaderSource): string {
  const headers = source instanceof Request ? source.headers : source;
  const real = headers.get("x-real-ip")?.trim();
  if (real) return real;
  const forwarded = headers.get("x-forwarded-for");
  const last = forwarded?.split(",").map((part) => part.trim()).filter(Boolean).at(-1);
  return last ?? "unknown";
}
