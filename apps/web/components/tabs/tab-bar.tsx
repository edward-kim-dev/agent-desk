"use client";
import { TAB_LABELS, TAB_ORDER, type TabKey } from "./types";

const STUB: Partial<Record<TabKey, boolean>> = {
  graph: true,
};

export function TabBar(props: {
  value: TabKey;
  onChange: (next: TabKey) => void;
}) {
  return (
    <nav
      role="tablist"
      aria-label="agent-desk 모드"
      className="flex items-center"
    >
      {TAB_ORDER.map((key) => {
        const active = key === props.value;
        return (
          <button
            key={key}
            role="tab"
            aria-current={active ? "page" : undefined}
            onClick={() => props.onChange(key)}
            className={[
              "ml-7 first:ml-0 text-[11px] uppercase tracking-[0.22em]",
              "text-[#1a1208] transition-opacity",
              active ? "opacity-100 font-semibold" : "opacity-65 hover:opacity-100",
              "bg-transparent border-0 p-0 cursor-pointer",
            ].join(" ")}
          >
            {TAB_LABELS[key]}
            {STUB[key] && (
              <span
                aria-hidden
                className="ml-1.5 normal-case tracking-normal opacity-50"
              >
                (wip)
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}
