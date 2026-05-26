"use client";
import type { SessionDto } from "@agent-desk/shared";
import { btnGhostDanger } from "./ui/button-classes";

export function SessionList(props: {
  sessions: SessionDto[];
  activeWorkspaceId: number | null;
  selectedId: number | null;
  onSelect: (id: number) => void;
  onKill: (id: number) => void;
}) {
  const scoped = props.sessions
    .filter((s) => s.status === "active")
    .filter(
      (s) =>
        props.activeWorkspaceId == null ||
        s.workspaceId === props.activeWorkspaceId,
    );

  if (scoped.length === 0) {
    return (
      <p className="px-1 text-[11px] opacity-50">no active sessions</p>
    );
  }

  return (
    <ul
      role="list"
      className="flex flex-col divide-y divide-[var(--hill-rule)] border border-[var(--hill-rule)]"
    >
      {scoped.map((s) => {
        const selected = props.selectedId === s.id;
        return (
          <li
            key={s.id}
            className={[
              "relative flex items-start justify-between gap-2 px-3 py-2.5",
              selected
                ? "bg-[#1a1208]/[0.05]"
                : "hover:bg-[#1a1208]/[0.02]",
            ].join(" ")}
          >
            {selected && (
              <span
                aria-hidden
                className="absolute inset-y-0 left-0 w-[2px] bg-[#1a1208]"
              />
            )}
            <button
              type="button"
              onClick={() => props.onSelect(s.id)}
              aria-pressed={selected}
              className="min-w-0 flex-1 cursor-pointer border-0 bg-transparent p-0 text-left"
              title={`${s.cli ?? "?"} • ${s.attachedClients} client(s)`}
            >
              <div className="truncate font-mono text-[12.5px] text-[#1a1208]">
                {s.tmuxName}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 text-[10px] uppercase tracking-[0.22em] opacity-55">
                <span>{s.cli ?? "—"}</span>
                {s.attachedClients > 0 && (
                  <span>· {s.attachedClients} client{s.attachedClients === 1 ? "" : "s"}</span>
                )}
                {s.adopted && <span>· adopted</span>}
              </div>
            </button>
            <button
              type="button"
              onClick={() => props.onKill(s.id)}
              className={`${btnGhostDanger} px-2 py-1`}
              aria-label={`kill ${s.tmuxName}`}
            >
              Kill
            </button>
          </li>
        );
      })}
    </ul>
  );
}
