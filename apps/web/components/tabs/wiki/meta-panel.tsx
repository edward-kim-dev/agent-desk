"use client";

export interface WikiMetaFile {
  path: string;
  layer: string | null;
  claimCounts: { source: number; analysis: number; unverified: number; gap: number };
}

export function WikiMetaPanel(props: {
  openFile: WikiMetaFile | null;
  brokenLinks: string[];
}) {
  if (!props.openFile) {
    return (
      <aside className="border-l p-3 text-xs text-zinc-500">
        문서가 선택되지 않음
      </aside>
    );
  }
  const f = props.openFile;
  return (
    <aside className="flex flex-col gap-3 border-l p-3 text-xs">
      <div>
        <div className="font-mono text-zinc-700 dark:text-zinc-300">{f.path}</div>
        <div className="mt-1 text-zinc-500">layer: {f.layer ?? "—"}</div>
      </div>
      <div>
        <div className="mb-1 font-semibold text-zinc-700 dark:text-zinc-300">claims</div>
        <ul className="grid grid-cols-2 gap-x-3 text-zinc-600 dark:text-zinc-400">
          <li>source: {f.claimCounts.source}</li>
          <li>analysis: {f.claimCounts.analysis}</li>
          <li>unverified: {f.claimCounts.unverified}</li>
          <li>gap: {f.claimCounts.gap}</li>
        </ul>
      </div>
      <div>
        <div className="mb-1 font-semibold text-zinc-700 dark:text-zinc-300">links</div>
        <div className="text-zinc-600 dark:text-zinc-400">
          backlinks: — · broken: {props.brokenLinks.length}
        </div>
        {props.brokenLinks.length > 0 && (
          <ul className="mt-1 text-red-600">
            {props.brokenLinks.map((l) => (
              <li key={l}>↯ {l}</li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}
