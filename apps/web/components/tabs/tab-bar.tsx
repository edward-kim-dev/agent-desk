"use client";
import { TAB_LABELS, TAB_ORDER, type TabKey } from "./types";

export function TabBar(props: {
  value: TabKey;
  onChange: (next: TabKey) => void;
}) {
  return (
    <nav
      role="tablist"
      aria-label="agent-desk 모드"
      className="flex items-center gap-1 border-b px-2"
    >
      {TAB_ORDER.map((key) => {
        const active = key === props.value;
        return (
          <button
            key={key}
            role="tab"
            aria-current={active ? "page" : undefined}
            onClick={() => props.onChange(key)}
            className={`px-3 py-2 text-sm ${
              active
                ? "border-b-2 border-zinc-900 font-semibold dark:border-zinc-100"
                : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
            }`}
          >
            {TAB_LABELS[key]}
          </button>
        );
      })}
    </nav>
  );
}
