const MARK_SPELLINGS: Record<string, string> = {
  audi: "Ауди",
  bmw: "БМВ",
  chevrolet: "Шевроле",
  ford: "Форд",
  honda: "Хонда",
  hyundai: "Хендай",
  jaguar: "Ягуар",
  kia: "Киа",
  "land-rover": "Ленд Ровер",
  lexus: "Лексус",
  mazda: "Мазда",
  "mercedes-benz": "Мерседес",
  mitsubishi: "Мицубиси",
  nissan: "Ниссан",
  opel: "Опель",
  peugeot: "Пежо",
  porsche: "Порше",
  renault: "Рено",
  skoda: "Шкода",
  subaru: "Субару",
  tesla: "Тесла",
  toyota: "Тойота",
  volkswagen: "Фольксваген",
  volvo: "Вольво",
};

export function markWithSpelling(mark: { slug: string; name: string }): string {
  const spelling = MARK_SPELLINGS[mark.slug];
  return spelling ? `${mark.name} (${spelling})` : mark.name;
}

interface GenerationCopy {
  lead: string;
  promise: string;
  buyInTitle: boolean;
}

const GENERATION_COPY: Record<string, GenerationCopy> = {
  "stekla-far": {
    lead: "новое стекло из поликарбоната с УФ-лаком вместо помутневшего, левое, правое или пара",
    promise: "Поможем сверить фару по фото до заказа. Доставка по Минску и Беларуси",
    buyInTitle: true,
  },
  svetovody: {
    lead: "замена пожелтевших световодов ДХО без покупки фары в сборе",
    promise: "Подберём по кузову и версии фары. Доставка по Минску и Беларуси",
    buyInTitle: true,
  },
};

const DEFAULT_GENERATION_COPY: GenerationCopy = {
  lead: "встают без доработок",
  promise: "Проверяем каждый комплект на стенде. Доставка по Минску и Беларуси",
  buyInTitle: false,
};

export function generationCopy(categorySlug: string): GenerationCopy {
  return GENERATION_COPY[categorySlug] ?? DEFAULT_GENERATION_COPY;
}
