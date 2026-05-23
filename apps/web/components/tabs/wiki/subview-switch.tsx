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
    <nav role="tablist" aria-label="위키 서브뷰" className="flex items-stretch">
      {ORDER.map((key) => {
        const active = key === props.value;
        return (
          <button
            key={key}
            role="tab"
            aria-current={active ? "page" : undefined}
            onClick={() => props.onChange(key)}
            className={[
              "ml-7 first:ml-0 cursor-pointer bg-transparent",
              "text-[10px] uppercase tracking-[0.24em] text-[#1a1208]",
              "border-t-2 border-x-0 border-b-0 pt-2 pb-0 px-0",
              "transition-opacity",
              active
                ? "border-[#1a1208] opacity-100 font-semibold"
                : "border-transparent opacity-55 hover:opacity-100",
            ].join(" ")}
          >
            {LABELS[key]}
          </button>
        );
      })}
    </nav>
  );
}
