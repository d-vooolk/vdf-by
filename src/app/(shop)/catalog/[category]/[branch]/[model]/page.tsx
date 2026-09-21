import type { Metadata } from "next";
import { notFound } from "next/navigation";

import {
  CategoryModelView,
  categoryModelMetadata,
} from "@/components/CategoryCarView";
import { modelParams, resolveModel } from "@/lib/car-branch";

export function generateStaticParams() {
  return modelParams();
}

interface PageProps {
  params: Promise<{ category: string; branch: string; model: string }>;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { category, branch, model } = await params;
  const scope = resolveModel(category, branch, model);
  return scope ? categoryModelMetadata(scope) : {};
}

export default async function CategoryModelPage({ params }: PageProps) {
  const { category, branch, model } = await params;
  const scope = resolveModel(category, branch, model);
  if (!scope) notFound();

  return <CategoryModelView {...scope} />;
}
