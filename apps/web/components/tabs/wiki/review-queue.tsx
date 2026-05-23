"use client";
import { marked } from "marked";

export function ReviewQueue(props: { content: string | null }) {
  if (props.content == null) {
    return (
      <div className="p-4 text-sm opacity-55">
        review-queue.md 가 없습니다. (wiki/infra/review-queue.md 또는 wiki/review-queue.md)
      </div>
    );
  }
  const html = marked.parse(props.content, { breaks: true }) as string;
  return (
    <article
      className="prose prose-sm max-w-none p-4"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
