/**
 * Вставка разметки schema.org в страницу.
 *
 * Скрипт рендерится на сборке вместе с остальным HTML, поэтому краулер видит
 * данные о товаре сразу, без исполнения JavaScript.
 */
export function JsonLd({ data }: { data: unknown }) {
  if (!data) return null;
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  );
}
