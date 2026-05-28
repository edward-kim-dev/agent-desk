"use client";

interface StepReadyOverlayProps {
  stepTitle: string;
  nextStepTitle: string | null;
  isLastStep: boolean;
  onAdvance: () => void;
  onDismiss: () => void;
}

export function StepReadyOverlay({
  stepTitle,
  nextStepTitle,
  isLastStep,
  onAdvance,
  onDismiss,
}: StepReadyOverlayProps) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="absolute inset-0 z-10 flex items-center justify-center bg-[rgba(26,18,8,0.32)] backdrop-blur-sm"
    >
      <div className="flex w-full max-w-sm flex-col gap-3 px-4">
        {/* floating label above card — same pattern as WorkPackageModal */}
        <div className="flex items-baseline justify-between gap-2 px-1 text-white drop-shadow-[0_1px_2px_rgba(26,18,8,0.6)]">
          <h2 className="text-[10px] font-semibold uppercase tracking-[0.24em]">
            Step complete
          </h2>
          <span className="text-[10px] uppercase tracking-[0.22em] opacity-75">
            {isLastStep ? "final step" : "next step ready"}
          </span>
        </div>

        {/* card */}
        <div className="flex flex-col gap-4 border border-[var(--hill-rule)] bg-[var(--background)] p-4">
          <div>
            <p className="text-[13px] font-semibold text-[#1a1208]">
              {stepTitle} 완료
            </p>
            {nextStepTitle && !isLastStep && (
              <p className="mt-1 text-[11px] text-[#1a1208]/55">
                다음: {nextStepTitle}
              </p>
            )}
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onAdvance}
              className="flex-1 border border-[#1a1208] bg-[#1a1208] px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-white transition-all hover:bg-[#1a1208]/90 active:translate-y-[1px]"
            >
              {isLastStep ? "완료로 처리" : "다음 단계로"}
            </button>
            <button
              type="button"
              onClick={onDismiss}
              className="flex-1 border border-[var(--hill-rule)] px-3 py-2 text-[11px] text-[#1a1208]/55 transition-all hover:border-[rgba(26,18,8,0.35)] hover:bg-[var(--hill-bg-2)] active:translate-y-[1px]"
            >
              지금은 괜찮아요
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
