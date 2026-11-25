import { kufarXml } from "@/lib/kufar";

export const dynamic = "force-static";

export function GET() {
  return new Response(kufarXml(), {
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "cache-control": "public, max-age=3600",
      "x-robots-tag": "noindex",
    },
  });
}
