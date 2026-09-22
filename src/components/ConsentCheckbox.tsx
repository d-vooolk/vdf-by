import Link from "next/link";

export const PRIVACY_URL = "/privacy/";

interface ConsentCheckboxProps {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  error?: string;
}

export function ConsentCheckbox({ id, checked, onChange, error }: ConsentCheckboxProps) {
  return (
    <div>
      <label htmlFor={id} className="flex cursor-pointer items-start gap-2.5 text-xs leading-relaxed text-brand-500">
        <input
          id={id}
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-brand-200 text-brand-700 focus:ring-brand-600"
        />
        <span>
          Даю согласие на обработку моих персональных данных (имя, телефон,
          адрес, email) для оформления, подтверждения и доставки заказа на
          условиях{" "}
          <Link
            href={PRIVACY_URL}
            target="_blank"
            className="font-medium text-brand-700 underline hover:text-brand-900"
          >
            Политики обработки персональных данных
          </Link>
          <span className="text-red-600"> *</span>
        </span>
      </label>
      {error && (
        <p id={`${id}-error`} className="mt-1.5 text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
