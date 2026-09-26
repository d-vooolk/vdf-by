"use client";

import { useEffect, useRef, useState } from "react";

import { Combobox, type ComboOption } from "@/components/Combobox";
import { SpinnerIcon } from "@/components/icons";
import { years, type CarGeneration, type CarModel } from "@/lib/car-types";
import { toSlug } from "@/lib/slug.mjs";

import { ComposerCarPhoto, type CarPhotoInfo } from "./ComposerCarPhoto";

const THIS_YEAR = new Date().getFullYear();
const PRODUCT_MAX_SIDE = 2000;
const PREVIEW_DELAY = 450;

interface AdminMark {
  id: string;
  name: string;
  icon?: string;
}

interface CarsResponse {
  marks?: AdminMark[];
  models?: CarModel[];
  generations?: CarGeneration[];
  error?: string;
}

interface CarInfo {
  markId: string;
  modelId: string;
  label: string;
  query: string;
  photo: CarPhotoInfo | null;
}

export interface ComposerProductImage {
  path: string;
  thumb: string;
}

export interface ComposedImage {
  path: string;
  thumb: string;
}

interface ImageComposerProps {
  initialGenerationId?: string;
  productImages?: ComposerProductImage[];
  folder?: string;
  onSaved?: (image: ComposedImage) => void;
}

interface RenderSettings {
  product: Blob;
  generationId: string;
  label: string;
  mirrorProduct: boolean;
  mirrorCar: boolean;
  slope: "up" | "down";
  productScale: number;
  carShift: number;
}

async function readError(response: Response): Promise<string> {
  const data = (await response.json().catch(() => ({}))) as { error?: string };
  return data.error ?? `Ошибка ${response.status}`;
}

async function loadCars(query: string): Promise<CarsResponse> {
  const response = await fetch(`/admin/api/cars/${query}`);
  if (!response.ok) throw new Error(await readError(response));
  return (await response.json()) as CarsResponse;
}

async function loadCarInfo(generationId: string): Promise<CarInfo> {
  const response = await fetch(`/admin/api/composer/car/?generation=${encodeURIComponent(generationId)}`);
  if (!response.ok) throw new Error(await readError(response));
  return (await response.json()) as CarInfo;
}

async function shrink(source: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(source, { imageOrientation: "from-image" });
  const scale = Math.min(1, PRODUCT_MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Не удалось прочитать фото товара"))),
      "image/webp",
      0.95,
    ),
  );
}

async function cutBackground(image: Blob): Promise<Blob> {
  const form = new FormData();
  form.set("image", image, "product.webp");
  const response = await fetch("/admin/api/composer/cutout/", { method: "POST", body: form });
  if (!response.ok) throw new Error(await readError(response));
  return response.blob();
}

function renderForm(settings: RenderSettings): FormData {
  const form = new FormData();
  form.set("product", settings.product, "product.png");
  form.set("generationId", settings.generationId);
  form.set("label", settings.label);
  form.set("mirrorProduct", settings.mirrorProduct ? "1" : "0");
  form.set("mirrorCar", settings.mirrorCar ? "1" : "0");
  form.set("slope", settings.slope);
  form.set("productScale", String(settings.productScale));
  form.set("carShift", String(settings.carShift));
  return form;
}

export function ImageComposer({ initialGenerationId, productImages = [], folder, onSaved }: ImageComposerProps) {
  const [marks, setMarks] = useState<AdminMark[] | null>(null);
  const [models, setModels] = useState<CarModel[] | undefined>();
  const [generations, setGenerations] = useState<CarGeneration[] | undefined>();
  const [markId, setMarkId] = useState("");
  const [modelId, setModelId] = useState("");
  const [generationId, setGenerationId] = useState("");
  const [car, setCar] = useState<CarInfo | null>(null);

  const [original, setOriginal] = useState<Blob | null>(null);
  const [cutout, setCutout] = useState<Blob | null>(null);
  const [removeBackground, setRemoveBackground] = useState(true);
  const [cutting, setCutting] = useState(false);
  const [pickedImage, setPickedImage] = useState("");

  const [label, setLabel] = useState("");
  const [mirrorProduct, setMirrorProduct] = useState(false);
  const [mirrorCar, setMirrorCar] = useState(false);
  const [slope, setSlope] = useState<"up" | "down">("up");
  const [productScale, setProductScale] = useState(1);
  const [carShift, setCarShift] = useState(0.5);

  const [preview, setPreview] = useState<{ url: string; blob: Blob } | null>(null);
  const [rendering, setRendering] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<ComposedImage | null>(null);
  const [error, setError] = useState("");
  const requestId = useRef(0);
  const cutoutId = useRef(0);

  useEffect(() => {
    let alive = true;
    loadCars("")
      .then((data) => alive && setMarks(data.marks ?? []))
      .catch((problem: Error) => alive && setError(problem.message));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!initialGenerationId) return;
    let alive = true;
    (async () => {
      const info = await loadCarInfo(initialGenerationId);
      const [modelList, generationList] = await Promise.all([
        loadCars(`?mark=${encodeURIComponent(info.markId)}`),
        loadCars(`?model=${encodeURIComponent(info.modelId)}`),
      ]);
      if (!alive) return;
      setModels(modelList.models ?? []);
      setGenerations(generationList.generations ?? []);
      setMarkId(info.markId);
      setModelId(info.modelId);
      setGenerationId(initialGenerationId);
      setCar(info);
      setLabel(info.label);
    })().catch((problem: Error) => alive && setError(problem.message));
    return () => {
      alive = false;
    };
  }, [initialGenerationId]);

  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview.url);
    },
    [preview],
  );

  const photo = car?.photo ?? null;
  const product = removeBackground ? cutout : original;

  useEffect(() => {
    if (!product || !generationId || !photo) return;
    const id = ++requestId.current;
    const timer = setTimeout(async () => {
      setRendering(true);
      setError("");
      try {
        const form = renderForm({ product, generationId, label, mirrorProduct, mirrorCar, slope, productScale, carShift });
        const response = await fetch("/admin/api/composer/render/", { method: "POST", body: form });
        if (!response.ok) throw new Error(await readError(response));
        const blob = await response.blob();
        if (id !== requestId.current) return;
        setPreview({ url: URL.createObjectURL(blob), blob });
        setSaved(null);
      } catch (problem) {
        if (id === requestId.current) setError((problem as Error).message);
      } finally {
        if (id === requestId.current) setRendering(false);
      }
    }, PREVIEW_DELAY);
    return () => clearTimeout(timer);
  }, [product, generationId, photo, label, mirrorProduct, mirrorCar, slope, productScale, carShift]);

  const runCutout = async (image: Blob) => {
    const id = ++cutoutId.current;
    setCutting(true);
    setError("");
    try {
      const result = await cutBackground(image);
      if (id === cutoutId.current) setCutout(result);
    } catch (problem) {
      if (id === cutoutId.current) {
        setError((problem as Error).message);
        setRemoveBackground(false);
      }
    } finally {
      if (id === cutoutId.current) setCutting(false);
    }
  };

  const applyProduct = async (source: Blob) => {
    setError("");
    try {
      const image = await shrink(source);
      setOriginal(image);
      setCutout(null);
      if (removeBackground) await runCutout(image);
    } catch (problem) {
      setError((problem as Error).message);
    }
  };

  const chooseFile = (file: File | undefined) => {
    if (!file) return;
    setPickedImage("");
    void applyProduct(file);
  };

  const chooseProductImage = async (image: ComposerProductImage) => {
    setPickedImage(image.path);
    try {
      const response = await fetch(`/admin/api/composer/image/?path=${encodeURIComponent(image.path)}`);
      if (!response.ok) throw new Error("Не удалось загрузить фото товара");
      await applyProduct(await response.blob());
    } catch (problem) {
      setError((problem as Error).message);
    }
  };

  const toggleBackground = (next: boolean) => {
    setRemoveBackground(next);
    if (next && original && !cutout && !cutting) void runCutout(original);
  };

  const chooseMark = (next: string) => {
    setMarkId(next);
    setModelId("");
    setGenerationId("");
    setModels(undefined);
    setGenerations(undefined);
    setCar(null);
    if (!next) return;
    loadCars(`?mark=${encodeURIComponent(next)}`)
      .then((data) => setModels(data.models ?? []))
      .catch((problem: Error) => setError(problem.message));
  };

  const chooseModel = (next: string) => {
    setModelId(next);
    setGenerationId("");
    setGenerations(undefined);
    setCar(null);
    if (!next) return;
    loadCars(`?model=${encodeURIComponent(next)}`)
      .then((data) => setGenerations(data.generations ?? []))
      .catch((problem: Error) => setError(problem.message));
  };

  const chooseGeneration = async (next: string) => {
    setGenerationId(next);
    setCar(null);
    if (!next) return;
    try {
      const info = await loadCarInfo(next);
      setCar(info);
      setLabel(info.label);
    } catch (problem) {
      setError((problem as Error).message);
    }
  };

  const filename = `${toSlug(label) || "product"}.jpg`;

  const download = () => {
    if (!preview) return;
    const link = document.createElement("a");
    link.href = preview.url;
    link.download = filename;
    link.click();
  };

  const save = async () => {
    if (!product || !photo) return;
    setSaving(true);
    setError("");
    try {
      const form = renderForm({ product, generationId, label, mirrorProduct, mirrorCar, slope, productScale, carShift });
      form.set("save", "1");
      form.set("filename", filename);
      if (folder) form.set("folder", folder);
      const response = await fetch("/admin/api/composer/render/", { method: "POST", body: form });
      if (!response.ok) throw new Error(await readError(response));
      const data = (await response.json()) as ComposedImage;
      setSaved(data);
      onSaved?.(data);
    } catch (problem) {
      setError((problem as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const markOptions: ComboOption[] = (marks ?? []).map((item) => ({ value: item.id, label: item.name, icon: item.icon }));
  const modelOptions: ComboOption[] = (models ?? []).map((item) => ({ value: item.id, label: item.name }));
  const generationOptions: ComboOption[] = (generations ?? []).map((item) => ({
    value: item.id,
    label: item.name,
    hint: years(item, THIS_YEAR),
  }));

  const waiting = !generationId
    ? "Выберите автомобиль"
    : !photo
      ? "Выберите фото автомобиля"
      : cutting
        ? "Убираем фон с фото товара…"
        : !product
          ? "Загрузите фото товара"
          : "Собираем картинку…";

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,520px)]">
      <div className="space-y-6">
        <section className="card space-y-4 p-5">
          <h2 className="font-semibold text-brand-900">1. Автомобиль</h2>
          {marks === null ? (
            <p className="flex items-center gap-2 text-sm text-brand-400">
              <SpinnerIcon className="h-4 w-4 animate-spin" />
              Загружаем справочник машин…
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-3">
              <Combobox value={markId} onChange={chooseMark} options={markOptions} placeholder="Марка" />
              <Combobox
                value={modelId}
                onChange={chooseModel}
                options={modelOptions}
                placeholder={markId && models === undefined ? "Загружаем…" : "Модель"}
                disabled={!markId || models === undefined}
              />
              <Combobox
                value={generationId}
                onChange={chooseGeneration}
                options={generationOptions}
                placeholder={modelId && generations === undefined ? "Загружаем…" : "Поколение"}
                disabled={!modelId || generations === undefined}
              />
            </div>
          )}
          {generationId && car && (
            <ComposerCarPhoto
              key={generationId}
              generationId={generationId}
              initialQuery={car.query}
              photo={car.photo}
              onChange={(next) => setCar({ ...car, photo: next })}
            />
          )}
        </section>

        <section className="card space-y-4 p-5">
          <h2 className="font-semibold text-brand-900">2. Товар</h2>
          {productImages.length > 0 && (
            <div className="space-y-2">
              <p className="label">Фото из карточки товара</p>
              <ul className="flex flex-wrap gap-2">
                {productImages.map((image) => (
                  <li key={image.path}>
                    <button
                      type="button"
                      onClick={() => chooseProductImage(image)}
                      className={`block h-20 w-20 overflow-hidden rounded-lg border-2 bg-white ${
                        pickedImage === image.path ? "border-brand-700" : "border-brand-100 hover:border-brand-300"
                      }`}
                    >
                      <img src={image.thumb} alt="" className="h-full w-full object-contain" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <label className="block text-sm">
            <span className="label">{productImages.length ? "Или загрузить другое фото" : "Фото товара"}</span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/avif"
              onChange={(event) => chooseFile(event.target.files?.[0])}
              className="block w-full text-sm"
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-brand-800">
            <input type="checkbox" checked={removeBackground} onChange={(event) => toggleBackground(event.target.checked)} />
            Убрать фон нейросетью
            {cutting && <SpinnerIcon className="h-4 w-4 animate-spin" />}
          </label>
          <p className="text-xs text-brand-500">
            Фон убирается на сервере, 3–5 секунд на фото. Самый первый запуск дольше: сервер
            скачивает модель (180 МБ). Если край товара срезался, выключите галочку: тогда
            обрезаются только белые поля.
          </p>
        </section>

        <section className="card space-y-4 p-5">
          <h2 className="font-semibold text-brand-900">3. Оформление</h2>
          <label className="block text-sm">
            <span className="label">Надпись на линии</span>
            <input value={label} onChange={(event) => setLabel(event.target.value)} maxLength={120} className="field py-2 text-sm" />
          </label>
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-brand-800">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={mirrorProduct} onChange={(event) => setMirrorProduct(event.target.checked)} />
              Отразить товар
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={mirrorCar} onChange={(event) => setMirrorCar(event.target.checked)} />
              Отразить автомобиль
            </label>
            <span className="flex items-center gap-3">
              Линия:
              <label className="flex items-center gap-1.5">
                <input type="radio" name="slope" checked={slope === "up"} onChange={() => setSlope("up")} />↗
              </label>
              <label className="flex items-center gap-1.5">
                <input type="radio" name="slope" checked={slope === "down"} onChange={() => setSlope("down")} />↘
              </label>
            </span>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="label">Размер товара: {Math.round(productScale * 100)}%</span>
              <input
                type="range"
                min={0.5}
                max={1.3}
                step={0.05}
                value={productScale}
                onChange={(event) => setProductScale(Number(event.target.value))}
                className="w-full"
              />
            </label>
            <label className="block text-sm">
              <span className="label">Автомобиль выше / ниже</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={carShift}
                onChange={(event) => setCarShift(Number(event.target.value))}
                className="w-full"
              />
            </label>
          </div>
        </section>
      </div>

      <aside className="space-y-4 xl:sticky xl:top-6 xl:self-start">
        <div className="card relative aspect-square overflow-hidden bg-brand-50">
          {preview ? (
            <img src={preview.url} alt="Предпросмотр" className="h-full w-full object-contain" />
          ) : (
            <p className="flex h-full items-center justify-center p-8 text-center text-sm text-brand-400">{waiting}</p>
          )}
          {(rendering || cutting) && (
            <span className="absolute top-3 right-3 rounded-full bg-white/90 p-2 shadow">
              <SpinnerIcon className="h-5 w-5 animate-spin" />
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-secondary" onClick={download} disabled={!preview || rendering}>
            Скачать JPG
          </button>
          <button type="button" className="btn-primary" onClick={save} disabled={!preview || rendering || saving}>
            {saving && <SpinnerIcon className="h-4 w-4 animate-spin" />}
            {onSaved ? "Добавить в фото товара" : "Сохранить в «Фото»"}
          </button>
        </div>
        {saved && (
          <p className="text-sm text-emerald-700">
            {onSaved ? (
              <>Картинка добавлена в галерею товара. Не забудьте сохранить товар.</>
            ) : (
              <>
                Сохранено: <code className="text-xs">{saved.path}</code>. Его можно выбрать в карточке товара через
                «Выбрать из загруженных».
              </>
            )}
          </p>
        )}
        {error && <p className="text-sm text-red-700">{error}</p>}
      </aside>
    </div>
  );
}
