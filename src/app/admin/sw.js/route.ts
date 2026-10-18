export const dynamic = "force-static";

const OFFLINE_PAGE = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Нет связи</title><style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#1a2b20;color:#f4f2ee;font:16px/1.5 system-ui,sans-serif;text-align:center;padding:24px}b{color:#c8b48e;font-size:20px}button{margin-top:16px;border:0;border-radius:9999px;background:#c8b48e;color:#1a2b20;font:600 15px system-ui;padding:12px 24px}</style></head><body><div><b>Нет связи с сервером</b><p>Проверьте интернет и попробуйте ещё раз.</p><button onclick="location.reload()">Обновить</button></div></body></html>`;

const WORKER = `
const OFFLINE_PAGE = ${JSON.stringify(OFFLINE_PAGE)};
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;
  event.respondWith(
    fetch(event.request).catch(
      () => new Response(OFFLINE_PAGE, { headers: { "Content-Type": "text/html; charset=utf-8" } }),
    ),
  );
});
`;

export function GET() {
  return new Response(WORKER, {
    headers: {
      "Content-Type": "text/javascript; charset=utf-8",
      "Service-Worker-Allowed": "/admin/",
    },
  });
}
