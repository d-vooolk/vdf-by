import { getAdmin } from "@/lib/auth";
import { PANIC_STEPS, triggerPanic } from "@/lib/panic";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!(await getAdmin())) return new Response("Нужно войти заново", { status: 401 });
  const body = (await request.json().catch(() => null)) as { pin?: unknown } | null;
  const pin = typeof body?.pin === "string" ? body.pin.trim().slice(0, 100) : "";
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (message: object) => controller.enqueue(encoder.encode(`${JSON.stringify(message)}\n`));
      const done = await triggerPanic(pin, {
        propagate: true,
        onStep: (step) => send({ step, total: PANIC_STEPS.length, label: PANIC_STEPS[step] }),
      }).catch(() => false);
      send({ done });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" },
  });
}
