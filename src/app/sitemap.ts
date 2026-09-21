import type { MetadataRoute } from "next";

import {
  CARS_ROOT,
  carsRoot,
  generationUrl,
  markUrl,
  modelUrl,
  type FitMark,
} from "@/lib/car-types";
import { fitmentCategories, getCarPageDates, getCarTree } from "@/lib/cars";
import {
  categoryUrl,
  getCategories,
  getLastModified,
  getPageDates,
  getProducts,
  getSiteModified,
} from "@/lib/catalog";
import { getImage } from "@/lib/images";
import type { Category, Product } from "@/lib/schema";
import { absoluteUrl, bigImageUrl } from "@/lib/seo";
import { allProductImages } from "@/lib/variant";

/**
 * sitemap.xml. Собирается один раз и пересобирается вместе со страницами
 * каталога, когда в админке что-то сохранили (см. src/lib/revalidate.ts).
 *
 * Страницы корзины и подтверждения заказа сюда не попадают: индексировать в
 * них нечего (см. robots.ts).
 *
 * Даты правки — настоящие, из базы. Время сборки не подставляется никуда:
 * lastmod, который меняется от каждого деплоя, поисковик перестаёт учитывать
 * вместе с честными датами товаров.
 *
 * У страниц товаров и разделов перечислены фотографии — это картиночный
 * sitemap: по нему фото попадают в поиск по картинкам, откуда в магазин
 * автосвета приходят живые люди («стекло фары гольф 7» ищут глазами).
 *
 * Страницы подбора по автомобилю берутся из живых привязок товаров: если к
 * машине ничего не привязано, страницы под неё нет и в карте её быть не
 * должно. Пустых адресов в sitemap поисковик не прощает — он перестаёт
 * доверять карте целиком.
 */

export const dynamic = "force-static";

/** Фотографии страницы — крупными версиями, как их хочет поиск. */
function imagesFor(paths: string[]): string[] {
  return paths
    .map((path) => bigImageUrl(getImage(path)))
    .filter((url): url is string => Boolean(url))
    .map((url) => absoluteUrl(url));
}

export default function sitemap(): MetadataRoute.Sitemap {
  // Дата правки у каждой страницы своя — она лежит в базе рядом с товаром.
  const dates = getPageDates();
  const modified = getLastModified();
  // Страницы, собранные из настроек магазина, меняются вместе с ними.
  const settings = getSiteModified();

  // Даты страниц подбора считаются отдельно: они собраны не из своей
  // записи в базе, а из товаров, которые к машине привязаны.
  const carDates = getCarPageDates();
  const dateFor = (url: string) =>
    dates.get(url) ?? carDates.get(url) ?? modified;

  const categoryEntry = (category: Category) => {
    const url = categoryUrl(category);
    const images = imagesFor(category.image ? [category.image] : []);
    return {
      url: absoluteUrl(url),
      lastModified: dateFor(url),
      changeFrequency: "weekly" as const,
      // Приоритет у подразделов ниже: они уже, и трафик по ним реже.
      priority: category.parentId ? 0.8 : 0.9,
      ...(images.length ? { images } : {}),
    };
  };

  const productEntry = (product: Product) => {
    const url = `/product/${product.slug}/`;
    const images = imagesFor(allProductImages(product));
    return {
      url: absoluteUrl(url),
      lastModified: dateFor(url),
      changeFrequency: "weekly" as const,
      priority: 0.8,
      ...(images.length ? { images } : {}),
    };
  };

  const cars = getCarTree();

  const carEntries = (tree: FitMark[], base: string) =>
    tree.flatMap((mark) => {
      const markEntry = {
        url: absoluteUrl(markUrl(mark.slug, base)),
        lastModified: dateFor(markUrl(mark.slug, base)),
        changeFrequency: "weekly" as const,
        priority: 0.7,
      };

      const inner = mark.models.flatMap((model) => {
        const modelPath = modelUrl(mark.slug, model.slug, base);
        const photos = imagesFor(
          model.generations
            .map((generation) => generation.photo)
            .filter(Boolean),
        );

        return [
          {
            url: absoluteUrl(modelPath),
            lastModified: dateFor(modelPath),
            changeFrequency: "weekly" as const,
            priority: 0.7,
            ...(photos.length ? { images: photos } : {}),
          },
          ...model.generations.map((generation) => {
            const url = generationUrl(
              mark.slug,
              model.slug,
              generation.slug,
              base,
            );
            return {
              url: absoluteUrl(url),
              lastModified: dateFor(url),
              changeFrequency: "weekly" as const,
              // Страница поколения — конец воронки подбора и самая точная
              // страница под запрос вида «стекло фары гольф 7».
              priority: 0.8,
            };
          }),
        ];
      });

      return [markEntry, ...inner];
    });

  const podborEntries = carEntries(cars, CARS_ROOT);

  const branchEntries = fitmentCategories().flatMap((category) =>
    carEntries(getCarTree(category.id), carsRoot(category.slug)),
  );

  return [
    {
      url: absoluteUrl("/"),
      // Главная показывает и товары, и тексты из настроек — берём то из
      // двух событий, которое случилось позже.
      lastModified: new Date(
        Math.max(modified.getTime(), settings.getTime()),
      ),
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: absoluteUrl("/catalog/"),
      lastModified: modified,
      changeFrequency: "weekly",
      priority: 0.9,
    },
    // Адрес подраздела вложенный, поэтому его собирает categoryUrl.
    ...getCategories().map(categoryEntry),
    ...getProducts().map(productEntry),
    // Корень подбора попадает в карту, только когда в нём есть хоть одна
    // марка: пустая страница в sitemap — это заявка на «страница-пустышка».
    ...(cars.length
      ? [
          {
            url: absoluteUrl("/podbor/"),
            lastModified: modified,
            changeFrequency: "weekly" as const,
            priority: 0.8,
          },
        ]
      : []),
    ...podborEntries,
    ...branchEntries,
    {
      url: absoluteUrl("/delivery/"),
      lastModified: settings,
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: absoluteUrl("/contacts/"),
      lastModified: settings,
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: absoluteUrl("/about/"),
      lastModified: settings,
      changeFrequency: "monthly",
      priority: 0.4,
    },
  ];
}
