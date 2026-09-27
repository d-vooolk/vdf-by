import { articleUrl, getPublishedArticles } from "@/lib/articles";
import { getCarTree } from "@/lib/cars";
import {
  categoryUrl,
  getCategories,
  getCategoryCounts,
  getProducts,
  getSite,
} from "@/lib/catalog";
import { formatPrice, pluralize } from "@/lib/format";
import { absoluteUrl } from "@/lib/seo";
import { hasAnyInStock } from "@/lib/variant";

export const dynamic = "force-static";

function oneLine(text: string | undefined, limit = 220): string {
  const clean = (text ?? "").replace(/\s+/g, " ").trim();
  return clean.length > limit ? `${clean.slice(0, limit).replace(/\s+\S*$/, "")}…` : clean;
}

export function GET() {
  const site = getSite();
  const categories = getCategories();
  const counts = getCategoryCounts();
  const products = getProducts();
  const available = products.filter(hasAnyInStock).length;
  const articles = getPublishedArticles();
  const link = (path: string) => absoluteUrl(path);

  const lines = [
    `# ${site.name}`,
    "",
    `> ${oneLine(site.description, 400)}`,
    "",
    `${site.legalName && site.legalName !== site.name ? `${site.name} (${site.legalName})` : site.name} — интернет-магазин автомобильного света в Беларуси: би-LED и би-ксеноновые линзы, стёкла фар, лампы всех цоколей, блоки розжига и комплектующие. Склад и самовывоз в городе ${site.address.city}, доставка по всей Беларуси.`,
    "",
    "## Факты о магазине",
    "",
    `- Адрес: ${[site.address.city, site.address.street].filter(Boolean).join(", ")}`,
    `- Телефон: ${site.phone}`,
    `- Email: ${site.email}`,
    `- Часы работы: ${site.workHours}`,
    `- В каталоге ${pluralize(products.length, "товар", "товара", "товаров")}${available ? `, ${available} в наличии` : ""}`,
    "- Линзы и блоки розжига проверяются на стенде перед отправкой",
    "- Совместимость с автомобилем менеджер подтверждает до отправки, оплата при получении",
    ...(site.warranty ? [`- Гарантия: ${site.warranty}`] : []),
    ...(site.returnDays ? [`- Возврат в течение ${site.returnDays} дней`] : []),
    ...(site.payment.length ? [`- Оплата: ${site.payment.join(", ")}`] : []),
    `- Доставка: ${site.delivery.methods
      .map((method) => `${method.name} — ${method.price ? formatPrice(method.price, site.currencySymbol) : "бесплатно"}`)
      .join("; ")}`,
    "",
    "## Каталог",
    "",
    ...categories
      .filter((category) => (counts[category.id] ?? 0) > 0)
      .map((category) => {
        const about = oneLine(category.excerpt || category.seoDescription);
        return `- [${category.name}](${link(categoryUrl(category))}): ${pluralize(counts[category.id], "товар", "товара", "товаров")}${about ? `. ${about}` : ""}`;
      }),
    "",
  ];

  if (getCarTree().length) {
    lines.push(
      "## Подбор по автомобилю",
      "",
      `- [Подбор автосвета по марке и модели](${link("/podbor/")}): линзы, стёкла фар и лампы, которые подходят к конкретному поколению автомобиля`,
      "",
    );
  }

  if (articles.length) {
    lines.push(
      "## Статьи",
      "",
      ...articles.map((article) => `- [${article.title}](${link(articleUrl(article))})${article.excerpt ? `: ${oneLine(article.excerpt)}` : ""}`),
      "",
    );
  }

  lines.push(
    "## Информация",
    "",
    `- [Доставка и оплата](${link("/delivery/")})`,
    `- [О магазине](${link("/about/")})`,
    `- [Контакты](${link("/contacts/")})`,
    `- [Карта сайта](${link("/sitemap.xml")})`,
    "",
  );

  return new Response(lines.join("\n"), {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=3600",
    },
  });
}
