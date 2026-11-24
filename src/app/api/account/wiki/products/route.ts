import { crmWiki, forbidden, wikiCustomer, wikiErrorResponse } from "@/lib/crm-wiki";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const customer = await wikiCustomer();
  if (!customer) return forbidden();
  try {
    const body = await request.json();
    return Response.json({ proposal: await crmWiki("/proposal/products", customer, { method: "POST", json: body }) });
  } catch (error) {
    return wikiErrorResponse(error);
  }
}

export async function DELETE(request: Request) {
  const customer = await wikiCustomer();
  if (!customer) return forbidden();
  const id = new URL(request.url).searchParams.get("id") ?? "";
  try {
    await crmWiki(`/proposal/products/${encodeURIComponent(id)}`, customer, { method: "DELETE" });
    return Response.json({ ok: true });
  } catch (error) {
    return wikiErrorResponse(error);
  }
}
