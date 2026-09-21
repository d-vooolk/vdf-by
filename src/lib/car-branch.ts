import {
  carsRoot,
  generationUrl,
  markUrl,
  modelUrl,
  type FitGeneration,
  type FitMark,
  type FitModel,
} from "./car-types";
import {
  findGeneration,
  findMark,
  findModel,
  fitmentCategories,
  getCarTree,
  getProductsForGeneration,
  getProductsForMark,
  getProductsForModel,
} from "./cars";
import { getCategoryBySlug } from "./catalog";
import type { Category } from "./schema";

export function fitmentCategoryBySlug(slug: string): Category | undefined {
  const category = getCategoryBySlug(slug);
  return category && !category.parentId && category.carFitment
    ? category
    : undefined;
}

export interface MarkScope {
  category: Category;
  mark: FitMark;
}

export interface ModelScope extends MarkScope {
  model: FitModel;
}

export interface GenerationScope extends ModelScope {
  generation: FitGeneration;
}

export function resolveMark(
  categorySlug: string,
  markSlug: string,
): MarkScope | null {
  const category = fitmentCategoryBySlug(categorySlug);
  if (!category) return null;

  const mark = findMark(markSlug, category.id);
  return mark ? { category, mark } : null;
}

export function resolveModel(
  categorySlug: string,
  markSlug: string,
  modelSlug: string,
): ModelScope | null {
  const scope = resolveMark(categorySlug, markSlug);
  if (!scope) return null;

  const model = findModel(scope.mark, modelSlug);
  return model ? { ...scope, model } : null;
}

export function resolveGeneration(
  categorySlug: string,
  markSlug: string,
  modelSlug: string,
  generationSlug: string,
): GenerationScope | null {
  const scope = resolveModel(categorySlug, markSlug, modelSlug);
  if (!scope) return null;

  const generation = findGeneration(scope.model, generationSlug);
  return generation ? { ...scope, generation } : null;
}

export interface BranchPaths {
  category: Category;
  marks: string[];
  models: Array<{ mark: string; model: string }>;
  generations: Array<{ mark: string; model: string; generation: string }>;
}

export function branchPaths(): BranchPaths[] {
  return fitmentCategories().map((category) => {
    const tree = getCarTree(category.id);

    return {
      category,
      marks: tree.map((mark) => mark.slug),
      models: tree.flatMap((mark) =>
        mark.models.map((model) => ({ mark: mark.slug, model: model.slug })),
      ),
      generations: tree.flatMap((mark) =>
        mark.models.flatMap((model) =>
          model.generations.map((generation) => ({
            mark: mark.slug,
            model: model.slug,
            generation: generation.slug,
          })),
        ),
      ),
    };
  });
}

export function markParams(): Array<{ category: string; branch: string }> {
  return branchPaths().flatMap((branch) =>
    branch.marks.map((mark) => ({
      category: branch.category.slug,
      branch: mark,
    })),
  );
}

export function modelParams(): Array<{
  category: string;
  branch: string;
  model: string;
}> {
  return branchPaths().flatMap((branch) =>
    branch.models.map((entry) => ({
      category: branch.category.slug,
      branch: entry.mark,
      model: entry.model,
    })),
  );
}

export function generationParams(): Array<{
  category: string;
  branch: string;
  model: string;
  generation: string;
}> {
  return branchPaths().flatMap((branch) =>
    branch.generations.map((entry) => ({
      category: branch.category.slug,
      branch: entry.mark,
      model: entry.model,
      generation: entry.generation,
    })),
  );
}

export interface RelatedCategory {
  category: Category;
  url: string;
  count: number;
}

function others(current: Category): Category[] {
  return fitmentCategories().filter(
    (category) => category.id !== current.id,
  );
}

export function categoriesForMark(
  current: Category,
  mark: FitMark,
): RelatedCategory[] {
  return others(current)
    .map((category) => ({
      category,
      url: markUrl(mark.slug, carsRoot(category.slug)),
      count: getProductsForMark(mark.id, category.id).length,
    }))
    .filter((entry) => entry.count > 0);
}

export function categoriesForModel(
  current: Category,
  mark: FitMark,
  model: FitModel,
): RelatedCategory[] {
  return others(current)
    .map((category) => ({
      category,
      url: modelUrl(mark.slug, model.slug, carsRoot(category.slug)),
      count: getProductsForModel(model.id, category.id).length,
    }))
    .filter((entry) => entry.count > 0);
}

export function categoriesForGeneration(
  current: Category,
  mark: FitMark,
  model: FitModel,
  generation: FitGeneration,
): RelatedCategory[] {
  return others(current)
    .map((category) => ({
      category,
      url: generationUrl(
        mark.slug,
        model.slug,
        generation.slug,
        carsRoot(category.slug),
      ),
      count: getProductsForGeneration(generation.id, category.id).length,
    }))
    .filter((entry) => entry.count > 0);
}
