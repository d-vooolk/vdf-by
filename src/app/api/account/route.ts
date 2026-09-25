import { getSite } from "@/lib/catalog";
import { getCustomer, signInCustomer, signOutCustomer } from "@/lib/customer-auth";
import {
  canSendCode,
  findCustomerByPhone,
  isWholesale,
  issueCode,
  markCodeSent,
  updateCustomerProfile,
  verifyCode,
  type Customer,
  type CustomerKind,
  type Registration,
} from "@/lib/customers";
import { formatPhone, normalizePhone } from "@/lib/phone";
import { sendSms, SmsError, smsConfigured } from "@/lib/sms";
import { escapeTelegram, sendTelegram } from "@/lib/telegram";
import { buildWholesaleList } from "@/lib/wholesale";

export const dynamic = "force-dynamic";

const text = (value: unknown, limit: number) =>
  typeof value === "string" ? value.trim().slice(0, limit) : "";

function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

function publicCustomer(customer: Customer) {
  return {
    name: customer.name,
    phone: formatPhone(customer.phone),
    kind: customer.kind,
    address: customer.address,
    wholesaleStatus: customer.wholesaleStatus,
  };
}

const noStore = { headers: { "Cache-Control": "no-store" } };

export async function GET() {
  const customer = await getCustomer();
  if (!customer) return Response.json({ customer: null }, noStore);
  return Response.json(
    {
      customer: publicCustomer(customer),
      wholesale: isWholesale(customer) ? buildWholesaleList() : null,
    },
    noStore,
  );
}

async function deliverCode(
  phone: string,
  purpose: "register" | "login",
  ip: string,
  payload: Registration | null,
): Promise<Response> {
  const allowed = canSendCode(phone, ip);
  if (!allowed.ok) {
    return Response.json({ error: allowed.error, retryIn: allowed.retryIn }, { status: 429 });
  }

  const { id, code } = issueCode(phone, purpose, ip, payload);
  const siteName = getSite().name;

  if (!smsConfigured() && process.env.NODE_ENV !== "production") {
    console.log(`[account] SMS не настроены, код для ${phone}: ${code}`);
    markCodeSent(id, null);
    return Response.json({ sent: true, retryIn: 60 });
  }

  try {
    await sendSms(phone, `Код для входа на ${siteName}: ${code}`);
    markCodeSent(id, null);
    return Response.json({ sent: true, retryIn: 60 });
  } catch (error) {
    const message = error instanceof SmsError ? error.message : "ошибка отправки";
    markCodeSent(id, message);
    console.error(`[account] SMS на ${phone} не ушло: ${message}`);
    return Response.json(
      { error: "Не удалось отправить SMS. Попробуйте позже или позвоните нам" },
      { status: 502 },
    );
  }
}

async function notifyWholesaleRequest(customer: Customer): Promise<void> {
  const lines = [
    "<b>Заявка на оптовые цены</b>",
    `${escapeTelegram(customer.name)}`,
    `Телефон: ${escapeTelegram(formatPhone(customer.phone))}`,
    customer.address ? `Адрес: ${escapeTelegram(customer.address)}` : "",
    "",
    "Проверьте и подтвердите в админке → «Покупатели».",
  ].filter(Boolean);
  const sent = await sendTelegram(lines.join("\n"));
  if (!sent.ok) console.error(`[account] Telegram не принял заявку на опт: ${sent.reason}`);
}

export async function POST(request: Request) {
  const body = ((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  const action = text(body.action, 20);
  const ip = clientIp(request);

  if (action === "logout") {
    await signOutCustomer();
    return Response.json({ ok: true });
  }

  if (action === "profile") {
    const customer = await getCustomer();
    if (!customer) return Response.json({ error: "Войдите заново" }, { status: 401 });
    const name = text(body.name, 160);
    const address = text(body.address, 300);
    const requestWholesale = body.requestWholesale === true;
    if (name.length < 2) return Response.json({ error: "Укажите ФИО или название компании" }, { status: 400 });
    if ((requestWholesale || customer.kind === "wholesale") && address.length < 5) {
      return Response.json({ error: "Для опта укажите адрес магазина или мастерской" }, { status: 400 });
    }
    updateCustomerProfile(customer.id, { name, address, requestWholesale });
    if (requestWholesale && customer.wholesaleStatus === "none") {
      await notifyWholesaleRequest({ ...customer, name, address });
    }
    return Response.json({ ok: true });
  }

  const phone = normalizePhone(text(body.phone, 40));
  if (!phone) {
    return Response.json({ error: "Номер нужен белорусский: +375 XX XXX-XX-XX" }, { status: 400 });
  }

  if (action === "register") {
    const name = text(body.name, 160);
    const kind: CustomerKind = body.kind === "wholesale" ? "wholesale" : "retail";
    const address = kind === "wholesale" ? text(body.address, 300) : "";
    if (name.length < 2) {
      return Response.json({ error: "Укажите ФИО или название компании" }, { status: 400 });
    }
    if (kind === "wholesale" && address.length < 5) {
      return Response.json({ error: "Укажите адрес магазина или мастерской" }, { status: 400 });
    }
    if (body.consent !== true) {
      return Response.json(
        { error: "Нужно согласие на обработку персональных данных" },
        { status: 400 },
      );
    }
    if (findCustomerByPhone(phone)) {
      return Response.json(
        { error: "Этот номер уже зарегистрирован — войдите по коду", registered: true },
        { status: 409 },
      );
    }
    return deliverCode(phone, "register", ip, { name, kind, address });
  }

  if (action === "login") {
    if (!findCustomerByPhone(phone)) {
      return Response.json(
        { error: "Номер не зарегистрирован — сначала зарегистрируйтесь", unknown: true },
        { status: 404 },
      );
    }
    return deliverCode(phone, "login", ip, null);
  }

  if (action === "verify") {
    const code = text(body.code, 10).replace(/\D/g, "");
    if (code.length !== 6) return Response.json({ error: "Код — шесть цифр" }, { status: 400 });
    const result = verifyCode(phone, code);
    if (!result.ok) return Response.json({ error: result.error }, { status: 400 });
    await signInCustomer(result.customer.id);
    if (result.created && result.customer.wholesaleStatus === "pending") {
      await notifyWholesaleRequest(result.customer);
    }
    return Response.json({ ok: true, customer: publicCustomer(result.customer) });
  }

  return Response.json({ error: "Неизвестное действие" }, { status: 400 });
}
