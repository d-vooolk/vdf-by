import type { Metadata } from "next";

import { CatalogView, catalogMetadata } from "@/components/CatalogView";
import { FIRST_PAGE } from "@/lib/listing";

export function generateMetadata(): Metadata {
  return catalogMetadata(FIRST_PAGE);
}

export default function CatalogPage() {
  return <CatalogView listing={FIRST_PAGE} />;
}
