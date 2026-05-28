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
    <div className="absolute bottom-4 left-4 right-4 z-10 rounded-lg border border-border bg-card p-4 shadow-lg backdrop-blur-sm">
      <div className="mb-3">
        <p className="text-sm font-medium text-foreground">
          📦 <span className="font-semibold">{stepTitle}</span> 완료 감지
        </p>
        {nextStepTitle && !isLastStep && (
          <p className="mt-1 text-xs text-muted-foreground">
            다음 단계: {nextStepTitle}
          </p>
        )}
      </div>
      <div className="flex gap-2">
        {isLastStep ? (
          <button
            type="button"
            onClick={onAdvance}
            className="flex-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
          >
            완료로 처리
          </button>
        ) : (
          <button
            type="button"
            onClick={onAdvance}
            className="flex-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
          >
            다음 단계로
          </button>
        )}
        <button
          type="button"
          onClick={onDismiss}
          className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted"
        >
          지금은 괜찮아요
        </button>
      </div>
    </div>
  );
}
