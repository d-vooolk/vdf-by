import { revalidatePath } from "next/cache";

import { getAdmin } from "@/lib/auth";
import {
  commonsQueries,
  composerLabel,
  deleteCarFrontPhoto,
  describeCarPhoto,
  getCarFrontPhoto,
  getGenerationInfo,
  saveCarFrontPhoto,
  type PhotoCredit,
} from "@/lib/car-photos";
import { ACCEPTED } from "@/lib/image-pipeline.mjs";
import { blurPlates } from "@/lib/ml";
import { commonsFetch, commonsFile } from "@/lib/wikimedia";

export const dynamic = "force-dynamic";

const MAX_BYTES = 20 * 1024 * 1024;
const CREDITS_PATH = "/istochniki-foto";

function unauthorized() {
  return Response.json({ error: "Нужно войти заново" }, { status: 401 });
}

export async function GET(request: Request) {
  if (!(await getAdmin())) return unauthorized();

  const generationId = new URL(request.url).searchParams.get("generation") ?? "";
  const info = getGenerationInfo(generationId);
  if (!info) return Response.json({ error: "Поколение не найдено" }, { status: 404 });

  return Response.json({
    markId: info.markId,
    modelId: info.modelId,
    label: composerLabel(info, new Date().getFullYear()),
    query: commonsQueries(info)[0] ?? "",
    photo: describeCarPhoto(getCarFrontPhoto(generationId)),
  });
}

async function fromCommons(title: string): Promise<{ source: Buffer; credit: PhotoCredit }> {
  const file = await commonsFile(title);
  const response = await commonsFetch(file.downloadUrl);
  if (!response.ok) throw new Error(`Wikimedia отдала файл с ошибкой ${response.status}`);
  return {
    source: Buffer.from(await response.arrayBuffer()),
    credit: {
      title: file.title.replace(/^File:/, ""),
      author: file.author,
      license: file.license,
      licenseUrl: file.licenseUrl,
      sourceUrl: file.sourceUrl,
    },
  };
}

async function fromUpload(form: FormData): Promise<{ source: Buffer; credit: PhotoCredit }> {
  const file = form.get("file");
  if (!(file instanceof File)) throw new Error("Файл не выбран");
  if (file.size > MAX_BYTES) throw new Error("Файл больше 20 МБ");
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!ACCEPTED.has(extension)) throw new Error("Поддерживаются jpg, png, webp и avif");

  const sourceUrl = String(form.get("sourceUrl") ?? "").trim();
  return {
    source: Buffer.from(await file.arrayBuffer()),
    credit: {
      title: file.name,
      author: String(form.get("author") ?? "").trim(),
      license: String(form.get("license") ?? "").trim(),
      licenseUrl: "",
      sourceUrl: /^https?:\/\//i.test(sourceUrl) ? sourceUrl : "",
    },
  };
}

export async function POST(request: Request) {
  if (!(await getAdmin())) return unauthorized();

  try {
    const isJson = (request.headers.get("Content-Type") ?? "").includes("application/json");
    let generationId: string;
    let blur: boolean;
    let picked: { source: Buffer; credit: PhotoCredit };

    if (isJson) {
      const body = (await request.json()) as { generationId?: string; title?: string; blur?: boolean };
      generationId = String(body.generationId ?? "");
      blur = body.blur !== false;
      if (!getGenerationInfo(generationId)) throw new Error("Поколение не найдено");
      picked = await fromCommons(String(body.title ?? ""));
    } else {
      const form = await request.formData();
      generationId = String(form.get("generationId") ?? "");
      blur = form.get("blur") !== "0";
      if (!getGenerationInfo(generationId)) throw new Error("Поколение не найдено");
      picked = await fromUpload(form);
    }

    let source = picked.source;
    let plates = 0;
    let warning = "";
    if (blur) {
      try {
        const blurred = await blurPlates(source);
        source = blurred.image;
        plates = blurred.count;
      } catch (error) {
        warning = `Номера не размыты: ${(error as Error).message}`;
      }
    }

    const photo = await saveCarFrontPhoto(generationId, source, picked.credit);
    revalidatePath(CREDITS_PATH);
    return Response.json({ photo: describeCarPhoto(photo), plates, warning });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  if (!(await getAdmin())) return unauthorized();

  const generationId = new URL(request.url).searchParams.get("generation") ?? "";
  await deleteCarFrontPhoto(generationId);
  revalidatePath(CREDITS_PATH);
  return Response.json({ ok: true });
}
