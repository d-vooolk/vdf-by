import { CategoryForm } from "@/components/admin/CategoryForm";
import { aiConfigured, DEFAULT_PROMPTS, getPrompts } from "@/lib/ai";
import { getCategories } from "@/lib/catalog";
import { listCategoriesBrief } from "@/lib/store";

export const metadata = { title: "Новая категория" };

export default function NewCategoryPage() {
  const categories = getCategories();

  // Новый раздел встаёт в конец меню: шаг 10 оставляет место, чтобы потом
  // можно было вписать раздел между существующими, не переставляя все.
  const nextOrder =
    categories.reduce((max, category) => Math.max(max, category.order ?? 0), 0) +
    10;

  return (
    <CategoryForm
      category={{ id: "", slug: "", name: "", order: nextOrder }}
      thumbs={{}}
      productCount={0}
      categories={listCategoriesBrief()}
      ai={{ ready: aiConfigured(), prompts: getPrompts(), defaults: DEFAULT_PROMPTS }}
      productTitles={[]}
    />
  );
}
