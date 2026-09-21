import { JsonLd } from "@/components/JsonLd";
import type { FaqItem } from "@/lib/schema";

interface FaqProps {
  items: FaqItem[];
  title?: string;
  schema?: boolean;
}

export function Faq({
  items,
  title = "Вопросы и ответы",
  schema = false,
}: FaqProps) {
  if (!items.length) return null;

  return (
    <section className="mt-14 border-t border-brand-100 pt-10">
      {schema && (
        <JsonLd
          data={{
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: items.map((item) => ({
              "@type": "Question",
              name: item.q,
              acceptedAnswer: { "@type": "Answer", text: item.a },
            })),
          }}
        />
      )}

      <h2 className="mb-4 text-xl font-semibold text-brand-900">{title}</h2>

      <dl className="max-w-3xl divide-y divide-brand-100 border-y border-brand-100">
        {items.map((item, index) => (
          <div key={index} className="py-4">
            <dt className="text-base font-semibold text-brand-900">
              {item.q}
            </dt>
            <dd className="mt-1.5 text-sm leading-relaxed text-brand-600">
              {item.a}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
