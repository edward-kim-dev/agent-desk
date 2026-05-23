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
      <aside className="border-l border-[var(--hill-rule)] p-3 text-xs opacity-55">
        문서가 선택되지 않음
      </aside>
    );
  }
  const f = props.openFile;
  return (
    <aside className="flex flex-col gap-3 border-l border-[var(--hill-rule)] p-3 text-xs">
      <div>
        <div className="font-mono opacity-75">{f.path}</div>
        <div className="mt-1 opacity-55">layer: {f.layer ?? "—"}</div>
      </div>
      <div>
        <div className="mb-1 font-semibold opacity-75">claims</div>
        <ul className="grid grid-cols-2 gap-x-3 opacity-65">
          <li>source: {f.claimCounts.source}</li>
          <li>analysis: {f.claimCounts.analysis}</li>
          <li>unverified: {f.claimCounts.unverified}</li>
          <li>gap: {f.claimCounts.gap}</li>
        </ul>
      </div>
      <div>
        <div className="mb-1 font-semibold opacity-75">links</div>
        <div className="opacity-65">
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
