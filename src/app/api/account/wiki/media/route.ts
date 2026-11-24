import { crmWiki, crmWikiRaw, forbidden, wikiCustomer, wikiErrorResponse } from "@/lib/crm-wiki";

export const dynamic = "force-dynamic";

const MAX_BYTES = 310 * 1024 * 1024;

export async function POST(request: Request) {
  const customer = await wikiCustomer();
  if (!customer) return forbidden();
  const contentType = request.headers.get("content-type") ?? "";
  const length = Number(request.headers.get("content-length") ?? 0);
  if (!contentType.startsWith("multipart/form-data") || !request.body) {
    return Response.json({ error: "Нет файла" }, { status: 400 });
  }
  if (length > MAX_BYTES) return Response.json({ error: "Файл больше 300 МБ" }, { status: 413 });
  try {
    const response = await crmWikiRaw("/proposal/media", customer, {
      method: "POST",
      body: request.body,
      contentType,
    });
    const payload = (await response.json().catch(() => ({}))) as { data?: unknown; message?: string };
    if (!response.ok) {
      return Response.json(
        { error: response.status === 401 ? "Вики временно недоступна" : payload.message ?? "Не удалось загрузить файл" },
        { status: response.status >= 500 ? 502 : response.status },
      );
    }
    return Response.json({ media: payload.data }, { status: 201 });
  } catch (error) {
    return wikiErrorResponse(error);
  }
}

export async function DELETE(request: Request) {
  const customer = await wikiCustomer();
  if (!customer) return forbidden();
  const id = new URL(request.url).searchParams.get("id") ?? "";
  try {
    await crmWiki(`/proposal/media/${encodeURIComponent(id)}`, customer, { method: "DELETE" });
    return Response.json({ ok: true });
  } catch (error) {
    return wikiErrorResponse(error);
  }
}
