import { getAdmin } from "@/lib/auth";
import { createImport, importSummary } from "@/lib/vdf-product-import";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!(await getAdmin())) return Response.json({ error: "Нужно войти заново" }, { status: 401 });

  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File) || !file.size) throw new Error("Выберите файл таблицы");
    const unit = String(form.get("unit") ?? "");
    if (unit !== "шт." && unit !== "комплект") throw new Error("Выберите единицу: шт. или комплект");
    const id = createImport(file.name, new Uint8Array(await file.arrayBuffer()), {
      categoryId: String(form.get("categoryId") ?? ""),
      unit,
      photos: form.get("photos") === "1",
      faq: form.get("faq") === "1",
    });
    return Response.json({ import: importSummary(id) });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 400 });
  }
}
