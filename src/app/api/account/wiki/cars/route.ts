import { crmCars, forbidden, wikiCustomer, wikiErrorResponse } from "@/lib/crm-wiki";

export const dynamic = "force-dynamic";

const ID = /^[\w.-]{1,100}$/;

export async function GET(request: Request) {
  if (!(await wikiCustomer())) return forbidden();
  const params = new URL(request.url).searchParams;
  const mark = params.get("mark") ?? "";
  const model = params.get("model") ?? "";
  if ((mark && !ID.test(mark)) || (model && !ID.test(model))) {
    return Response.json({ error: "Неверный запрос" }, { status: 400 });
  }
  try {
    const path = mark && model
      ? `/marks/${mark}/models/${model}/generations`
      : mark
        ? `/marks/${mark}/models`
        : "/marks";
    return Response.json(await crmCars(path));
  } catch (error) {
    return wikiErrorResponse(error);
  }
}
