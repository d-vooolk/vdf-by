import {
  articleImagePaths,
  articleProductSlugs,
  fillPlaceholders,
  imageLine,
  parseArticleBody,
  PRODUCT_PHOTO_LINE,
  type ProductPhotos,
} from "./article-body";
import type { ArticleData } from "./articles";
import { getProductBySlug } from "./catalog";
import { getImage } from "./images";
import { allProductImages } from "./variant";

const PHOTOS_PER_PRODUCT = 4;

export function productPhotos(slugs: string[]): ProductPhotos[] {
  return [...new Set(slugs)].flatMap((slug) => {
    const product = getProductBySlug(slug);
    if (!product) return [];
    const paths = allProductImages(product)
      .filter((path) => getImage(path))
      .slice(0, PHOTOS_PER_PRODUCT);
    return paths.length ? [{ slug, title: product.title, paths }] : [];
  });
}

function orderedProductSlugs(body: string): string[] {
  const carded = parseArticleBody(body).flatMap((block) => (block.type === "products" ? block.slugs : []));
  return [...new Set([...carded, ...articleProductSlugs(body)])];
}

export function expandProductPhotoLines(body: string): string {
  const used = new Set<string>();
  return body
    .split("\n")
    .map((line) => {
      const match = line.trim().match(PRODUCT_PHOTO_LINE);
      if (!match) return line;
      const [photos] = productPhotos([match[1].toLowerCase()]);
      const path = photos?.paths.find((candidate) => !used.has(candidate));
      if (!photos || !path) return "";
      used.add(path);
      return imageLine(path, photos.title);
    })
    .join("\n");
}

export function attachProductPhotos<
  T extends Pick<ArticleData, "body"> & Partial<Pick<ArticleData, "cover" | "images">>,
>(article: T): T {
  const photos = productPhotos(orderedProductSlugs(article.body));
  const filled = fillPlaceholders(expandProductPhotoLines(article.body), photos, "match");
  const inText = articleImagePaths(filled.body);
  const cover = article.cover ?? photos[0]?.paths[0];
  return {
    ...article,
    body: filled.body,
    cover,
    images: [...new Set([...(article.images ?? []), ...inText, ...(cover ? [cover] : [])])],
  };
}

export function coverOf(article: Pick<ArticleData, "body" | "cover">): string | undefined {
  if (article.cover && getImage(article.cover)) return article.cover;
  const inText = new Set(articleImagePaths(article.body));
  const photos = productPhotos(orderedProductSlugs(article.body)).flatMap((product) => product.paths);
  return photos.find((path) => !inText.has(path)) ?? photos[0];
}
