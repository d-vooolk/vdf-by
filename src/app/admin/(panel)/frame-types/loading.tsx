import { SpinnerIcon } from "@/components/icons";

export default function FrameTypesLoading() {
  return (
    <div role="status" className="flex items-center justify-center gap-3 py-24 text-sm text-brand-500">
      <SpinnerIcon className="h-5 w-5 animate-spin" />
      Загружаем…
    </div>
  );
}
