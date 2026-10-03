"use client";

import { useId, useState } from "react";

import { AlertIcon } from "@/components/icons";

/**
 * Мелкие детали форм админки: секция, поле с подписью, список ошибок.
 *
 * Вынесены отдельно, потому что повторяются в четырёх формах — товара,
 * раздела, настроек и заказа. Без этого каждая обрастала бы своей вёрсткой
 * подписей, и подсказки под полями выглядели бы по-разному.
 */

export function Section({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="card p-4 sm:p-5">
      <h2 className="text-sm font-bold text-brand-900">{title}</h2>
      {note && <p className="mt-1 text-xs leading-relaxed text-brand-400">{note}</p>}
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

export function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="label">
        {label}
        {required && <span className="text-red-600"> *</span>}
      </span>
      {children}
      {hint && <span className="mt-1 block text-xs text-brand-400">{hint}</span>}
    </label>
  );
}

/**
 * Числовое поле, которое не держится за старое значение.
 *
 * Раньше во всех формах стоял `<input type="number" value={draft.price}>`. У
 * нового товара цена — ноль, поле показывало «0», курсор вставал после
 * нуля, и набранная сотня превращалась в 0100. Стереть ноль вручную тоже
 * не выходило: при пустом поле Number("") даёт 0, состояние снова
 * становилось нулём и ноль возвращался в поле сам.
 *
 * Поэтому набранное держится строкой и в число превращается только при
 * отправке наверх. Пустая строка — это `null`, а не ноль: «не заполнено» и
 * «ровно ноль» для цены и остатка значат разное, и решает, что с этим
 * делать, вызывающая форма.
 *
 * type="text" с inputMode="decimal": у number-поля своя беда — колёсико
 * мыши над ним молча меняет цену, а нечисловой ввод браузер отдаёт как
 * пустую строку, и понять, что человек набрал, уже нельзя.
 */
export function NumberInput({
  value,
  onChange,
  className = "field tnum",
  placeholder,
  integer = false,
  disabled = false,
}: {
  value: number | null | undefined;
  onChange: (value: number | null) => void;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
  /** Только целые — для количеств. Дробную часть отбрасываем. */
  integer?: boolean;
}) {
  const asText = (input: number | null | undefined) =>
    input === null || input === undefined ? "" : String(input);

  const [text, setText] = useState(() => asText(value));
  const [known, setKnown] = useState(value);

  // Значение могло поменяться снаружи: форма перезагрузилась после
  // сохранения или соседнее поле пересчитало цену. Правим состояние в
  // рендере, а не в эффекте — эффект дал бы лишний проход и моргание.
  if (value !== known) {
    setKnown(value);
    const shown = text.trim() === "" ? null : Number(text.trim().replace(",", "."));
    // Если снаружи пришло ровно то число, которое мы сами только что и
    // отправили, текст не трогаем: иначе набранное «10.» схлопнулось бы в
    // «10» прямо под пальцами.
    if (shown !== (value ?? null)) setText(asText(value));
  }

  const handle = (next: string) => {
    setText(next);
    const trimmed = next.trim().replace(",", ".");
    if (trimmed === "") {
      onChange(null);
      return;
    }
    const parsed = integer ? Number.parseInt(trimmed, 10) : Number(trimmed);
    if (Number.isFinite(parsed)) onChange(parsed);
  };

  return (
    <input
      type="text"
      inputMode={integer ? "numeric" : "decimal"}
      value={text}
      placeholder={placeholder}
      disabled={disabled}
      onChange={(event) => handle(event.target.value)}
      className={className}
    />
  );
}

/**
 * Адрес страницы (slug) с кнопкой «подставить из названия».
 *
 * Раньше поле после создания просто блокировалось: адрес уже в поиске,
 * менять его нельзя. На практике это упиралось в переименования — товар из
 * «Линз Hella» становился «Линзами Aozoom», а адрес оставался
 * /product/linzy-hella/ и начинал врать и покупателю, и поисковику.
 *
 * Теперь адрес менять можно, но только руками и по кнопке: автоматически,
 * следом за названием, нельзя ни в коем случае — правка одной буквы в
 * заголовке уводила бы страницу на новый адрес молча. А со старого адреса
 * ставится постоянная переадресация (см. src/lib/redirects.ts), поэтому
 * смена перестала быть необратимой потерей.
 */
export function SlugField({
  label,
  hint,
  value,
  /** Каким адрес был бы, если собрать его из текущего названия. */
  fromName,
  /** Адрес, под которым страница живёт сейчас. Пусто — она ещё не создана. */
  saved,
  /** Показать готовый адрес: (slug) => "/product/foo/". */
  preview,
  onChange,
}: {
  label: string;
  hint?: string;
  value: string;
  fromName: string;
  saved?: string;
  preview: (slug: string) => string;
  onChange: (value: string) => void;
}) {
  const creating = !saved;
  const stale = Boolean(fromName) && fromName !== value;
  const changed = Boolean(saved) && value !== saved;

  return (
    <div>
      <Field label={label} required hint={hint ?? preview(value || "…")}>
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="field"
        />
      </Field>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {stale && (
          <button
            type="button"
            onClick={() => onChange(fromName)}
            className="btn-secondary py-1.5 text-xs"
          >
            Собрать из названия: {fromName}
          </button>
        )}
        {changed && (
          <button
            type="button"
            onClick={() => onChange(saved!)}
            className="btn-ghost py-1.5 text-xs"
          >
            Вернуть прежний
          </button>
        )}
      </div>

      {changed && (
        <p className="mt-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">
          Адрес сменится: <span className="font-semibold">{preview(saved!)}</span>{" "}
          → <span className="font-semibold">{preview(value)}</span>. Со старого
          адреса встанет постоянная переадресация, так что ссылки из поиска, из
          закладок и с чужих сайтов продолжат работать. Но делать это без
          повода не стоит: каждая переадресация — лишний шаг между человеком и
          страницей.
        </p>
      )}

      {creating && (
        <p className="mt-2 text-xs text-brand-400">
          Подставляется из названия. Потом его лучше не трогать.
        </p>
      )}
    </div>
  );
}

/**
 * Поле с подсказкой из уже введённых значений — бренд товара.
 *
 * Не <select>: список брендов открытый, новый бренд заводится прямо в этом
 * поле, и выбирать «— другой —», чтобы потом набрать название, никто не станет.
 * И не <datalist>: браузеры показывают его каждый по-своему, а часть мобильных
 * не показывает вовсе.
 *
 * Набранное остаётся набранным: подсказка сама ничего не подставляет, пока по
 * ней не щёлкнули или не выбрали её с клавиатуры. Поэтому бренд, которого в
 * списке ещё нет, поле не мешает завести — он просто сохранится как введён.
 */
export function Suggest({
  value,
  onChange,
  options,
  placeholder,
  limit = 8,
}: {
  value: string;
  onChange: (value: string) => void;
  /** Уже встречавшиеся значения. Порядок сохраняется. */
  options: string[];
  placeholder?: string;
  /** Сколько подсказок показывать за раз. */
  limit?: number;
}) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  const query = value.trim().toLowerCase();
  // Вхождение, а не начало строки: «свет» должно находить и «Автосвет».
  const matches = (
    query
      ? options.filter((option) => option.toLowerCase().includes(query))
      : options
  ).slice(0, limit);

  // Единственная подсказка, совпадающая с набранным дословно, не добавляет
  // ничего — показывать её незачем.
  const nothingToAdd =
    matches.length === 1 && matches[0].toLowerCase() === query;
  const visible = open && matches.length > 0 && !nothingToAdd;

  const pick = (option: string) => {
    onChange(option);
    setOpen(false);
    setActive(-1);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      setOpen(false);
      return;
    }
    if (!visible) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setOpen(true);
        setActive(0);
      }
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((current) => (current + 1) % matches.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((current) => (current <= 0 ? matches.length - 1 : current - 1));
    } else if (event.key === "Enter" && active >= 0) {
      // Enter по выбранной подсказке — это выбор, а не отправка формы.
      event.preventDefault();
      pick(matches[active]);
    }
  };

  return (
    // span, а не div: всё это лежит внутри <label> из Field, а label по
    // стандарту держит только строчное содержимое.
    <span className="relative block">
      <input
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        className="field"
        // Поверх наших подсказок браузер показал бы ещё и свои — из того, что
        // когда-то вводили в поле с таким именем.
        autoComplete="off"
        role="combobox"
        aria-expanded={visible}
        aria-controls={visible ? listId : undefined}
        // Какой вариант сейчас подсвечен — иначе стрелки вверх-вниз двигают
        // подсветку молча, и голосовому доступу нечего произнести.
        aria-activedescendant={
          visible && active >= 0 ? `${listId}-${active}` : undefined
        }
        aria-autocomplete="list"
      />

      {visible && (
        <span
          id={listId}
          role="listbox"
          aria-label="Подсказки"
          className="absolute inset-x-0 top-full z-20 mt-1 block max-h-56 overflow-auto rounded-xl border border-brand-200 bg-white py-1 shadow-lg"
        >
          {matches.map((option, index) => (
            // span с role="option", а не <button>: во-первых, так и описан
            // список выбора в ARIA — кнопок внутри listbox быть не должно;
            // во-вторых, всё это лежит внутри <label> из Field, а в label
            // может быть только одно поле ввода. Кнопки делали его вторым, и
            // подпись «Бренд» перестала бы однозначно указывать на поле.
            <span
              key={option}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === active}
              // mousedown, а не click: click приходит уже после blur, а blur
              // закрывает список — щёлкать было бы не по чему. preventDefault
              // заодно оставляет курсор в поле.
              onMouseDown={(event) => {
                event.preventDefault();
                pick(option);
              }}
              onMouseEnter={() => setActive(index)}
              className={`block cursor-pointer px-3 py-2 text-left text-sm ${
                index === active
                  ? "bg-brand-50 text-brand-900"
                  : "text-brand-600"
              }`}
            >
              {option}
            </span>
          ))}
        </span>
      )}
    </span>
  );
}

/** Ошибки, вернувшиеся с сервера. Пустой список ничего не рисует. */
export function Problems({ items }: { items: string[] }) {
  if (!items.length) return null;

  return (
    <div
      className="rounded-card border border-red-300 bg-red-50 p-4"
      role="alert"
    >
      <p className="flex items-center gap-2 text-sm font-semibold text-red-900">
        <AlertIcon className="h-4 w-4" />
        Не сохранилось
      </p>
      <ul className="mt-2 space-y-1 text-sm text-red-800">
        {items.map((problem) => (
          <li key={problem}>• {problem}</li>
        ))}
      </ul>
    </div>
  );
}
