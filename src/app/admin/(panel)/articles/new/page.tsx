import Link from "next/link";

import { ArticleGenerator } from "@/components/admin/ArticleGenerator";
import { aiConfigured, DEFAULT_PROMPTS, getPrompts } from "@/lib/ai";

export const metadata = { title: "Новая статья" };

export default function NewArticlePage() {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/admin/articles/" className="btn-ghost py-2 text-sm">
          ← К статьям
        </Link>
        <h1 className="text-xl font-semibold text-brand-900">Новая статья</h1>
      </div>
      <ArticleGenerator ai={{ ready: aiConfigured(), prompts: getPrompts(), defaults: DEFAULT_PROMPTS }} />
    </div>
  );
}
