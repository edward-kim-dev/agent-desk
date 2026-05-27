"use client";
import type { WorkPackageArtifactDto } from "@agent-desk/shared";

export function ArtifactList(props: { artifacts: WorkPackageArtifactDto[] }) {
  if (props.artifacts.length === 0) {
    return <div className="text-[11px] opacity-50">아직 산출물 없음</div>;
  }
  return (
    <ul className="flex flex-col gap-1">
      {props.artifacts.map((a) => (
        <li
          key={a.id}
          className="flex items-center justify-between gap-2 text-[11px]"
        >
          <span className="truncate font-mono">{a.filePath}</span>
          {a.driftDetected && (
            <span className="px-1.5 py-0.5 border border-[var(--hill-rule)] text-[9px] uppercase tracking-[0.15em] opacity-70">
              수정됨
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
