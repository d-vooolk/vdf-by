import { crmWiki, forbidden, wikiCustomer, wikiErrorResponse } from "@/lib/crm-wiki";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const customer = await wikiCustomer();
  if (!customer) return forbidden();
  try {
    const { id } = (await request.json()) as { id?: unknown };
    if (typeof id !== "string" || !id) return Response.json({ error: "Неверный запрос" }, { status: 400 });
    const proposal = await crmWiki(`/proposal/${encodeURIComponent(id)}/submit`, customer, { method: "POST" });
    return Response.json({ proposal });
  } catch (error) {
    return wikiErrorResponse(error);
  }
}

export async function DELETE(request: Request) {
  const customer = await wikiCustomer();
  if (!customer) return forbidden();
  const id = new URL(request.url).searchParams.get("id") ?? "";
  try {
    await crmWiki(`/proposal/${encodeURIComponent(id)}`, customer, { method: "DELETE" });
    return Response.json({ ok: true });
  } catch (error) {
    return wikiErrorResponse(error);
  }
}
