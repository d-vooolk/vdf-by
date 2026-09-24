import { ChevronDownIcon } from "@/components/icons";
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

      <div className="max-w-3xl divide-y divide-brand-100 border-y border-brand-100">
        {items.map((item, index) => (
          <details key={index} className="group">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 text-base font-semibold text-brand-900 transition-colors select-none hover:text-brand-600 [&::-webkit-details-marker]:hidden">
              {item.q}
              <ChevronDownIcon className="h-5 w-5 shrink-0 text-brand-400 transition-transform duration-200 group-open:rotate-180" />
            </summary>
            <p className="-mt-1 pb-4 text-sm leading-relaxed text-brand-600">
              {item.a}
            </p>
          </details>
        ))}
      </div>
    </section>
  );
}
