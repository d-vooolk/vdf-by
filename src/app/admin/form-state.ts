import { type SaveResult } from "@/lib/store";

/**
 * Действия админки.
 *
 * Каждое начинается с requireAdmin(). Это не перестраховка: Server Actions —
 * обычные POST-адреса, до них можно достучаться в обход интерфейса, а
 * проверка в proxy.ts смотрит только на наличие куки. Настоящая проверка
 * сессии — здесь.
 *
 * Данные приходят готовыми объектами, а не FormData: у товара внутри опции с
 * вложенными значениями и галереями, и раскладывать такое по полям формы
 * значило бы собирать его обратно вручную с обеих сторон. Проверяет объекты
 * всё равно zod в src/lib/store.ts, так что доверия входным данным не больше,
 * чем при FormData.
 */

export interface FormState {
  ok: boolean;
  problems: string[];
  /** Отметка времени: по ней интерфейс понимает, что ответ новый. */
  at: number;
}

export const ok = (): FormState => ({ ok: true, problems: [], at: Date.now() });

export const fail = (problems: string[]): FormState => ({
  ok: false,
  problems,
  at: Date.now(),
});

export function toState(result: SaveResult): FormState {
  return result.ok ? ok() : fail(result.problems);
}
