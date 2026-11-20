import { DISCLAIMER_FULL, DISCLAIMER_SHORT } from "@/lib/disclaimer";

export const dynamic = "force-static";

export function GET() {
  return Response.json(
    { short: DISCLAIMER_SHORT, full: DISCLAIMER_FULL },
    { headers: { "x-robots-tag": "noindex, nofollow", "cache-control": "public, max-age=86400" } },
  );
}
