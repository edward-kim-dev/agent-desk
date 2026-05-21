"use client";

export type WikiSubview = "docs" | "adr" | "review" | "log";

const LABELS: Record<WikiSubview, string> = {
  docs: "문서",
  adr: "ADR 보드",
  review: "Review Queue",
  log: "Log",
};
const ORDER: WikiSubview[] = ["docs", "adr", "review", "log"];

export function WikiSubviewSwitch(props: {
  value: WikiSubview;
  onChange: (next: WikiSubview) => void;
}) {
  return (
    <nav role="tablist" aria-label="위키 서브뷰" className="flex gap-1 border-b px-2">
      {ORDER.map((key) => {
        const active = key === props.value;
        return (
          <button
            key={key}
            role="tab"
            aria-current={active ? "page" : undefined}
            onClick={() => props.onChange(key)}
            className={`px-3 py-1.5 text-xs ${
              active
                ? "border-b-2 border-zinc-900 font-semibold dark:border-zinc-100"
                : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
            }`}
          >
            {LABELS[key]}
          </button>
        );
      })}
    </nav>
  );
}
