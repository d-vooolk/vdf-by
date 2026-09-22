import { CarCatalogEditor } from "@/components/admin/CarCatalogEditor";

export const metadata = { title: "Автомобили" };

export default function CarsPage() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-brand-900">Автомобили</h1>
        <p className="mt-1 max-w-3xl text-sm text-brand-500">
          Марки, модели и поколения для подбора по авто. Записи из основного
          справочника можно только дополнить фото, свои — править целиком. На
          сайте машина появится, когда к ней привяжут хотя бы один товар.
        </p>
      </div>
      <CarCatalogEditor />
    </div>
  );
}
