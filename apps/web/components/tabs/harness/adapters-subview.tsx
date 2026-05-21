"use client";

const ADAPTERS = [
  { name: "claude", target: "~/.claude/agents/" },
  { name: "gemini", target: "~/.gemini/agents/" },
  { name: "codex", target: "~/.codex/agents/" },
];

export function AdaptersSubview() {
  return (
    <div data-stub="true" className="grid h-full grid-cols-3 gap-3 p-3 text-sm">
      {ADAPTERS.map((a) => (
        <article key={a.name} className="rounded border p-3">
          <h3 className="font-semibold">{a.name}</h3>
          <div className="mt-1 text-xs text-zinc-500">Export target</div>
          <div className="font-mono text-xs">{a.target}</div>
          <button disabled className="mt-3 rounded border px-2 py-1 text-xs">
            Export
          </button>
        </article>
      ))}
    </div>
  );
}
