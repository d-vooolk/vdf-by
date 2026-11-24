import { crmWiki, forbidden, wikiCustomer, wikiErrorResponse } from "@/lib/crm-wiki";

export const dynamic = "force-dynamic";

export async function GET() {
  const customer = await wikiCustomer();
  if (!customer) return forbidden();
  try {
    return Response.json({ proposals: await crmWiki("/proposals", customer) });
  } catch (error) {
    return wikiErrorResponse(error);
  }
}
