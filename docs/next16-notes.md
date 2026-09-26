# Next.js 16 — выжимка под этот проект

Составлено по `node_modules/next/dist/docs/` для **next 16.3.2 / react 19.2.8**.
Цель — не перечитывать 3 МБ официальных доков в каждой сессии. Здесь только то,
что реально касается этого репозитория.

Если правишь что-то за пределами этого списка (Cache Components, PPR, i18n,
next/font, parallel routes, MDX, тесты) — иди в первоисточник:
`node_modules/next/dist/docs/01-app/...`. Актуализировать этот файл при
обновлении `next`.

---

## 1. Режим, в котором работает проект

| Что | Как здесь |
| --- | --- |
| Роутер | App Router, `src/app`, route groups `(shop)` / `(panel)` |
| Сборщик | Turbopack (в 16 он по умолчанию, флаг `--turbopack` не нужен) |
| Хостинг | Node-сервер `next start` под systemd за nginx. Не standalone, не static export |
| Картинки | `images: { unoptimized: true }` — встроенный оптимизатор выключен, свой конвейер `src/lib/image-pipeline.mjs`, раздаёт nginx |
| Кеширование | **Cache Components НЕ включены** (`cacheComponents` нет в `next.config.ts`) → действует «предыдущая модель»: сегментные конфиги + `revalidatePath` |
| URL | `trailingSlash: true` — адреса уже проиндексированы, менять нельзя |
| Типы | `typescript.ignoreBuildErrors: false` — ошибки типов валят сборку |
| Линт | `next lint` удалён в 16; линт вынесен из сборки → `npm run check` |

Не предлагать без явной просьбы: `cacheComponents`, PPR, `reactCompiler`,
`output: 'standalone'`, статический экспорт, `next/image`.

---

## 2. Async Request APIs — главный источник ошибок

В 16 синхронный доступ **полностью удалён**. Всегда `await`:

```ts
const { slug } = await params          // page / layout / route / default / icon
const q = await searchParams           // только в page
const store = await cookies()          // next/headers
const h = await headers()
```

Также стали промисами: `id` в `sitemap`, `params` и `id` в генераторах картинок
(`opengraph-image`, `icon`, `apple-icon`). В `generateImageMetadata` и в
`generateStaticParams` дочернего сегмента `params` остаются **синхронными**.

### Глобальные типы-хелперы

Генерируются `next dev` / `next build` / `next typegen`, импортировать не надо:

```ts
export default async function Page(props: PageProps<'/catalog/[category]'>) {
  const { category } = await props.params
}
export async function GET(req: NextRequest, ctx: RouteContext<'/api/order'>) {}
// и LayoutProps<'/...'>
```

---

## 3. proxy.ts вместо middleware

`middleware.ts` переименован в `proxy.ts` (у нас `src/proxy.ts`), экспорт —
функция `proxy`. Что важно помнить:

- Рантайм всегда **Node.js**, `export const runtime` в этом файле бросает ошибку.
- Без `matcher` выполняется на **каждом** запросе, включая `_next/static` и
  `public/`. У нас `matcher: ["/admin/:path*"]` — витрина намеренно не тронута,
  любой proxy на её маршрутах делает страницы динамическими.
- **Server Actions — не отдельные маршруты.** Это POST на тот путь, где экшен
  используется. Значит `matcher`, исключающий путь, снимает и защиту с экшена.
  Поэтому авторизацию проверяем внутри каждого экшена/страницы/handler'а
  (`requireAdmin()`), а proxy — только удобство.
- `revalidatePath` в proxy вызывать нельзя.
- Флаги переименованы: `skipMiddlewareUrlNormalize` → `skipProxyUrlNormalize`.

---

## 4. Кеширование и ревалидация («предыдущая модель»)

Сегментные конфиги работают, пока `cacheComponents` выключен. Живут в
`page.tsx`, `layout.tsx`, `route.ts`:

```ts
export const dynamic = 'auto' | 'force-dynamic' | 'force-static' | 'error'
export const revalidate = false | 0 | number   // число должно быть литералом: 600, не 60*10
export const dynamicParams = true              // false → 404 для путей вне generateStaticParams
export const fetchCache = 'auto' | ...         // трогать только при явной необходимости
```

- `force-static` заставляет `cookies()`, `headers()`, `useSearchParams()`
  возвращать пустые значения — именно поэтому так помечены `feed.xml`,
  `yml.xml`, `sitemap`, `robots`, `variants.json`, `search-index.json`.
- Минимальный `revalidate` среди layout'ов и page маршрута определяет частоту
  для всего маршрута.
- В dev страницы рендерятся всегда заново, кеш не проверить локально.

### revalidatePath (наш основной инструмент, `src/lib/revalidate.ts`)

```ts
revalidatePath('/product/konkretnyj-slug')   // литеральный путь — без второго аргумента
revalidatePath('/product/[slug]', 'page')    // шаблон — второй аргумент ОБЯЗАТЕЛЕН
revalidatePath('/', 'layout')                // сброс всего + клиентского кеша
```

- Трейлинг-слеш в пути не нужен, **независимо от `trailingSlash: true`**.
- Путь — это структура файлов роутов, а не URL. При rewrites передавать
  назначение, а не источник.
- Из Server Action — UI обновляется сразу; из Route Handler — путь лишь
  помечается, пересборка произойдёт при следующем заходе.
- `'layout'` инвалидирует и все вложенные страницы, `'page'` — нет.
- Вне запроса (таймер, `setInterval`, скрипт через jiti) `revalidatePath`
  падает с `Invariant: static generation store missing`. Фоновые задачи по
  расписанию поэтому идут через cron → Route Handler (`/api/cron/rates/`,
  ключ в `var/cron-key`), а не через таймер в процессе.
- Страница, читающая `searchParams`, рендерится на каждый запрос, даже если
  у маршрута есть `generateStaticParams`. Так устроены `/catalog/` и
  разделы с `?page=` и `?sort=`; чтение только в одной ветке (подраздел в
  `[branch]`) оставляет остальные пути маршрута статическими.

### revalidateTag / updateTag / refresh

Сейчас в проекте не используются, но если понадобятся:

- `revalidateTag(tag, profile)` — **второй аргумент обязателен** в 16
  (например `revalidateTag('products', 'max')`). Одноаргументная форма
  устарела и даёт ошибку типов. Семантика: stale-while-revalidate.
- `updateTag(tag)` — только в Server Actions, read-your-writes: данные
  протухают и сразу перечитываются в этом же запросе. Это то, что нужно
  админке, если когда-нибудь уйдём с `revalidatePath` на теги.
- `refresh()` из `next/cache` — обновить клиентский роутер из Server Action.
- `cacheLife` / `cacheTag` стабильны, префикс `unstable_` убран.

### Кеш данных

`fetch` по умолчанию **не кешируется**; нужен `{ cache: 'force-cache' }` или
`{ next: { revalidate: N, tags: [...] } }`. Для SQLite-запросов (`better-sqlite3`)
`fetch`-кеш неприменим: дедупликация в пределах одного рендера — через
`cache()` из `react`, кеш между запросами — `unstable_cache` из `next/cache`.

---

## 5. generateStaticParams

- Должна **всегда** возвращать массив, даже пустой — иначе маршрут станет
  динамическим.
- Пустой массив = все пути собираются при первом заходе (ISR).
- При ревалидации повторно **не вызывается**.
- Может отдавать params только для своего сегмента и родительских, не для
  дочерних.
- Работает и в `route.ts`, не только в страницах.

---

## 6. Route Handlers

- `GET` по умолчанию **динамический** (изменилось ещё в 15). Статика — только
  через `export const dynamic = 'force-static'`, как у нас в фидах.
- `context.params` — промис.
- Если `OPTIONS` не определён, Next подставит его сам.
- `sitemap.xml`, `robots.txt`, иконки и og-картинки имеют собственные
  файловые конвенции — не делать их руками через route handler.

---

## 7. Metadata / SEO

- `generateMetadata` и объект `metadata` — только в Server Components, и не
  одновременно в одном сегменте.
- `metadataBase` задаётся в корневом `layout.tsx`; относительный URL в
  metadata без него — ошибка сборки.
- `title.template` применяется к **дочерним** сегментам; вместе с ним
  обязателен `title.default`.
- `themeColor`, `colorScheme`, `viewport` внутри `metadata` устарели —
  только через `generateViewport` / `export const viewport`.
- `fetch` внутри `generateMetadata` мемоизируется вместе с `generateStaticParams`,
  layout'ами и страницами. Для не-`fetch` (наш случай) — `cache()` из `react`.
- В `generateMetadata` можно вызывать `notFound()` и `redirect()`.
- `sitemap.js` кешируется по умолчанию, если не трогает request-time API.

---

## 8. after()

`src/lib/indexnow.ts` использует `after()` из `next/server`.

- Полностью поддержан на `next start`.
- Не делает маршрут динамическим; на статической странице колбэк выполнится на
  сборке/ревалидации.
- Выполнится даже при ошибке, `notFound()` или `redirect()`.
- **В Server Components (страницы, layout'ы, `generateMetadata`) нельзя
  вызывать `cookies()`/`headers()` внутри колбэка** — читать до `after()` и
  передавать значения замыканием. В Route Handlers и Server Actions — можно.
- При остановке сервера нужен graceful shutdown (SIGTERM/SIGINT + 10–30 с на
  дренаж), иначе отложенные колбэки потеряются. Учитывать в systemd/pm2.

---

## 9. Сборка, dev, деплой

- `next dev` пишет в `.next/dev`, `next build` — в `.next`; их можно запускать
  одновременно. Лок-файл не даёт поднять два `next dev` на одном проекте.
- Сгенерированные типы роутов (`.next/dev/types/validator.ts`,
  `.next/types/validator.ts`) входят в `tsconfig` и **не чистятся сами**.
  После переименования сегмента (`[sub]` → `[branch]`) сборка падает на
  `Cannot find module '…/[sub]/page.js'`, хотя в `src/` этого пути уже нет.
  Лечится `rm -rf .next/dev/types` (или всего `.next/dev`) — код править не
  нужно.
- Из вывода `next build` убраны `size` и `First Load JS` — мерить вес через
  Lighthouse или наш `npm run weight`.
- В `next.config.ts` при `next dev` в `process.argv` **нет** `'dev'`; проверять
  `process.env.NODE_ENV === 'development'`.
- ISR-кеш лежит на диске конкретного инстанса. Один сервер с постоянным диском —
  работает само. При нескольких инстансах понадобились бы `cacheHandler`,
  общий `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` и `deploymentId`.
- Для стриминга через nginx нужен `X-Accel-Buffering: no` (у нас стриминга нет).

### Дочерние процессы и пути к файлам в рантайме

Turbopack статически разбирает `child_process.fork()` и `path.join()` с
`process.cwd()` и пытается включить файл в сборку. Для скрипта, который
должен запускаться как есть (`scripts/ml-worker.mjs`), сборка падает с
`Module not found: Can't resolve '/ROOT/scripts/…'`. Лечится директивой
в первом аргументе `path.join`:

```ts
path.join(/*turbopackIgnore: true*/ process.cwd(), "scripts", "ml-worker.mjs")
```

Так же сделано в `src/lib/image-pipeline.mjs`. Источник:
`01-app/03-api-reference/08-turbopack.md` (таблица magic comments).

---

## 10. Удалено и переименовано в 16 (не предлагать)

- `serverRuntimeConfig` / `publicRuntimeConfig` → env-переменные; для чтения
  env именно в рантайме — `await connection()` перед `process.env`.
- `next lint` и опция `eslint` в конфиге.
- AMP целиком, `next/legacy/image`, `images.domains`, `unstable_rootParams`.
- `experimental.ppr`, `experimental.dynamicIO`, `experimental.useCache`,
  сегментный `experimental_ppr`.
- `experimental.turbopack` → top-level `turbopack`.
- `devIndicators`: `appIsrStatus`, `buildActivity`, `buildActivityPosition`.
- Слоты parallel routes теперь требуют `default.js`, иначе сборка падает.
- Next больше не перебивает `scroll-behavior: smooth` при навигации; вернуть
  старое поведение — `data-scroll-behavior="smooth"` на `<html>`.

---

## 11. next/image — если когда-нибудь включим

Сейчас не используется (`unoptimized: true`, обычные `<img>` и `Picture.tsx`).
Дефолты в 16 изменились: `qualities` только `[75]`, `minimumCacheTTL` 4 часа,
из `imageSizes` убран `16`, `maximumRedirects: 3`, локальные IP заблокированы,
локальные src с query-строкой требуют `images.localPatterns.search`.

---

## 12. Куда идти за подробностями

`node_modules/next/dist/docs/01-app/`:

- `02-guides/upgrading/version-16.md` — полный список breaking changes
- `02-guides/caching-without-cache-components.md` — наша модель кеширования
- `02-guides/self-hosting.md` — Node-сервер, ISR-кеш, nginx
- `03-api-reference/03-file-conventions/proxy.md`
- `03-api-reference/03-file-conventions/route.md`
- `03-api-reference/04-functions/` — `revalidatePath`, `after`,
  `generate-static-params`, `generate-metadata`, `updateTag`, `cookies`
- `03-api-reference/05-config/01-next-config-js/` — по одному файлу на опцию
