import { bamperCsv } from "@/lib/bamper";

export const dynamic = "force-static";

export function GET() {
  return new Response(bamperCsv(), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'inline; filename="vdf-bamper.csv"',
      "cache-control": "public, max-age=3600",
      "x-robots-tag": "noindex",
    },
  });
}
