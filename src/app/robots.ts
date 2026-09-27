import type { MetadataRoute } from "next";

import { getProducts } from "@/lib/catalog";
import { absoluteUrl } from "@/lib/seo";

export const dynamic = "force-static";

const TRACKING_PARAMS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "yclid",
  "gclid",
  "fbclid",
  "ysclid",
  "_openstat",
  "from",
];

function optionParams(): string[] {
  const ids = new Set<string>();
  for (const product of getProducts()) {
    for (const group of product.optionGroups) ids.add(group.id);
  }
  return [...ids].sort();
}

export default function robots(): MetadataRoute.Robots {
  const options = optionParams();

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Админка отдаёт краулеру только редирект на форму входа, и ей в
        // выдаче не место. Корзина, кабинет и страница заказа закрыты
        // метатегом noindex: чтобы робот его увидел, обход им не запрещён.
        disallow: ["/admin/", "/listing/", "/api/"],
      },
      {
        userAgent: "Yandex",
        allow: "/",
        disallow: ["/admin/", "/listing/", "/api/"],
        other: {
          "Clean-param": [
            TRACKING_PARAMS.join("&"),
            "sort",
            ...(options.length ? [`${options.join("&")} /product/`] : []),
          ],
        },
      },
    ],
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
