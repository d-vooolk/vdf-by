import type { Metadata } from "next";

import {
  CategoryGenerationView,
  categoryGenerationMetadata,
} from "@/components/CategoryCarView";
import { generationParams, resolveGeneration } from "@/lib/car-branch";
import { redirectOrNotFound } from "@/lib/redirects";

export function generateStaticParams() {
  return generationParams();
}

interface PageProps {
  params: Promise<{
    category: string;
    branch: string;
    model: string;
    generation: string;
  }>;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { category, branch, model, generation } = await params;
  const scope = resolveGeneration(category, branch, model, generation);
  return scope ? categoryGenerationMetadata(scope) : {};
}

export default async function CategoryGenerationPage({ params }: PageProps) {
  const { category, branch, model, generation } = await params;
  const scope = resolveGeneration(category, branch, model, generation);
  if (!scope) redirectOrNotFound(`/catalog/${category}/${branch}/${model}/${generation}/`);

  return <CategoryGenerationView {...scope} />;
}
