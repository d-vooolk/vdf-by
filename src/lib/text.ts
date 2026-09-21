/**
 * Чистка текста, пришедшего из форм.
 *
 * Пробел или перенос строки в начале и в конце поля не виден ни в админке, ни
 * на витрине, но живёт в данных и потом вылезает: «Osram » и «Osram»
 * становятся двумя разными брендами в фильтре каталога, лишняя пустая строка
 * в описании превращается в пустой абзац, а пробел перед названием сдвигает
 * заголовок страницы.
 *
 * Поэтому текст чистится не в каждом поле по отдельности, а один раз для всего
 * объекта — перед проверкой схемой в src/lib/store.ts. Так под чистку попадают
 * и вложенные значения опций, которые иначе пришлось бы перебирать руками.
 */

/**
 * Обрезает пробелы и переносы строк по краям у всех строк внутри значения.
 * Внутренние переносы не трогаются: пустая строка в описании — это абзац.
 */
export function deepTrim<T>(value: T): T {
  if (typeof value === "string") return value.trim() as T;
  if (Array.isArray(value)) return value.map(deepTrim) as T;
  // Только обычные объекты: Date, Map и прочее сюда не приходит, а разбирать
  // их по ключам значило бы их испортить.
  if (value !== null && typeof value === "object" && isPlainObject(value)) {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      result[key] = deepTrim(item);
    }
    return result as T;
  }
  return value;
}

export function firstParagraph(text: string | undefined): string {
  return (text ?? "").split(/\n\s*\n/)[0]?.trim() ?? "";
}

function isPlainObject(value: object): boolean {
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}
