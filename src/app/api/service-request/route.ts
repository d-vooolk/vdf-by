import { getProductRaw } from "@/lib/product-store";
import { clientIp } from "@/lib/client-ip";
import { isLimited, recordHit } from "@/lib/rate-limit";
import { formatPhone, normalizePhone } from "@/lib/phone";
import { createServiceRequest, markServiceRequestSent } from "@/lib/service";
import { escapeTelegram, sendTelegram } from "@/lib/telegram";

export const dynamic = "force-dynamic";

const WINDOW_MS = 10 * 60 * 1000;
const LIMIT = 5;

const text = (value: unknown, limit: number) =>
  typeof value === "string" ? value.trim().slice(0, limit) : "";

export async function POST(request: Request) {
  const ip = clientIp(request);
  if (isLimited(`service:${ip}`, LIMIT, WINDOW_MS)) {
    return Response.json({ error: "Слишком много заявок. Позвоните, пожалуйста" }, { status: 429 });
  }

  const body = ((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  if (body.website) return Response.json({ ok: true });

  const name = text(body.name, 120);
  const phone = text(body.phone, 40);
  const digits = phone.replace(/\D/g, "");
  const car = text(body.car, 200);
  const comment = text(body.comment, 1000);
  if (name.length < 2) return Response.json({ error: "Укажите имя" }, { status: 400 });
  if (digits.length < 9 || digits.length > 13) {
    return Response.json({ error: "Некорректный телефон" }, { status: 400 });
  }
  if (body.consent !== true) {
    return Response.json({ error: "Нет согласия на обработку персональных данных" }, { status: 400 });
  }

  const product = typeof body.productId === "string" ? getProductRaw(body.productId.slice(0, 120)) : null;
  const productUrl = product ? `/product/${product.slug}/` : "";

  recordHit(`service:${ip}`);

  const id = createServiceRequest({
    name,
    phone,
    car,
    comment,
    productId: product?.id ?? null,
    productTitle: product?.title ?? "",
    productUrl,
    ip,
  });

  const normalized = normalizePhone(phone);
  const lines = [
    `<b>🔧 Заявка на расчёт установки №${id}</b>`,
    ...(product ? [`Товар: ${escapeTelegram(product.title)}`] : []),
    ...(car ? [`Авто: ${escapeTelegram(car)}`] : []),
    ...(comment ? [`Комментарий: ${escapeTelegram(comment)}`] : []),
    "",
    `<b>Клиент:</b> ${escapeTelegram(name)}`,
    `<b>Телефон:</b> <a href="tel:+${normalized ?? digits}">${escapeTelegram(normalized ? formatPhone(normalized) : phone)}</a>`,
    ...(productUrl ? ["", `<i>Страница: https://vdf.by${productUrl}</i>`] : []),
  ];

  const sent = await sendTelegram(lines.join("\n"));
  if (sent.ok) markServiceRequestSent(id);
  else console.error(`[service] Telegram не принял заявку №${id}: ${sent.reason}`);

  return Response.json({ ok: true, id });
}
