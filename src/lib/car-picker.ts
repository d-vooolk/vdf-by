import type { PickerMark, PickerMarkHead } from "@/components/CarPicker";

import { years } from "./car-types";
import { getCarTree } from "./cars";
import { pickUrl } from "./image-types";
import { getImage } from "./images";

export function pickerMarks(): PickerMarkHead[] {
  return getCarTree().map((mark) => ({
    s: mark.slug,
    n: mark.name,
    // Ссылку на логотип считаем здесь: манифест картинок серверный, в
    // браузер он целиком не уезжает.
    ...(mark.logo ? { l: pickUrl(getImage(mark.logo), 48) ?? undefined } : {}),
  }));
}

// Дерево для выбора машины уезжает в разметку главной, поэтому ключи
// короткие, а годы посчитаны здесь: считать их в браузере значило бы
// тащить туда же текущую дату и правила подписи.
export function pickerTree(): PickerMark[] {
  const currentYear = new Date().getFullYear();
  return getCarTree().map((mark) => ({
    s: mark.slug,
    n: mark.name,
    m: mark.models.map((model) => ({
      s: model.slug,
      n: model.name,
      g: model.generations.map((generation) => ({
        s: generation.slug,
        n: generation.name,
        y: years(generation, currentYear),
      })),
    })),
  }));
}
