import { getAdmin } from "@/lib/auth";
import {
  isCarLevel,
  listCarEntries,
  listGenerations,
  listMarks,
  listModels,
} from "@/lib/cars";
import { pickUrl } from "@/lib/image-types";
import { getImage } from "@/lib/images";

/**
 * Справочник автомобилей для формы привязки в карточке товара.
 *
 * Route handler, а не пропсы страницы: справочник — это четыре сотни марок,
 * пять тысяч моделей и десять тысяч поколений, два мегабайта. Отдать его в
 * форму целиком нельзя, поэтому он подгружается уровнями, по мере выбора:
 * марки при открытии, модели после выбора марки, поколения после модели.
 *
 *   /admin/api/cars                  марки
 *   /admin/api/cars?mark=BMW         модели марки
 *   /admin/api/cars?model=BMW:3ER    поколения модели
 *
 * Только для админки: справочник сам по себе не тайна, но и раздавать его
 * посторонним незачем — витрина показывает лишь те машины, к которым
 * привязаны товары.
 */

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const admin = await getAdmin();
  if (!admin) {
    return Response.json({ error: "Нужно войти заново" }, { status: 401 });
  }

  const params = new URL(request.url).searchParams;
  const modelId = params.get("model");
  const markId = params.get("mark");
  const level = params.get("level");

  if (isCarLevel(level)) {
    return Response.json({
      entries: listCarEntries(level, params.get("parent") ?? undefined),
    });
  }

  if (modelId) {
    return Response.json({ generations: listGenerations(modelId) });
  }
  if (markId) {
    return Response.json({ models: listModels(markId) });
  }
  // Ссылку на иконку считает сервер: манифест картинок в браузер целиком
  // не уезжает, а в списке марку находят именно по логотипу.
  return Response.json({
    marks: listMarks().map((mark) => ({
      id: mark.id,
      slug: mark.slug,
      name: mark.name,
      ...(mark.logo ? { icon: pickUrl(getImage(mark.logo), 48) } : {}),
    })),
  });
}
