"use client";
import type { PackageCatalogEntry } from "@agent-desk/shared";

export function PackagePicker(props: {
  packages: PackageCatalogEntry[];
  sessionCli: string;
  onSelect: (id: string) => void;
}) {
  if (props.packages.length === 0) {
    return (
      <div className="p-4 text-[11px] opacity-60">No packages available.</div>
    );
  }
  return (
    <ul className="flex flex-col gap-2 border border-[var(--hill-rule)] bg-[var(--background)] p-4">
      {props.packages.map((p) => {
        const cliOk =
          p.cliRequirement === "any" || p.cliRequirement === props.sessionCli;
        return (
          <li key={p.id}>
            <button
              type="button"
              disabled={!cliOk}
              title={!cliOk ? `${p.cliRequirement} CLI 필요` : undefined}
              aria-label={p.title}
              className={[
                "group w-full text-left p-3 border border-[var(--hill-rule)] bg-[var(--background)]",
                "transition-all duration-150",
                "hover:border-[#1a1208] hover:bg-[var(--hill-bg-2)] hover:shadow-[0_2px_8px_-2px_rgba(26,18,8,0.18)]",
                "focus-visible:outline-none focus-visible:border-[#1a1208] focus-visible:ring-2 focus-visible:ring-[rgba(26,18,8,0.18)]",
                "active:translate-y-[1px]",
                "disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-[var(--hill-rule)] disabled:hover:bg-[var(--background)] disabled:hover:shadow-none",
              ].join(" ")}
              onClick={() => props.onSelect(p.id)}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-semibold">{p.title}</span>
                <span className="text-[10px] uppercase tracking-[0.2em] opacity-50">
                  {p.stepTitles.join(" → ")}
                </span>
              </div>
              <div className="mt-1 text-[11px] opacity-60">{p.description}</div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
