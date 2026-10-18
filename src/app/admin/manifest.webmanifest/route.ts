export const dynamic = "force-static";

export function GET() {
  return Response.json(
    {
      id: "/admin/",
      name: "VDF.BY — админка",
      short_name: "VDF админка",
      description: "Заказы, товары и типы рамок магазина VDF.BY",
      lang: "ru",
      start_url: "/admin/",
      scope: "/admin/",
      display: "standalone",
      orientation: "portrait",
      background_color: "#1a2b20",
      theme_color: "#1a2b20",
      icons: [
        { src: "/brand/admin-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
        { src: "/brand/admin-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
        { src: "/brand/admin-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      ],
      shortcuts: [
        { name: "Заказы", url: "/admin/orders/", icons: [{ src: "/brand/admin-192.png", sizes: "192x192" }] },
        { name: "Типы рамок", url: "/admin/frame-types/", icons: [{ src: "/brand/admin-192.png", sizes: "192x192" }] },
      ],
    },
    { headers: { "Content-Type": "application/manifest+json; charset=utf-8" } },
  );
}
