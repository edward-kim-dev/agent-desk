"use client";
import type { FieldSpec } from "@agent-desk/shared";
import { PackageStartForm } from "./package-start-form";

export function AdvanceFormOverlay(props: {
  nextStepTitle: string;
  fields: FieldSpec[];
  busy?: boolean;
  errorMessage?: string | null;
  optionsByField?: Record<string, string[]>;
  optionsLoading?: boolean;
  onSubmit: (inputs: Record<string, string>) => void | Promise<void>;
  onCancel: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Next step form"
      className="absolute inset-0 z-20 flex items-center justify-center bg-[rgba(26,18,8,0.32)] backdrop-blur-sm"
    >
      <div className="flex w-full max-w-lg flex-col gap-3">
        <div className="flex items-baseline justify-between gap-2 px-1 text-white drop-shadow-[0_1px_2px_rgba(26,18,8,0.6)]">
          <h2 className="text-[10px] font-semibold uppercase tracking-[0.24em]">
            Next step — {props.nextStepTitle}
          </h2>
          <span className="text-[10px] uppercase tracking-[0.22em] opacity-75">
            form
          </span>
        </div>
        <PackageStartForm
          fields={props.fields}
          busy={props.busy}
          errorMessage={props.errorMessage}
          submitLabel="다음 단계로"
          optionsByField={props.optionsByField}
          optionsLoading={props.optionsLoading}
          onBack={props.onCancel}
          onDismiss={props.onCancel}
          onSubmit={props.onSubmit}
        />
      </div>
    </div>
  );
}
