"use client";

export type HarnessSubview = "memory" | "hooks" | "agents" | "adapters";

const LABELS: Record<HarnessSubview, string> = {
  memory: "Memory",
  hooks: "Hooks",
  agents: "Sub-agents",
  adapters: "Adapters",
};
const ORDER: HarnessSubview[] = ["memory", "hooks", "agents", "adapters"];

export function HarnessSubviewSwitch(props: {
  value: HarnessSubview;
  onChange: (next: HarnessSubview) => void;
}) {
  return (
    <nav role="tablist" aria-label="하네스 서브뷰" className="flex gap-1 border-b px-2">
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
