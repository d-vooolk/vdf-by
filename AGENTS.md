<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Стиль кода

Не оставлять комментариев в коде. Ни поясняющих, ни заголовочных, ни
временных пометок вроде `// TODO` и `// убрал старую логику`. Код должен
объясняться именами переменных, функций и структурой.

Это правило перекрывает обычную привычку подстраиваться под окружающий стиль:
в существующих файлах комментарии есть, но новые добавлять не нужно.
Существующие комментарии не удалять без отдельной просьбы.

Пояснения, которые всё же нужно где-то зафиксировать, идут в ответ в чате или
в `docs/`, а не в исходники.

# Порядок чтения документации Next.js

Сначала читай `docs/next16-notes.md` — выжимку по Next 16 под этот проект:
async request APIs, `proxy.ts`, модель кеширования без Cache Components,
`revalidatePath`, `after()`, что удалено в 16-й версии.

В `node_modules/next/dist/docs/` иди только если задача выходит за рамки
выжимки (там ~3 МБ текста) — и допиши в выжимку то, чего в ней не хватило.
Файл актуален для версии из `package.json`; при обновлении `next` его нужно
перепроверить.
