import type { Metadata } from "next";
import Link from "next/link";

import { BusinessPostForm } from "@/components/admin/BusinessPostForm";
import { BusinessPostImport } from "@/components/admin/BusinessPostImport";
import { type BusinessPostView, BusinessPostItem } from "@/components/admin/BusinessPostItem";
import { BusinessPostSettingsForm } from "@/components/admin/BusinessPostSettingsForm";
import {
  type BusinessPost,
  formatMinsk,
  getBusinessPostSettings,
  listBusinessPosts,
  nextMorningInput,
  toMinskInput,
} from "@/lib/business-posts";
import { telegramConfigured } from "@/lib/telegram";

export const metadata: Metadata = { title: "Посты в Яндексе" };

function toView(post: BusinessPost): BusinessPostView {
  return {
    id: post.id,
    publishAt: toMinskInput(post.publishAt),
    title: post.title,
    body: post.body,
    imageUrl: post.imageUrl,
    linkUrl: post.linkUrl,
    when: formatMinsk(post.publishAt),
    sentWhen: post.sentAt ? formatMinsk(post.sentAt) : null,
    lastError: post.lastError,
    attempts: post.attempts,
  };
}

export default async function BusinessPostsPage() {
  const { upcoming, sent } = listBusinessPosts();
  const { cabinetUrl } = getBusinessPostSettings();
  const telegramReady = telegramConfigured();
  const tomorrowMorning = nextMorningInput();

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-brand-900">Посты в Яндексе</h1>
        <p className="mt-1 text-sm text-brand-500">
          У Яндекс Бизнеса нет отложенной публикации и открытого API. Поэтому в назначенное время бот присылает
          в Telegram готовый пост: картинку, текст и ссылку. Остаётся открыть кабинет, вставить и нажать
          «Опубликовать». Ставьте то же время, что у отложенного поста в Google.
        </p>
      </div>

      {!telegramReady && (
        <p className="card border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          Telegram не настроен — посты не будут приходить.{" "}
          <Link href="/admin/settings/telegram/" className="underline">
            Настроить
          </Link>
        </p>
      )}

      <div className="card p-4">
        <BusinessPostSettingsForm cabinetUrl={cabinetUrl} />
      </div>

      <BusinessPostImport />

      <details className="card p-4">
        <summary className="cursor-pointer text-sm font-semibold text-brand-900">Добавить пост вручную</summary>
        <div className="mt-3">
          <BusinessPostForm
            id={null}
            initial={{ publishAt: tomorrowMorning, title: "", body: "", imageUrl: "", linkUrl: "" }}
            submitLabel="Добавить"
          />
        </div>
      </details>

      <section className="space-y-2">
        <h2 className="text-base font-semibold text-brand-900">В очереди: {upcoming.length}</h2>
        {upcoming.length === 0 ? (
          <p className="card p-8 text-center text-sm text-brand-400">Запланированных постов нет.</p>
        ) : (
          <ul className="card divide-y divide-brand-100">
            {upcoming.map((post) => (
              <BusinessPostItem key={post.id} post={toView(post)} />
            ))}
          </ul>
        )}
      </section>

      {sent.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-base font-semibold text-brand-900">Присланы: {sent.length}</h2>
          <ul className="card divide-y divide-brand-100">
            {sent.map((post) => (
              <BusinessPostItem key={post.id} post={toView(post)} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
