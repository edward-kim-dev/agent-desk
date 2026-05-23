"use client";
import { useEffect, useRef, useState } from "react";
import type { WorkspaceDto } from "@agent-desk/shared";

export function WorkspaceSwitcher(props: {
  workspaces: WorkspaceDto[];
  activeId: number | null;
  onSelect: (id: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const active = props.workspaces.find((w) => w.id === props.activeId);
  if (props.workspaces.length === 0) {
    return (
      <div className="text-[10px] uppercase tracking-[0.24em] opacity-45">
        no workspace yet
      </div>
    );
  }
  const others = props.workspaces.filter((w) => w.id !== props.activeId);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={[
          "text-[10px] uppercase tracking-[0.24em] opacity-55 hover:opacity-100",
          "border-t-2 border-x-0 border-b-0 border-transparent",
          "pt-2 pb-0 px-0 bg-transparent cursor-pointer",
        ].join(" ")}
      >
        workspace · {active?.name ?? "select"} ⌄
      </button>
      {open && (
        <div
          className={[
            "absolute top-full left-0 z-10 mt-3 w-80 bg-white",
            "border border-[var(--hill-rule)]",
            "shadow-[0_12px_28px_-12px_rgba(26,18,8,0.18)]",
          ].join(" ")}
        >
          <ul
            role="listbox"
            className="scrollbar-hairline max-h-80 overflow-y-auto py-1"
          >
            {active && (
              <li>
                <div
                  aria-selected
                  className={[
                    "flex items-start justify-between gap-3",
                    "px-5 py-3 bg-[#1a1208]/[0.04] cursor-default",
                  ].join(" ")}
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm normal-case tracking-normal text-[#1a1208]">
                      {active.name}
                    </div>
                    <div className="mt-1 truncate text-[10px] font-mono normal-case tracking-normal opacity-50">
                      {active.path}
                    </div>
                  </div>
                  <svg
                    aria-hidden
                    viewBox="0 0 16 16"
                    className="mt-1 h-3 w-3 flex-shrink-0 text-[#1a1208]"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      d="M3 8.5L6.5 12L13 4.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
              </li>
            )}
            {active && others.length > 0 && (
              <li
                aria-hidden
                className="my-1 border-t border-[var(--hill-rule)]"
              />
            )}
            {others.map((w) => (
              <li key={w.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={false}
                  onClick={() => {
                    props.onSelect(w.id);
                    setOpen(false);
                  }}
                  className={[
                    "group block w-full cursor-pointer border-0 bg-transparent text-left",
                    "px-5 py-3 transition-colors hover:bg-[#1a1208]/[0.04]",
                  ].join(" ")}
                >
                  <div className="truncate text-sm normal-case tracking-normal text-[#1a1208]">
                    {w.name}
                  </div>
                  <div className="mt-1 truncate text-[10px] font-mono normal-case tracking-normal opacity-50 group-hover:opacity-75">
                    {w.path}
                  </div>
                </button>
              </li>
            ))}
            {others.length === 0 && (
              <li className="px-5 py-3 text-[11px] normal-case tracking-normal opacity-55">
                no other workspaces
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
