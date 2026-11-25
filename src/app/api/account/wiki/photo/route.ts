import { crmCarPhoto, forbidden, wikiCustomer } from "@/lib/crm-wiki";

export const dynamic = "force-dynamic";

const ID = /^[\w.-]{1,100}$/;

export async function GET(request: Request) {
  if (!(await wikiCustomer())) return forbidden();
  const params = new URL(request.url).searchParams;
  const ids = [params.get("markId") ?? "", params.get("modelId") ?? "", params.get("generationId") ?? ""];
  if (!ids.every((id) => ID.test(id))) return new Response(null, { status: 404 });
  try {
    const upstream = await crmCarPhoto(ids.join("/"));
    if (!upstream.ok) return new Response(null, { status: 404 });
    return new Response(upstream.body, {
      headers: {
        "Content-Type": upstream.headers.get("content-type") ?? "image/jpeg",
        "Cache-Control": "private, max-age=86400",
      },
    });
  } catch {
    return new Response(null, { status: 404 });
  }
}
