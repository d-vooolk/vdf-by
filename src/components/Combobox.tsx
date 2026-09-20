"use client";

import { useId, useState } from "react";

/**
 * Поле с автодополнением: можно выбрать из списка, можно набрать руками.
 *
 * Обычный `<select>` здесь не годится. Марок в подборе десятки, моделей у
 * одной марки под сотню, и листать их колесом — не выбор, а поиск вслепую.
 * К тому же в `<select>` нельзя положить иконку, а марку глазами находят
 * именно по значку.
 *
 * Название поля стоит подсказкой внутри, отдельной подписи сверху нет: три
 * поля в строку с подписями занимают вдвое больше высоты, а «Марка» в пустом
 * поле понятно и без неё. Для скринридера подпись всё равно есть — в
 * aria-label.
 */

export interface ComboOption {
  value: string;
  label: string;
  /** Приписка справа серым: годы выпуска, число товаров. */
  hint?: string;
  /** Ссылка на иконку — логотип марки. */
  icon?: string;
}

interface ComboboxProps {
  value: string;
  onChange: (value: string) => void;
  options: ComboOption[];
  placeholder: string;
  disabled?: boolean;
  /** Показывается, когда под набранное ничего не подошло. */
  emptyText?: string;
  className?: string;
}

const LIMIT = 60;

export function Combobox({
  value,
  onChange,
  options,
  placeholder,
  disabled = false,
  emptyText = "Ничего не нашлось",
  className = "",
}: ComboboxProps) {
  const listId = useId();
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);

  const selected = options.find((option) => option.value === value);
  const needle = text.trim().toLowerCase();

  // Пока поле не трогали, в нём стоит выбранное значение; как только начали
  // набирать — набранное. Иначе после выбора «Golf» нельзя было бы стереть
  // текст и поискать заново.
  const shown = open ? text : (selected?.label ?? "");

  const matches = (needle
    ? options.filter((option) => option.label.toLowerCase().includes(needle))
    : options
  ).slice(0, LIMIT);

  const choose = (option: ComboOption) => {
    onChange(option.value);
    setText("");
    setOpen(false);
  };

  return (
    <div className={`relative ${className}`}>
      <input
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-label={placeholder}
        autoComplete="off"
        value={shown}
        placeholder={placeholder}
        disabled={disabled}
        onFocus={() => {
          setText("");
          setOpen(true);
        }}
        // Закрытие с задержкой: щелчок по пункту списка сначала снимает
        // фокус с поля, и без неё список исчезал бы раньше, чем срабатывал
        // выбор.
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        onChange={(event) => {
          setText(event.target.value);
          setOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setOpen(false);
            event.currentTarget.blur();
          }
          if (event.key === "Enter" && open && matches.length > 0) {
            event.preventDefault();
            choose(matches[0]);
            event.currentTarget.blur();
          }
        }}
        className="field pr-8 disabled:bg-brand-50 disabled:text-brand-400"
      />

      {selected && !disabled && (
        <button
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            onChange("");
            setText("");
          }}
          aria-label={`Очистить: ${placeholder}`}
          className="absolute inset-y-0 right-0 flex w-8 items-center justify-center text-brand-300 hover:text-brand-700"
        >
          ×
        </button>
      )}

      {open && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-40 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border border-brand-200 bg-white py-1 shadow-card-hover"
        >
          {matches.length === 0 ? (
            <li className="px-3 py-2 text-sm text-brand-400">{emptyText}</li>
          ) : (
            matches.map((option) => (
              <li key={option.value}>
                <button
                  type="button"
                  role="option"
                  aria-selected={option.value === value}
                  // Выбор по mousedown, а не по click: click приходит уже
                  // после blur, и до него дело не доходило бы.
                  onMouseDown={(event) => {
                    event.preventDefault();
                    choose(option);
                  }}
                  className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-brand-50 ${
                    option.value === value
                      ? "font-semibold text-brand-900"
                      : "text-brand-700"
                  }`}
                >
                  {option.icon && (
                    // Обычный img: иконка одного размера, srcset тут не нужен.
                    <img
                      src={option.icon}
                      alt=""
                      width={20}
                      height={20}
                      loading="lazy"
                      className="h-5 w-5 shrink-0 object-contain"
                    />
                  )}
                  <span className="min-w-0 flex-1 truncate">{option.label}</span>
                  {option.hint && (
                    <span className="shrink-0 text-xs text-brand-400">
                      {option.hint}
                    </span>
                  )}
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
