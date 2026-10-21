import { crmKeyMatches } from "@/lib/integration-key";
import { triggerPanic } from "@/lib/panic";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!crmKeyMatches(request.headers.get("x-integration-key") ?? "")) {
    return Response.json({ error: "forbidden" }, { status: 401 });
  }
  let pin = "";
  try {
    const body = (await request.json()) as { pin?: unknown };
    if (typeof body.pin === "string") pin = body.pin.trim();
  } catch {
    pin = "";
  }
  const done = await triggerPanic(pin, { propagate: false });
  return Response.json(done ? { data: [], done: true } : { data: [] });
}
