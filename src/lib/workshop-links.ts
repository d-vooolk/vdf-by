import { categoryTrail } from "./catalog";
import type { Category } from "./schema";

export interface WorkshopLink {
  href: string;
  anchor: string;
}

const WORKSHOP_SERVICES = "https://prime-auto.by/uslugi";

export const WORKSHOP_LINKS = {
  glass: {
    href: `${WORKSHOP_SERVICES}/remont-far/zamena-stekla-fary`,
    anchor: "Замена стекла фары в Минске — Prime Auto",
  },
  biled: {
    href: `${WORKSHOP_SERVICES}/uluchshenie-kachestva-sveta/ustanovka-biled-moduley-minsk`,
    anchor: "Установка Bi-Led модулей в Минске",
  },
  lamps: {
    href: `${WORKSHOP_SERVICES}/tehnicheskoye-obsluzhivaniye-far`,
    anchor: "Замена ламп и блоков розжига в Минске",
  },
  retrofit: {
    href: `${WORKSHOP_SERVICES}/uluchshenie-kachestva-sveta`,
    anchor: "Ретрофит фар в Минске",
  },
  general: {
    href: WORKSHOP_SERVICES,
    anchor: "Мастерская автосвета в Минске",
  },
} as const satisfies Record<string, WorkshopLink>;

type WorkshopKind = keyof typeof WORKSHOP_LINKS;

const KIND_BY_CATEGORY_SLUG: Record<string, WorkshopKind | null> = {
  "stekla-far": "glass",

  "bi-led-moduli": "biled",
  linzy: "biled",
  "perehodnye-ramki": "biled",

  "svetodiodnye-lampy": "lamps",
  lampy: "lamps",
  "bloki-rozzhiga": "lamps",
  "bloki-upravleniya": "lamps",
  obmanki: "lamps",
  "korrektora-napravlyayuschie": "lamps",

  "maski-dlya-linz": "retrofit",
  "dnevnye-hodovye-ogni": "retrofit",
  svetovody: "retrofit",

  "korpusa-far": "general",
  "pylniki-dlya-far": "general",
  "ventilyaciya-i-drenazhi": "general",

  "tovary-dlya-ustanovki": null,
};

const KIND_BY_KEYWORD: [RegExp, WorkshopKind][] = [
  [/стекл/i, "glass"],
  [/bi-?led|би-?л[еэ]д|линз|модул|рамк/i, "biled"],
  [/ламп|розжиг|ксенон|балласт|корректор|обманк/i, "lamps"],
  [/маск|дхо|ходов|световод|ретрофит/i, "retrofit"],
  [/фар/i, "general"],
];

function kindBySlug(category: Category): WorkshopKind | null | undefined {
  for (const entry of categoryTrail(category).reverse()) {
    if (entry.slug in KIND_BY_CATEGORY_SLUG) return KIND_BY_CATEGORY_SLUG[entry.slug];
  }
  return undefined;
}

function kindByKeyword(text: string): WorkshopKind | null {
  return KIND_BY_KEYWORD.find(([pattern]) => pattern.test(text))?.[1] ?? null;
}

export function workshopLinkFor(category: Category | undefined, title = ""): WorkshopLink | null {
  const bySlug = category ? kindBySlug(category) : undefined;
  const kind =
    bySlug !== undefined
      ? bySlug
      : kindByKeyword([...(category ? categoryTrail(category).map((entry) => entry.name) : []), title].join(" "));
  return kind ? WORKSHOP_LINKS[kind] : null;
}
