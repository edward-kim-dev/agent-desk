"use client";

export type SettingsSubview =
  | "general"
  | "database"
  | "cli-catalog"
  | "auth"
  | "about";

const LABELS: Record<SettingsSubview, string> = {
  general: "General",
  database: "Database",
  "cli-catalog": "CLI Catalog",
  auth: "Auth",
  about: "About",
};
const ORDER: SettingsSubview[] = ["general", "database", "cli-catalog", "auth", "about"];

export function SettingsSubviewSwitch(props: {
  value: SettingsSubview;
  onChange: (next: SettingsSubview) => void;
}) {
  return (
    <nav role="tablist" aria-label="설정 서브뷰" className="flex gap-1 border-b px-2">
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
