"use client";
import type { SessionDto } from "@agent-desk/shared";

export function SessionList(props: {
  sessions: SessionDto[];
  activeWorkspaceId: number | null;
  selectedId: number | null;
  onSelect: (id: number) => void;
  onKill: (id: number) => void;
}) {
  const scoped = props.sessions
    .filter((s) => s.status === "active")
    .filter((s) => props.activeWorkspaceId == null || s.workspaceId === props.activeWorkspaceId);

  if (scoped.length === 0) {
    return <div className="text-xs opacity-55">no active sessions</div>;
  }

  return (
    <ul className="flex flex-col gap-1">
      {scoped.map((s) => (
        <li
          key={s.id}
          className={`flex items-center justify-between px-2 py-1 text-sm ${
            props.selectedId === s.id ? "bg-[#1a1208]/[0.08]" : ""
          }`}
        >
          <button
            className="min-w-0 flex-1 truncate text-left"
            onClick={() => props.onSelect(s.id)}
            title={`${s.cli ?? "?"} • ${s.attachedClients} client(s)`}
          >
            <span className="font-mono">{s.tmuxName}</span>
            <span className="ml-2 text-xs opacity-55">
              {s.cli}
              {s.adopted ? " (adopted)" : ""}
            </span>
          </button>
          <button
            className="ml-2 text-xs text-red-600"
            onClick={() => props.onKill(s.id)}
          >
            kill
          </button>
        </li>
      ))}
    </ul>
  );
}
