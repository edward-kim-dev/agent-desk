"use client";
import type { WorkspaceDto } from "@agent-desk/shared";

export function WorkspaceSwitcher(props: {
  workspaces: WorkspaceDto[];
  activeId: number | null;
  onSelect: (id: number) => void;
}) {
  const active = props.workspaces.find((w) => w.id === props.activeId);
  if (props.workspaces.length === 0) {
    return <div className="text-sm text-zinc-500">no workspace yet</div>;
  }
  const others = props.workspaces.filter((w) => w.id !== props.activeId);
  return (
    <details className="relative">
      <summary className="cursor-pointer list-none">
        <button className="rounded border px-3 py-1 text-sm">
          {active?.name ?? "select workspace"}
        </button>
      </summary>
      <ul className="absolute top-full left-0 z-10 mt-1 w-48 rounded border bg-white shadow dark:bg-zinc-900">
        {others.map((w) => (
          <li key={w.id}>
            <button
              className="block w-full px-3 py-1 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
              onClick={() => props.onSelect(w.id)}
            >
              {w.name}
              <span className="ml-2 text-xs text-zinc-500">{w.path}</span>
            </button>
          </li>
        ))}
      </ul>
    </details>
  );
}
