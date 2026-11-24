import { crmUpload, forbidden, wikiCustomer, wikiErrorResponse } from "@/lib/crm-wiki";

export const dynamic = "force-dynamic";

const SEGMENT = /^[\w.-]+$/;
const PASS_HEADERS = ["content-type", "content-length", "content-range", "accept-ranges", "last-modified", "etag"];

export async function GET(request: Request, ctx: { params: Promise<{ path: string[] }> }) {
  if (!(await wikiCustomer())) return forbidden();
  const { path } = await ctx.params;
  if (!path.length || path.some((segment) => !SEGMENT.test(segment) || segment.startsWith("."))) {
    return new Response(null, { status: 404 });
  }
  try {
    const upstream = await crmUpload(path.join("/"), request.headers.get("range"));
    if (!upstream.ok && upstream.status !== 206) return new Response(null, { status: 404 });
    const headers = new Headers({ "Cache-Control": "private, max-age=86400" });
    for (const name of PASS_HEADERS) {
      const value = upstream.headers.get(name);
      if (value) headers.set(name, value);
    }
    return new Response(upstream.body, { status: upstream.status, headers });
  } catch (error) {
    return wikiErrorResponse(error);
  }
}
