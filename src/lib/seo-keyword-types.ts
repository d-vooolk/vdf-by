export const KEYWORD_PRIORITIES = ["высокий", "средний", "низкий"] as const;
export const KEYWORD_INTENTS = ["коммерческий", "услуга", "информационный", "навигационный"] as const;

export type KeywordPriority = (typeof KEYWORD_PRIORITIES)[number];
export type KeywordIntent = (typeof KEYWORD_INTENTS)[number];

export interface Keyword {
  q: string;
  url?: string;
}

export interface KeywordGroup {
  id: string;
  name: string;
  url: string;
  priority: KeywordPriority;
  intent: KeywordIntent;
  note: string;
  keywords: Keyword[];
}

export interface KeywordsFile {
  updatedAt: string;
  note: string;
  groups: KeywordGroup[];
}
