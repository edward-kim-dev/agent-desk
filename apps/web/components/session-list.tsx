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
    return <div className="text-xs text-zinc-500">no active sessions</div>;
  }

  return (
    <ul className="flex flex-col gap-1">
      {scoped.map((s) => (
        <li
          key={s.id}
          className={`flex items-center justify-between rounded px-2 py-1 text-sm ${
            props.selectedId === s.id ? "bg-zinc-200 dark:bg-zinc-800" : ""
          }`}
        >
          <button
            className="flex-1 text-left"
            onClick={() => props.onSelect(s.id)}
            title={`${s.cli ?? "?"} • ${s.attachedClients} client(s)`}
          >
            <span className="font-mono">{s.tmuxName}</span>
            <span className="ml-2 text-xs text-zinc-500">
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
