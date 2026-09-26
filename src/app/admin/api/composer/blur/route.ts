import sharp from "sharp";

import { getAdmin } from "@/lib/auth";
import {
  describeCarPhoto,
  getCarFrontPhoto,
  readCarFrontPhoto,
  saveCarFrontPhoto,
} from "@/lib/car-photos";
import { blurRegions } from "@/lib/ml";

export const dynamic = "force-dynamic";

interface Body {
  generationId?: string;
  region?: { x?: number; y?: number; width?: number; height?: number };
}

const share = (value: unknown) => Math.min(1, Math.max(0, Number(value) || 0));

export async function POST(request: Request) {
  if (!(await getAdmin())) {
    return Response.json({ error: "Нужно войти заново" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as Body;
  const generationId = String(body.generationId ?? "");
  const photo = getCarFrontPhoto(generationId);
  if (!photo) return Response.json({ error: "Фото автомобиля не найдено" }, { status: 404 });

  const x = share(body.region?.x);
  const y = share(body.region?.y);
  const width = Math.min(share(body.region?.width), 1 - x);
  const height = Math.min(share(body.region?.height), 1 - y);
  if (width < 0.005 || height < 0.005) {
    return Response.json({ error: "Выделите область мышкой" }, { status: 400 });
  }

  try {
    const source = await readCarFrontPhoto(photo);
    const meta = await sharp(source).metadata();
    const imageWidth = meta.width ?? 0;
    const imageHeight = meta.height ?? 0;
    const blurred = await blurRegions(source, [
      { left: x * imageWidth, top: y * imageHeight, width: width * imageWidth, height: height * imageHeight },
    ]);
    const saved = await saveCarFrontPhoto(generationId, blurred, {
      title: photo.title,
      author: photo.author,
      license: photo.license,
      licenseUrl: photo.licenseUrl,
      sourceUrl: photo.sourceUrl,
    });
    return Response.json({ photo: describeCarPhoto(saved) });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
}
