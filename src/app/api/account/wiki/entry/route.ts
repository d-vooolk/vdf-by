import { crmWiki, forbidden, wikiCustomer, wikiErrorResponse } from "@/lib/crm-wiki";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const customer = await wikiCustomer();
  if (!customer) return forbidden();
  const params = new URL(request.url).searchParams;
  const query = {
    markId: params.get("markId") ?? "",
    modelId: params.get("modelId") ?? "",
    generationId: params.get("generationId") ?? "",
  };
  try {
    return Response.json(await crmWiki("/entry", customer, { query }));
  } catch (error) {
    return wikiErrorResponse(error);
  }
}
