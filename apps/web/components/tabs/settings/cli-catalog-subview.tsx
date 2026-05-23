"use client";

const CATALOG = [
  { name: "claude", command: "claude", defaultArgs: "" },
  { name: "gemini", command: "gemini", defaultArgs: "" },
  { name: "codex", command: "codex", defaultArgs: "" },
];

export function CliCatalogSubview() {
  return (
    <div data-stub="true" className="p-4 text-sm">
      <table className="w-full">
        <thead className="border-b border-[var(--hill-rule)] text-left text-xs uppercase opacity-55">
          <tr>
            <th scope="col" className="px-3 py-2">name</th>
            <th scope="col" className="px-3 py-2">command</th>
            <th scope="col" className="px-3 py-2">default args</th>
          </tr>
        </thead>
        <tbody className="text-xs">
          {CATALOG.map((c) => (
            <tr key={c.name} className="border-b border-[var(--hill-rule)]">
              <td className="px-3 py-2 font-mono">{c.name}</td>
              <td className="px-3 py-2 font-mono">{c.command}</td>
              <td className="px-3 py-2 opacity-55">{c.defaultArgs || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
