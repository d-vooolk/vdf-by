export interface WikiCarKey {
  markId: string;
  modelId: string;
  generationId: string;
}

export interface WikiSection {
  id: string;
  name: string;
  sortOrder: number;
}

export interface WikiEntrySummary extends WikiCarKey {
  markName: string;
  modelName: string;
  generationName: string | null;
  updatedAt: string;
  mediaCount: number;
  hasText: boolean;
}

export interface WikiMedia {
  id: string;
  type: "PHOTO" | "VIDEO";
  url: string;
  thumbUrl: string | null;
  mediumUrl: string | null;
  originalName: string;
  sectionId: string | null;
}

export interface WikiProduct {
  id: string;
  sectionId: string | null;
  productId: string;
  title: string;
  url: string;
  imageUrl: string | null;
}

export interface WikiEntry extends WikiCarKey {
  id: string;
  markName: string;
  modelName: string;
  generationName: string | null;
  content: string;
  sections: Array<{ sectionId: string; content: string }>;
  media: WikiMedia[];
  products: WikiProduct[];
  updatedAt: string;
}

export type ProposalStatus = "DRAFT" | "PENDING" | "CHANGES_REQUESTED" | "REVIEWED" | "REJECTED";

export interface ReviewNote {
  text: string;
  byName: string;
  at: string;
}

export interface WikiProposal {
  id: string;
  status: ProposalStatus;
  sectionId: string | null;
  sectionName: string | null;
  text: string;
  reviewNotes: ReviewNote[];
  updatedAt: string;
  entry: WikiCarKey & { markName: string; modelName: string; generationName: string | null };
  media: WikiMedia[];
  products: WikiProduct[];
}

export interface CatalogItem {
  id: string;
  title: string;
  url: string;
  image: string | null;
}

export interface CarOption {
  id: string;
  name: string;
  year_from?: number | null;
  year_to?: number | null;
}
