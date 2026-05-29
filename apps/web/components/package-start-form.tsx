"use client";
import { useEffect, useId, useRef, useState } from "react";
import type { FieldSpec } from "@agent-desk/shared";
import { Field, fieldControl } from "./ui/field";
import { btnGhost, btnPrimary } from "./ui/button-classes";

export function PackageStartForm(props: {
  fields: FieldSpec[];
  busy?: boolean;
  errorMessage?: string | null;
  submitLabel?: string;
  /** `kind: "select"` 필드의 동적 옵션 — field name → 옵션 목록. */
  optionsByField?: Record<string, string[]>;
  optionsLoading?: boolean;
  onBack: () => void;
  onSubmit: (payload: Record<string, string>) => void | Promise<void>;
  onDismiss: () => void;
}) {
  const baseId = useId();
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(props.fields.map((f) => [f.name, ""])),
  );
  const firstRef = useRef<
    HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null
  >(null);
  useEffect(() => {
    queueMicrotask(() => firstRef.current?.focus());
  }, []);

  const requiredMissing = props.fields.some(
    (f) => f.required && !values[f.name]?.trim(),
  );
  const canSubmit = !requiredMissing && !props.busy;

  return (
    <form
      role="form"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!canSubmit) return;
        const trimmed: Record<string, string> = {};
        for (const f of props.fields) {
          const v = values[f.name]?.trim();
          if (v) trimmed[f.name] = v;
        }
        await props.onSubmit(trimmed);
      }}
      className="flex w-full max-w-lg flex-col gap-4 border border-[var(--hill-rule)] bg-[var(--background)] p-6 shadow-[0_24px_72px_-32px_rgba(26,18,8,0.45)]"
    >
      {props.fields.map((f, i) => {
        const id = `${baseId}-${f.name}`;
        const onChange = (
          e: React.ChangeEvent<
            HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
          >,
        ) => setValues((v) => ({ ...v, [f.name]: e.target.value }));
        return (
          <Field key={f.name} htmlFor={id} label={f.label} hint={f.hint}>
            {f.kind === "select" ? (
              (() => {
                const options = props.optionsByField?.[f.name] ?? [];
                const empty = options.length === 0;
                return (
                  <select
                    ref={
                      i === 0
                        ? (firstRef as React.RefObject<HTMLSelectElement>)
                        : undefined
                    }
                    id={id}
                    required={f.required}
                    disabled={empty}
                    value={values[f.name]}
                    onChange={onChange}
                    className={fieldControl}
                  >
                    <option value="" disabled>
                      {props.optionsLoading
                        ? "불러오는 중…"
                        : empty
                          ? "사용 가능한 문서 없음"
                          : "선택…"}
                    </option>
                    {options.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                );
              })()
            ) : f.kind === "text" ? (
              <input
                ref={
                  i === 0
                    ? (firstRef as React.RefObject<HTMLInputElement>)
                    : undefined
                }
                id={id}
                type="text"
                required={f.required}
                maxLength={f.maxLength}
                placeholder={f.placeholder}
                value={values[f.name]}
                onChange={onChange}
                className={fieldControl}
              />
            ) : (
              <textarea
                ref={
                  i === 0
                    ? (firstRef as React.RefObject<HTMLTextAreaElement>)
                    : undefined
                }
                id={id}
                rows={f.rows ?? 3}
                maxLength={f.maxLength}
                placeholder={f.placeholder}
                value={values[f.name]}
                onChange={onChange}
                className={`${fieldControl} resize-y`}
              />
            )}
          </Field>
        );
      })}

      {props.errorMessage && (
        <div role="alert" className="text-[11px] text-red-700">
          {props.errorMessage}
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          className={btnGhost}
          onClick={props.onBack}
          disabled={props.busy}
        >
          Back
        </button>
        <div className="flex gap-2">
          <button
            type="button"
            className={btnGhost}
            onClick={props.onDismiss}
            disabled={props.busy}
          >
            Skip
          </button>
          <button type="submit" disabled={!canSubmit} className={btnPrimary}>
            {props.busy ? "…" : (props.submitLabel ?? "Start work package")}
          </button>
        </div>
      </div>
    </form>
  );
}
