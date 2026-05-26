"use client";

export type SettingsSubview =
  | "general"
  | "workspaces"
  | "database"
  | "cli-catalog"
  | "auth"
  | "about";

const LABELS: Record<SettingsSubview, string> = {
  general: "General",
  workspaces: "Workspaces",
  database: "Database",
  "cli-catalog": "CLI Catalog",
  auth: "Auth",
  about: "About",
};
const ORDER: SettingsSubview[] = [
  "general",
  "workspaces",
  "database",
  "cli-catalog",
  "auth",
  "about",
];
const STUB: Partial<Record<SettingsSubview, boolean>> = {
  general: true,
  database: true,
  "cli-catalog": true,
  auth: true,
  about: true,
};

export function SettingsSubviewSwitch(props: {
  value: SettingsSubview;
  onChange: (next: SettingsSubview) => void;
}) {
  return (
    <nav role="tablist" aria-label="설정 서브뷰" className="flex items-stretch">
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
