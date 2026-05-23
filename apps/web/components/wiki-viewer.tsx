"use client";
import matter from "gray-matter";
import { marked } from "marked";

export function WikiViewer(props: {
  path: string;
  content: string;
  schemaWarnings: string[];
  brokenLinks?: string[];
}) {
  const fm = matter(props.content);
  const html = marked.parse(fm.content, { breaks: true }) as string;
  return (
    <article className="prose prose-sm max-w-none">
      <div className="mb-3 border border-[var(--hill-rule)] bg-[#1a1208]/[0.04] p-2 text-xs">
        <div className="font-mono">{props.path}</div>
        <div className="mt-1 flex flex-wrap gap-2">
          {Object.entries(fm.data).map(([k, v]) => (
            <span key={k} className="bg-[#1a1208]/[0.08] px-1">
              {k}: {String(v)}
            </span>
          ))}
        </div>
        {props.schemaWarnings.length > 0 && (
          <ul className="mt-2 text-xs text-amber-700">
            {props.schemaWarnings.map((w) => (
              <li key={w}>⚠ {w}</li>
            ))}
          </ul>
        )}
        {props.brokenLinks && props.brokenLinks.length > 0 && (
          <ul className="mt-2 text-xs text-red-600">
            {props.brokenLinks.map((l) => (
              <li key={l}>↯ broken link: {l}</li>
            ))}
          </ul>
        )}
      </div>
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </article>
  );
}
