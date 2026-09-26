import { AiError, aiConfigured } from "@/lib/ai";
import { getAdmin } from "@/lib/auth";
import {
  createExport,
  deleteExport,
  exportSummary,
  listExports,
  listStep,
  readStep,
  retryExportErrors,
  vdfCategoryCount,
  vdfCategoryTree,
} from "@/lib/vdf-catalog";
import {
  deleteImport,
  importLog,
  importNext,
  importSummary,
  listImports,
  releaseImport,
  retryImport,
} from "@/lib/vdf-product-import";

export const dynamic = "force-dynamic";

type Input = Record<string, unknown>;

const id = (input: Input) => {
  const value = Number(input.id);
  if (!Number.isInteger(value) || value <= 0) throw new Error("Не указан номер");
  return value;
};

export async function POST(request: Request) {
  if (!(await getAdmin())) return Response.json({ error: "Нужно войти заново" }, { status: 401 });
  const input = ((await request.json().catch(() => null)) ?? {}) as Input;

  try {
    switch (input.action) {
      case "tree":
        return Response.json({ tree: await vdfCategoryTree() });
      case "count":
        return Response.json({ count: await vdfCategoryCount(String(input.slug ?? "")) });
      case "exports":
        return Response.json({ exports: listExports() });
      case "create-export": {
        const sources = Array.isArray(input.sources)
          ? (input.sources as Array<Record<string, unknown>>).map((source) => ({
              slug: String(source.slug ?? ""),
              name: String(source.name ?? ""),
              count: Number(source.count) || 0,
            }))
          : [];
        const created = createExport(sources.filter((source) => source.slug));
        return Response.json({ export: exportSummary(created) });
      }
      case "list":
        return Response.json({ export: await listStep(id(input)) });
      case "read":
        return Response.json({ export: await readStep(id(input)) });
      case "export-summary":
        return Response.json({ export: exportSummary(id(input)) });
      case "retry-export":
        return Response.json({ retried: retryExportErrors(id(input)), export: exportSummary(id(input)) });
      case "delete-export":
        deleteExport(id(input));
        return Response.json({ exports: listExports() });
      case "imports":
        return Response.json({ imports: listImports() });
      case "import-summary":
        return Response.json({ import: importSummary(id(input)), log: importLog(id(input)) });
      case "release-import":
        releaseImport(id(input));
        return Response.json({ import: importSummary(id(input)) });
      case "retry-import":
        return Response.json({ retried: retryImport(id(input)), import: importSummary(id(input)) });
      case "delete-import":
        deleteImport(id(input));
        return Response.json({ imports: listImports() });
      case "import": {
        if (!aiConfigured()) {
          return Response.json({ error: "Нейросеть не подключена: нет AI_API_KEY" }, { status: 400 });
        }
        const outcome = await importNext(id(input));
        return Response.json({ outcome, import: importSummary(id(input)) });
      }
      default:
        return Response.json({ error: "Неизвестное действие" }, { status: 400 });
    }
  } catch (error) {
    if (!(error instanceof AiError)) console.error("[vdf-catalog]", error);
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
}
