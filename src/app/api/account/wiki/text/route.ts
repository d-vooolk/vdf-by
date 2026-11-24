import { crmWiki, forbidden, wikiCustomer, wikiErrorResponse } from "@/lib/crm-wiki";

export const dynamic = "force-dynamic";

export async function PUT(request: Request) {
  const customer = await wikiCustomer();
  if (!customer) return forbidden();
  try {
    const body = await request.json();
    return Response.json({ proposal: await crmWiki("/proposal/text", customer, { method: "PUT", json: body }) });
  } catch (error) {
    return wikiErrorResponse(error);
  }
}
