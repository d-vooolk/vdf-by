import { pickerTree } from "@/lib/car-picker";

export const dynamic = "force-static";

export function GET() {
  return Response.json(pickerTree(), { headers: { "x-robots-tag": "noindex" } });
}
