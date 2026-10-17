import type { Metadata } from "next";
import Link from "next/link";

import { Breadcrumbs } from "@/components/Breadcrumbs";
import {
  categoryUrl,
  getProducts,
  getRootCategories,
  getSite,
} from "@/lib/catalog";
import { DISCLAIMER_FULL } from "@/lib/disclaimer";
import { pluralize } from "@/lib/format";
import { buildMetadata } from "@/lib/seo";

export function generateMetadata(): Metadata {
  const site = getSite();
  return buildMetadata({
    title: "О магазине",
    description: `${site.name} — магазин автосвета в Минске. Проверяем линзы и блоки розжига на стенде перед отправкой, помогаем подобрать комплект под модель авто.`,
    path: "/about/",
  });
}

export default function AboutPage() {
  const site = getSite();
  const categories = getRootCategories();
  const products = getProducts();

  return (
    <div className="container-page">
      <Breadcrumbs items={[{ label: "О магазине" }]} />

      <div className="max-w-3xl">
        <h1 className="text-3xl font-semibold text-brand-900 sm:text-4xl">
          О магазине
        </h1>

        <div className="prose-shop mt-6">
          <p>
            {site.name} занимается деталями автомобильного освещения:
            би-ЛЕД и би-ксеноновыми линзами, стёклами передних фар, лампами всех
            популярных цоколей, блоками розжига и мелочью для установки. Сейчас
            в каталоге{" "}
            {pluralize(products.length, "позиция", "позиции", "позиций")} в{" "}
            {pluralize(categories.length, "разделе", "разделах", "разделах")}.
          </p>

          <p className="mt-4 rounded-card border-l-4 border-accent-400 bg-brand-50 px-4 py-3 text-sm">
            {DISCLAIMER_FULL}
          </p>

          <h2 className="mt-8 mb-3 text-xl font-semibold text-brand-900">
            Почему проверяем перед отправкой
          </h2>
          <p>
            В автосвете брак встречается чаще, чем хотелось бы: линза может
            приехать с кривой светотеневой границей, блок розжига — не выйти на
            рабочий режим, а «5000K» на упаковке лампы обернуться синевой в
            7000K. Поэтому каждую линзу и каждый блок мы включаем на стенде и
            смотрим границу, яркость и цвет. Товар с отклонением до клиента не
            уезжает.
          </p>

          <h2 className="mt-8 mb-3 text-xl font-semibold text-brand-900">
            Почему нет онлайн-оплаты
          </h2>
          <p>
            Это осознанное решение, а не недоделка. Автосвет — товар, где
            совместимость решает всё: под одну и ту же модель авто в разных
            комплектациях идут разные фары. Пока менеджер не уточнил модель и
            год, отправлять товар рискованно. Поэтому схема простая: вы
            оставляете заявку, мы перезваниваемся, подтверждаем совместимость и
            наличие — и только потом отправляем. Оплата при получении.
          </p>

          <h2 className="mt-8 mb-3 text-xl font-semibold text-brand-900">
            Что в каталоге
          </h2>
          <ul className="mt-3 space-y-2">
            {categories.map((category) => (
              <li key={category.id}>
                <Link
                  href={categoryUrl(category)}
                  className="font-semibold text-brand-700 hover:underline"
                >
                  {category.name}
                </Link>
                {category.excerpt && (
                  <span className="text-brand-500"> — {category.excerpt}</span>
                )}
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-10 rounded-card bg-brand-50 p-6">
          <p className="text-base font-semibold text-brand-900">
            Не знаете, что подойдёт вашей машине?
          </p>
          <p className="mt-1.5 text-sm text-brand-500">
            Позвоните — подберём по модели или VIN. {site.workHours}.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <a href={`tel:${site.phoneHref}`} className="btn-primary">
              {site.phone}
            </a>
            <Link href="/catalog/" className="btn-secondary">
              Смотреть каталог
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
