import { VdfCatalogExport } from "@/components/admin/VdfCatalogExport";
import { VdfCatalogImport } from "@/components/admin/VdfCatalogImport";
import { aiConfigured } from "@/lib/ai";
import { listCategoriesBrief } from "@/lib/store";
import { vdfPriceStatus } from "@/lib/vdf-prices";

export const metadata = { title: "Каталог VDF" };

export const dynamic = "force-dynamic";

export default function VdfCatalogPage() {
  const all = listCategoriesBrief();
  const names = new Map(all.map((category) => [category.id, category.name]));
  const categories = all
    .filter((category) => category.children === 0)
    .map((category) => ({
      id: category.id,
      name: category.parentId
        ? `${names.get(category.parentId) ?? ""} → ${category.name}`
        : category.name,
    }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-brand-900">Каталог VDF</h1>
        <p className="mt-1 max-w-3xl text-sm text-brand-500">
          Выгрузка товаров любых разделов vdf-light.ru в таблицу Excel и загрузка такой таблицы на
          сайт. Таблицу можно сохранить, поправить и загрузить позже.
        </p>
      </div>
      <VdfCatalogExport loggedIn={vdfPriceStatus().email !== null} />
      <VdfCatalogImport categories={categories} aiReady={aiConfigured()} />
    </div>
  );
}
