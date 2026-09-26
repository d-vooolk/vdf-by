import { getAdmin } from "@/lib/auth";
import { getCarFrontPhoto, readCarFrontPhoto } from "@/lib/car-photos";
import { composeProductImage } from "@/lib/composer";
import { storeImage } from "@/lib/image-store";
import { revalidateImages } from "@/lib/revalidate";

export const dynamic = "force-dynamic";

const MAX_BYTES = 20 * 1024 * 1024;
const MAX_LABEL = 120;

function numberField(form: FormData, name: string, fallback: number): number {
  const value = Number(form.get(name));
  return Number.isFinite(value) ? value : fallback;
}

export async function POST(request: Request) {
  if (!(await getAdmin())) {
    return Response.json({ error: "Нужно войти заново" }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "Не удалось прочитать запрос" }, { status: 400 });
  }

  const product = form.get("product");
  if (!(product instanceof File) || !product.size) {
    return Response.json({ error: "Загрузите фото товара" }, { status: 400 });
  }
  if (product.size > MAX_BYTES) {
    return Response.json({ error: "Фото товара больше 20 МБ" }, { status: 400 });
  }

  const photo = getCarFrontPhoto(String(form.get("generationId") ?? ""));
  if (!photo) {
    return Response.json({ error: "Для этого поколения ещё не выбрано фото автомобиля" }, { status: 400 });
  }

  try {
    const image = await composeProductImage({
      product: Buffer.from(await product.arrayBuffer()),
      car: await readCarFrontPhoto(photo),
      label: String(form.get("label") ?? "").slice(0, MAX_LABEL),
      mirrorProduct: form.get("mirrorProduct") === "1",
      mirrorCar: form.get("mirrorCar") === "1",
      slope: form.get("slope") === "down" ? "down" : "up",
      productScale: numberField(form, "productScale", 1),
      carShift: numberField(form, "carShift", 0.5),
    });

    if (form.get("save") !== "1") {
      return new Response(new Uint8Array(image), {
        headers: { "Content-Type": "image/jpeg", "Cache-Control": "no-store" },
      });
    }

    const stored = await storeImage({
      source: image,
      folder: String(form.get("folder") ?? "") || "composed",
      filename: String(form.get("filename") ?? "") || "product.jpg",
    });
    if (!stored) throw new Error("Не удалось сохранить картинку");
    revalidateImages();
    return Response.json({ path: stored.path, thumb: stored.thumb });
  } catch (error) {
    console.error("[composer]", error);
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
}
