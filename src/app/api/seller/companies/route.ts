import { getCustomer } from "@/lib/customer-auth";
import { createWholesaleCompany, listWholesaleCompanies, type WholesaleCompany } from "@/lib/customers";
import { formatPhone, normalizePhone } from "@/lib/phone";

export const dynamic = "force-dynamic";

const noStore = { headers: { "Cache-Control": "no-store" } };

const text = (value: unknown, limit: number) =>
  typeof value === "string" ? value.trim().slice(0, limit) : "";

const publicCompany = (company: WholesaleCompany) => ({ ...company, phone: formatPhone(company.phone) });

async function sellerOnly(): Promise<Response | null> {
  const signed = await getCustomer();
  return signed?.seller ? null : Response.json({ error: "Только для продавцов" }, { status: 403 });
}

export async function GET() {
  const denied = await sellerOnly();
  if (denied) return denied;
  return Response.json({ companies: listWholesaleCompanies().map(publicCompany) }, noStore);
}

export async function POST(request: Request) {
  const denied = await sellerOnly();
  if (denied) return denied;
  const body = ((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  const name = text(body.name, 160);
  const address = text(body.address, 300);
  const phone = normalizePhone(text(body.phone, 40));
  if (name.length < 2) return Response.json({ error: "Укажите название компании или ФИО" }, { status: 400 });
  if (!phone) return Response.json({ error: "Номер нужен белорусский: +375 XX XXX-XX-XX" }, { status: 400 });
  if (address.length < 5) return Response.json({ error: "Укажите адрес магазина или мастерской" }, { status: 400 });
  if (body.consent !== true) {
    return Response.json({ error: "Нужно согласие компании на обработку персональных данных" }, { status: 400 });
  }
  const result = createWholesaleCompany(phone, name, address);
  if (!result.ok) return Response.json({ error: result.error }, { status: 409 });
  const { customer } = result;
  return Response.json({
    company: publicCompany({ id: customer.id, name: customer.name, phone: customer.phone, address: customer.address, orders: 0 }),
  });
}
