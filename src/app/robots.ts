import type { MetadataRoute } from "next";

import { absoluteUrl } from "@/lib/seo";

export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Корзина у каждого своя, страница успеха существует лишь секунду
        // после отправки — в индексе им делать нечего. Админка отдаёт
        // краулеру только редирект на форму входа, но и ей в выдаче не место.
        disallow: ["/cart/", "/order/", "/admin/", "/account/"],
      },
    ],
    sitemap: absoluteUrl("/sitemap.xml"),
    host: absoluteUrl("/"),
  };
}
