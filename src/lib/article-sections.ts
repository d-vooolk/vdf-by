export const ARTICLE_SECTIONS = [
  {
    id: "stekla-far",
    label: "Стёкла фар",
    intro: "Как выбрать стекло фары под своё поколение, чем отличаются оригинал и китайские стёкла, как заменить стекло самому и что делать, если фара запотела.",
    catalog: { href: "/catalog/stekla-far/", label: "Стёкла фар в каталоге" },
  },
  {
    id: "svetovody",
    label: "Световоды",
    intro: "Почему желтеют и перестают светить световоды дневных ходовых огней, как их меняют и сколько это стоит.",
    catalog: { href: "/catalog/svetovody/", label: "Световоды в каталоге" },
  },
  {
    id: "linzy-i-ramki",
    label: "Би-LED линзы и переходные рамки",
    intro: "Чем би-LED отличается от биксенона, как выбрать модуль, какая переходная рамка нужна под вашу фару и что ещё понадобится для установки линз.",
    catalog: { href: "/catalog/bi-led-moduli/", label: "Би-LED модули в каталоге" },
  },
  {
    id: "remont-far",
    label: "Разборка, сборка и ремонт фар",
    intro: "Чем склеить фару после разборки, чем вскрыть шов на полиуретане и когда корпус фары выгоднее отремонтировать, а когда заменить.",
    catalog: { href: "/catalog/tovary-dlya-ustanovki/", label: "Товары для установки и ремонта" },
  },
  {
    id: "svetodiodnye-lampy",
    label: "Светодиодные лампы",
    intro: "Когда светодиодные лампы действительно улучшают свет, а когда слепят встречных, и можно ли ставить их в рефлекторные фары.",
    catalog: { href: "/catalog/svetodiodnye-lampy/", label: "Светодиодные лампы в каталоге" },
  },
] as const;

export type ArticleSectionId = (typeof ARTICLE_SECTIONS)[number]["id"];
export type ArticleSection = (typeof ARTICLE_SECTIONS)[number];

export const ARTICLE_SECTION_IDS = ARTICLE_SECTIONS.map((section) => section.id) as [
  ArticleSectionId,
  ...ArticleSectionId[],
];

export function articleSection(id: string | undefined): ArticleSection | undefined {
  return ARTICLE_SECTIONS.find((section) => section.id === id);
}
