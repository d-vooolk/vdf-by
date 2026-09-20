import { z } from "zod";

/**
 * Схемы для файлов в ./data. Они же — единственный источник правды о формате.
 *
 * Схемы строгие: неизвестное поле = ошибка сборки. Это специально. Опечатка
 * вида "prise" вместо "price" иначе молча превратилась бы в товар без цены.
 * Поле "_comment" разрешено везде — можно оставлять себе пометки в JSON.
 */

const slug = z
  .string()
  .min(1)
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "slug: только латиница в нижнем регистре, цифры и дефис (например «osram-night-breaker-200»)",
  );

const id = z
  .string()
  .min(1)
  .regex(/^[a-z0-9-]+$/, "id: только латиница в нижнем регистре, цифры и дефис");

const imagePath = z
  .string()
  .min(1)
  .regex(
    /^[a-zA-Z0-9._/-]+\.(jpg|jpeg|png|webp|avif)$/i,
    "путь к фото: относительно папки ./media, например «lamps/osram/h7-1.jpg»",
  );

const money = z
  .number()
  .nonnegative("цена не может быть отрицательной")
  .finite();

/** Пара «характеристика — значение» в таблице на странице товара. */
export const specSchema = z.strictObject({
  name: z.string().min(1),
  value: z.string().min(1),
});

/**
 * Значение опции: конкретный цоколь, сторона, цветовая температура.
 *
 * images — своя галерея для этого значения. Если её нет, показываются
 * общие фото товара (product.images).
 * price — абсолютная цена, перебивает цену товара.
 * priceDelta — надбавка, складывается со всеми остальными надбавками.
 */
export const optionValueSchema = z.strictObject({
  _comment: z.string().optional(),
  id,
  label: z.string().min(1),
  price: money.optional(),
  oldPrice: money.optional(),
  priceDelta: z.number().finite().optional(),
  sku: z.string().optional(),
  inStock: z.boolean().optional(),
  images: z.array(imagePath).optional(),
});

/** Набор опций: «Цоколь», «Сторона», «Цветовая температура». */
export const optionGroupSchema = z.strictObject({
  _comment: z.string().optional(),
  id,
  name: z.string().min(1),
  hint: z.string().optional(),
  values: z
    .array(optionValueSchema)
    .min(1, "в наборе опций должно быть хотя бы одно значение"),
});

export const productSchema = z.strictObject({
  _comment: z.string().optional(),
  id,
  slug,
  categoryId: id,
  title: z.string().min(1),
  brand: z.string().optional(),
  price: money,
  oldPrice: money.nullable().optional(),
  inStock: z.boolean().default(true),
  /**
   * Складской остаток. Виден только в админке: покупателю показывать нечего
   * — «осталось 2 шт.» на витрине живёт своей жизнью и врёт при первом же
   * заказе по телефону. Здесь это внутренний учёт, не более.
   *
   * null — учёт по этому товару не ведётся (не то же самое, что ноль).
   */
  stockQty: z.number().int().nonnegative().nullable().optional(),
  badge: z.string().optional(),
  featured: z.boolean().optional(),
  unit: z.string().optional(),
  sku: z.string().optional(),
  images: z.array(imagePath).default([]),
  excerpt: z.string().optional(),
  description: z.string().optional(),
  specs: z.array(specSchema).default([]),
  optionGroups: z.array(optionGroupSchema).default([]),
  tags: z.array(z.string()).default([]),
  seoTitle: z.string().optional(),
  seoDescription: z.string().optional(),
});

export const categorySchema = z.strictObject({
  _comment: z.string().optional(),
  id,
  slug,
  /**
   * Родительский раздел. Пусто — раздел верхнего уровня.
   *
   * Уровня ровно два: у подраздела своих подразделов быть не может. Это не
   * упрощение ради кода, а решение про витрину — «Главная › Каталог ›
   * Аксессуары › Маски › ...» в крошки уже не помещается, а меню на третьем
   * уровне перестаёт открываться пальцем. Проверяет это store.ts.
   */
  parentId: id.optional(),
  name: z.string().min(1),
  menuName: z.string().optional(),
  order: z.number().int().optional(),
  excerpt: z.string().optional(),
  description: z.string().optional(),
  seoTitle: z.string().optional(),
  seoDescription: z.string().optional(),
  image: imagePath.optional(),
});

const deliveryMethodSchema = z.strictObject({
  id: z.string().min(1),
  name: z.string().min(1),
  price: money,
  freeFrom: money.nullable().optional(),
  requiresAddress: z.boolean(),
  note: z.string().optional(),
  /**
   * Срок доставки в рабочих днях — от и до.
   *
   * Нужен разметке OfferShippingDetails: по ней Google считает дату «получите
   * к …» и показывает её в выдаче рядом с ценой. Без сроков разметка доставки
   * остаётся, но такой строки в сниппете не будет.
   */
  daysMin: z.number().int().nonnegative().optional(),
  daysMax: z.number().int().nonnegative().optional(),
});

export const siteSchema = z.strictObject({
  name: z.string().min(1),
  legalName: z.string().min(1),
  tagline: z.string().min(1),
  description: z.string().min(1),
  url: z.string().url("url сайта должен быть полным, вида https://vdf.by"),
  locale: z.string().min(1),
  currency: z.string().min(1),
  currencySymbol: z.string().min(1),
  phone: z.string().min(1),
  phoneHref: z.string().min(1),
  email: z.string().email(),
  telegram: z.string().default(""),
  viber: z.string().default(""),
  whatsapp: z.string().default(""),
  instagram: z.string().default(""),
  address: z.strictObject({
    street: z.string(),
    city: z.string(),
    region: z.string(),
    postalCode: z.string(),
    country: z.string(),
  }),
  geo: z.strictObject({ lat: z.number(), lng: z.number() }),
  workHours: z.string(),
  workHoursSchema: z.array(z.string()).default([]),
  orderEndpoint: z.string().min(1),
  delivery: z.strictObject({
    methods: z.array(deliveryMethodSchema).min(1),
  }),
  payment: z.array(z.string()).default([]),
  warranty: z.string().default(""),
  /**
   * Сколько дней на возврат товара. 0 — не заявляем, и тогда разметки
   * возврата на страницах товаров не будет.
   *
   * Число попадает в MerchantReturnPolicy, поэтому оно обязано совпадать с
   * тем, что написано на странице доставки: расхождение разметки и текста —
   * это ручные санкции, а не просто неточность.
   */
  returnDays: z.number().int().nonnegative().default(0),
  features: z
    .array(
      z.strictObject({ title: z.string().min(1), text: z.string().min(1) }),
    )
    .default([]),
});

export type Spec = z.infer<typeof specSchema>;
export type OptionValue = z.infer<typeof optionValueSchema>;
export type OptionGroup = z.infer<typeof optionGroupSchema>;
export type Product = z.infer<typeof productSchema>;
export type Category = z.infer<typeof categorySchema>;
export type Site = z.infer<typeof siteSchema>;
export type DeliveryMethod = z.infer<typeof deliveryMethodSchema>;

/**
 * Разбирает данные и при ошибке падает с сообщением, по которому понятно,
 * какой файл и какое поле править. Без этого zod выдаёт стену текста.
 */
export function parseOrThrow<T extends z.ZodType>(
  schema: T,
  data: unknown,
  file: string,
): z.output<T> {
  const result = schema.safeParse(data);
  if (result.success) return result.data;

  const lines = result.error.issues.map((issue) => {
    const path = issue.path.length ? issue.path.join(" → ") : "(корень файла)";
    return `  • ${path}: ${issue.message}`;
  });

  throw new Error(
    `\n\nОшибка в файле данных: ${file}\n${lines.join("\n")}\n\n` +
      `Формат описан в data/SCHEMA.md\n`,
  );
}
