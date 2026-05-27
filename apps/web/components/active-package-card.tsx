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
      <ArtifactList artifacts={props.artifacts} />
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
