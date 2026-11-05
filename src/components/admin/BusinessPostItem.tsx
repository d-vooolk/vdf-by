"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  type BusinessPostFormInput,
  deleteBusinessPostAction,
  requeueBusinessPostAction,
  sendBusinessPostNowAction,
} from "@/app/admin/business-post-actions";
import type { FormState } from "@/app/admin/form-state";

import { BusinessPostForm } from "./BusinessPostForm";

export interface BusinessPostView extends BusinessPostFormInput {
  id: number;
  when: string;
  sentWhen: string | null;
  lastError: string | null;
  attempts: number;
}

export function BusinessPostItem({ post }: { post: BusinessPostView }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [problem, setProblem] = useState("");

  const run = (action: () => Promise<FormState>) =>
    startTransition(async () => {
      const result = await action();
      setProblem(result.problems.join(". "));
      router.refresh();
    });

  if (editing) {
    return (
      <li className="px-4 py-4">
        <BusinessPostForm
          id={post.id}
          initial={post}
          submitLabel="Сохранить"
          onSaved={() => setEditing(false)}
          onCancel={() => setEditing(false)}
        />
      </li>
    );
  }

  return (
    <li className="flex flex-wrap items-start gap-4 px-4 py-3">
      {post.imageUrl && (
        <img src={post.imageUrl} alt="" className="h-20 w-28 shrink-0 rounded-lg object-cover" loading="lazy" />
      )}
      <div className="min-w-0 flex-1 space-y-1 text-sm">
        <p className="tnum text-xs font-medium text-brand-500">
          {post.when}
          {post.sentWhen && <span className="badge ml-2 bg-green-100 text-green-800">прислан {post.sentWhen}</span>}
        </p>
        <p className="font-medium text-brand-900">{post.title}</p>
        <p className="line-clamp-3 whitespace-pre-line text-brand-600">{post.body}</p>
        {post.linkUrl && <p className="truncate text-xs text-brand-400">{post.linkUrl}</p>}
        {post.lastError && (
          <p className="text-xs text-red-700">
            Не отправился ({post.attempts} попыт.): {post.lastError}
          </p>
        )}
        {problem && <p className="text-xs text-red-700">{problem}</p>}
      </div>
      <div className="flex flex-wrap gap-2 sm:w-48 sm:flex-col">
        {post.sentWhen ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => requeueBusinessPostAction(post.id))}
            className="btn-secondary px-3 py-1.5 text-xs"
          >
            Вернуть в очередь
          </button>
        ) : (
          <>
            <button
              type="button"
              disabled={pending}
              onClick={() => setEditing(true)}
              className="btn-secondary px-3 py-1.5 text-xs"
            >
              Изменить
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                if (window.confirm("Прислать этот пост в Telegram прямо сейчас?")) {
                  run(() => sendBusinessPostNowAction(post.id));
                }
              }}
              className="btn-ghost px-3 py-1.5 text-xs"
            >
              Прислать сейчас
            </button>
          </>
        )}
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            if (window.confirm("Удалить пост?")) run(() => deleteBusinessPostAction(post.id));
          }}
          className="btn-ghost px-3 py-1.5 text-xs text-red-700"
        >
          Удалить
        </button>
      </div>
    </li>
  );
}
