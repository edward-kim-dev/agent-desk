"use client";
import type { WorkPackageArtifactDto, WorkPackageDto } from "@agent-desk/shared";
import { ArtifactList } from "./artifact-list";
import { btnGhost, btnPrimary } from "./ui/button-classes";

export function ActivePackageCard(props: {
  instance: WorkPackageDto;
  stepTitles: string[];
  packageTitle: string;
  artifacts: WorkPackageArtifactDto[];
  busy?: boolean;
  onAdvance: (expectedCurrentStep: number) => void | Promise<void>;
  onComplete: () => void | Promise<void>;
  onScan?: () => void | Promise<void>;
}) {
  const total = props.stepTitles.length;
  const current = props.instance.currentStep;
  const isLast = current >= total;
  const currentTitle = props.stepTitles[current - 1] ?? "";

  return (
    <section
      aria-label="Active work package"
      className="flex flex-col gap-2 border border-[var(--hill-rule)] bg-[var(--hill-bg-2)] p-3"
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.2em]">
          {props.packageTitle}
        </span>
        <span className="text-[10px] uppercase tracking-[0.2em] opacity-50">
          Step {current}/{total} · {currentTitle}
        </span>
      </div>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <ArtifactList artifacts={props.artifacts} />
        </div>
        {props.onScan && (
          <button
            type="button"
            aria-label="Scan for new artifacts"
            title="Scan for new artifacts"
            onClick={() => props.onScan?.()}
            disabled={props.busy}
            className="shrink-0 border border-[var(--hill-rule)] px-1.5 py-0.5 text-[11px] leading-none transition-colors hover:bg-[var(--hill-bg-2)] hover:border-[#1a1208] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            ↻
          </button>
        )}
      </div>
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          className={btnGhost}
          onClick={() => props.onComplete()}
          disabled={props.busy}
        >
          Complete
        </button>
        <button
          type="button"
          className={btnPrimary}
          onClick={() => props.onAdvance(current)}
          disabled={props.busy || isLast}
        >
          Next step
        </button>
      </div>
    </section>
  );
}
