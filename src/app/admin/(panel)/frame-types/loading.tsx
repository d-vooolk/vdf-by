import { SpinnerIcon } from "@/components/icons";

export default function FrameTypesLoading() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-[100] flex cursor-wait items-center justify-center bg-black/35 backdrop-blur-[2px]"
    >
      <span className="flex items-center gap-3 rounded-2xl bg-white px-5 py-3 text-sm font-medium text-brand-800 shadow-pop">
        <SpinnerIcon className="h-5 w-5 animate-spin" />
        Загружаем типы рамок…
      </span>
    </div>
  );
}
