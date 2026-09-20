import { revalidatePath } from "next/cache";

import { pingIndexNow } from "./indexnow";
import { absoluteUrl } from "./seo";

/**
 * Пересборка страниц витрины после правки в админке.
 *
 * Страницы товаров и разделов кешируются готовым HTML — именно поэтому сайт
 * остался быстрым после отказа от статического экспорта. Обратная сторона:
 * сохранённый товар не появится на витрине сам, кеш нужно сбросить явно.
 *
 * Сбрасываем точечно, а не всё подряд: у страницы товара из четырёхсот
 * позиций нет причин пересобираться из-за правки соседней. Исключение —
 * настройки сайта: телефон и меню стоят в общем макете, поэтому там честно
 * сбрасывается всё.
 */

/** Адреса, которые зависят от каталога целиком. */
const SHARED = [
  "/", // блок «Выбирают чаще всего»
  "/catalog", // плитка разделов со счётчиками товаров
  "/podbor", // список марок, к которым что-то подходит
  "/sitemap.xml",
  "/variants.json", // прайс, по которому корзина сверяет цены
  "/search-index.json", // индекс поиска
  "/feed.xml", // фид для Google Merchant Center
  "/yml.xml", // фид для Яндекса, Onliner и Kufar
];

function revalidateAll(paths: Iterable<string>): void {
  for (const path of paths) revalidatePath(path);
}

/** Адреса разделов приходят с конечным слешем, здесь он лишний. */
function trim(path: string): string {
  return path.length > 1 ? path.replace(/\/$/, "") : path;
}

/**
 * Сообщить поисковикам об изменившихся страницах.
 *
 * Адреса берём канонические — со слешем на конце и полным доменом, ровно
 * такие, как стоят в canonical и в sitemap. Пути для revalidatePath для этого
 * не годятся: у них слеш срезан, и поисковик получил бы адрес, с которого
 * сайт отвечает редиректом.
 */
function announce(paths: string[]): void {
  pingIndexNow(paths.map((path) => absoluteUrl(path)));
}

/**
 * Товар создали, изменили или удалили.
 *
 * `previous` — адреса, по которым товар был доступен до правки. Если поменяли
 * slug или перенесли товар в другой раздел, старую страницу тоже надо
 * пересобрать, иначе она останется висеть с прежним содержимым.
 *
 * `carPaths` — страницы подбора, на которых товар стоит сейчас; в
 * `previous.carPaths` те, на которых он стоял до правки. Снятая привязка
 * задевает ровно те же страницы, что и поставленная, только с другой
 * стороны: товар должен с них пропасть.
 */
export function revalidateProduct(
  slug: string,
  categoryPaths: string[],
  previous?: { slug?: string; categoryPaths?: string[]; carPaths?: string[] },
  carPaths: string[] = [],
): void {
  const paths = new Set(SHARED);

  paths.add(`/product/${slug}`);
  for (const path of categoryPaths) paths.add(trim(path));
  for (const path of carPaths) paths.add(trim(path));

  if (previous?.slug && previous.slug !== slug) {
    paths.add(`/product/${previous.slug}`);
  }
  // Раздел у товара сменился: старая страница раздела и страница его
  // родителя тоже пересобираются — там поменялись состав и счётчик.
  for (const path of previous?.categoryPaths ?? []) paths.add(trim(path));
  for (const path of previous?.carPaths ?? []) paths.add(trim(path));

  revalidateAll(paths);

  // Поисковикам сообщаем только про сам товар, его разделы и машины:
  // главная и каталог меняются от каждой правки, и звать на них краулера
  // по десять раз в день — это шум, за который IndexNow перестаёт слушать.
  announce([`/product/${slug}/`, ...categoryPaths, ...carPaths]);
}

/**
 * Раздел создали, изменили или удалили.
 *
 * `paths` — адреса всего затронутого поддерева (categorySubtreePaths):
 * сам раздел, его родитель и его подразделы. Slug родителя входит в адрес
 * каждого подраздела, поэтому переименование задевает их все.
 */
export function revalidateCategory(
  paths: string[],
  previousPaths: string[] = [],
): void {
  const all = new Set(SHARED);
  for (const path of [...paths, ...previousPaths]) all.add(trim(path));

  // Название и порядок раздела стоят в меню, а оно в общем макете —
  // страницы товаров тоже надо пересобрать.
  revalidatePath("/product/[slug]", "page");
  revalidateAll(all);

  announce(paths);
}

/**
 * Настройки сайта: телефон, доставка, тексты страниц.
 *
 * Здесь сбрасываем всё под корневым макетом — телефон в шапке и подвале стоит
 * буквально на каждой странице, перечислять их поимённо бессмысленно.
 */
export function revalidateSite(): void {
  revalidatePath("/", "layout");
}

/** Фотографию заменили или удалили — она может стоять где угодно. */
export function revalidateImages(): void {
  revalidatePath("/", "layout");
}
