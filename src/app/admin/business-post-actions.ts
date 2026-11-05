"use server";

import { requireAdmin } from "@/lib/auth";
import {
  addBusinessPost,
  type BusinessPostImportReport,
  deleteBusinessPost,
  fromMinskInput,
  getBusinessPost,
  importBusinessPosts,
  parseBusinessPostsMarkdown,
  requeueBusinessPost,
  saveBusinessPostSettings,
  sendBusinessPost,
  updateBusinessPost,
} from "@/lib/business-posts";
import { fail, type FormState, ok } from "./form-state";

export interface BusinessPostFormInput {
  publishAt: string;
  title: string;
  body: string;
  imageUrl: string;
  linkUrl: string;
}

function cleanUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return "";
  try {
    const url = new URL(trimmed);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function validate(input: BusinessPostFormInput) {
  const problems: string[] = [];
  const publishAt = fromMinskInput(input.publishAt);
  const title = input.title.trim().slice(0, 200);
  const body = input.body.trim().slice(0, 3500);
  const imageUrl = cleanUrl(input.imageUrl);
  const linkUrl = cleanUrl(input.linkUrl);
  if (publishAt === null) problems.push("Укажите дату и время");
  if (!title) problems.push("Нужен заголовок");
  if (!body) problems.push("Нужен текст поста");
  if (imageUrl === null) problems.push("Адрес картинки должен начинаться с https://");
  if (linkUrl === null) problems.push("Ссылка должна начинаться с https://");
  if (problems.length || publishAt === null || imageUrl === null || linkUrl === null) return { problems };
  return { problems, post: { publishAt, title, body, imageUrl, linkUrl } };
}

export async function saveBusinessPostAction(id: number | null, input: BusinessPostFormInput): Promise<FormState> {
  await requireAdmin();
  const { problems, post } = validate(input);
  if (!post) return fail(problems);
  if (id === null) addBusinessPost(post);
  else if (getBusinessPost(id)) updateBusinessPost(id, post);
  else return fail(["Пост не найден"]);
  return ok();
}

export async function deleteBusinessPostAction(id: number): Promise<FormState> {
  await requireAdmin();
  deleteBusinessPost(id);
  return ok();
}

export async function requeueBusinessPostAction(id: number): Promise<FormState> {
  await requireAdmin();
  requeueBusinessPost(id);
  return ok();
}

export async function sendBusinessPostNowAction(id: number): Promise<FormState> {
  await requireAdmin();
  const result = await sendBusinessPost(id);
  return result.ok ? ok() : fail([result.reason ?? "Не отправилось"]);
}

export async function saveBusinessPostSettingsAction(cabinetUrl: string): Promise<FormState> {
  await requireAdmin();
  const url = cleanUrl(cabinetUrl);
  if (url === null) return fail(["Ссылка должна начинаться с https://"]);
  saveBusinessPostSettings({ cabinetUrl: url });
  return ok();
}

export async function importBusinessPostsAction(
  markdown: string,
  defaultTime: string,
): Promise<FormState & { report?: BusinessPostImportReport; found: number }> {
  await requireAdmin();
  const posts = parseBusinessPostsMarkdown(markdown.slice(0, 200_000), defaultTime);
  if (!posts.length) {
    return {
      ...fail(["Не нашёл ни одного поста: заголовки должны выглядеть как «## 06.11 Пт — Тема»"]),
      found: 0,
    };
  }
  return { ...ok(), report: importBusinessPosts(posts), found: posts.length };
}
