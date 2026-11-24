import { crmWiki, forbidden, wikiCustomer, wikiErrorResponse } from "@/lib/crm-wiki";

export const dynamic = "force-dynamic";

export async function GET() {
  const customer = await wikiCustomer();
  if (!customer) return forbidden();
  try {
    const [entries, sections] = await Promise.all([
      crmWiki<unknown[]>("/entries", customer),
      crmWiki<unknown[]>("/sections", customer),
    ]);
    return Response.json({ entries, sections });
  } catch (error) {
    return wikiErrorResponse(error);
  }
}
