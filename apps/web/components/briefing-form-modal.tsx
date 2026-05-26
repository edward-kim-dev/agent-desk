"use client";
import { useEffect, useId, useRef, useState } from "react";
import type { BrainstormingBriefRequest } from "@agent-desk/shared";
import { Field, fieldControl } from "./ui/field";
import { btnGhost, btnPrimary } from "./ui/button-classes";

/**
 * 새로 만든 (아직 briefedAt 이 없는) Claude 세션을 처음 클릭했을 때 터미널 위에
 * 떠 있는 모달. 사용자가 brainstorming 시 필요한 최소 정보를 입력하면 게이트웨이
 * 가 `/brainstorming <one-liner>` 를 tmux send-keys 로 주입한다.
 */
export function BriefingFormModal(props: {
  open: boolean;
  busy?: boolean;
  errorMessage?: string | null;
  onSubmit: (payload: BrainstormingBriefRequest) => void | Promise<void>;
  onDismiss: () => void;
}) {
  const topicId = useId();
  const contextId = useId();
  const constraintsId = useId();
  const goalsId = useId();
  const [topic, setTopic] = useState("");
  const [context, setContext] = useState("");
  const [constraints, setConstraints] = useState("");
  const [goals, setGoals] = useState("");
  const firstFieldRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (props.open) {
      // reset whenever modal re-opens for a fresh session
      setTopic("");
      setContext("");
      setConstraints("");
      setGoals("");
      // focus the required field next tick so the dialog reads naturally
      queueMicrotask(() => firstFieldRef.current?.focus());
    }
  }, [props.open]);

  useEffect(() => {
    if (!props.open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") props.onDismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [props.open, props]);

  if (!props.open) return null;

  const canSubmit = topic.trim().length > 0 && !props.busy;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="briefing-title"
      className="absolute inset-0 z-20 flex items-center justify-center bg-[rgba(26,18,8,0.32)] backdrop-blur-sm"
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!canSubmit) return;
          await props.onSubmit({
            topic: topic.trim(),
            context: context.trim() || undefined,
            constraints: constraints.trim() || undefined,
            goals: goals.trim() || undefined,
          });
        }}
        className="flex w-full max-w-lg flex-col gap-4 border border-[var(--hill-rule)] bg-[var(--background)] p-6 shadow-[0_24px_72px_-32px_rgba(26,18,8,0.45)]"
      >
        <div className="flex items-baseline justify-between gap-2">
          <h2
            id="briefing-title"
            className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[#1a1208]"
          >
            Brainstorming brief
          </h2>
          <span className="text-[10px] uppercase tracking-[0.22em] opacity-40">
            /brainstorming
          </span>
        </div>

        <p className="text-[11px] leading-[1.6] opacity-55">
          시작하기 전에 최소한의 컨텍스트만 알려주세요. Claude 가{" "}
          <span className="font-mono">/brainstorming</span> 스킬과 함께 이 정보를 받아 본격적인 대화를 시작합니다.
        </p>

        <Field
          htmlFor={topicId}
          label="What are we brainstorming?"
          hint="필수. 한 줄로 — 예: 'agent-desk 에 알림 시스템 추가'"
        >
          <input
            ref={firstFieldRef}
            id={topicId}
            type="text"
            required
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            className={fieldControl}
            placeholder="Add a notifications system to agent-desk"
            maxLength={500}
          />
        </Field>

        <Field
          htmlFor={contextId}
          label="Context (optional)"
          hint="배경, 이전 결정, 사용자가 미리 알리고 싶은 것"
        >
          <textarea
            id={contextId}
            rows={3}
            value={context}
            onChange={(e) => setContext(e.target.value)}
            className={`${fieldControl} resize-y`}
            maxLength={2000}
          />
        </Field>

        <Field
          htmlFor={constraintsId}
          label="Constraints (optional)"
          hint="기술 스택, 시간 예산, 범위에서 빠지는 것"
        >
          <textarea
            id={constraintsId}
            rows={2}
            value={constraints}
            onChange={(e) => setConstraints(e.target.value)}
            className={`${fieldControl} resize-y`}
            maxLength={2000}
          />
        </Field>

        <Field
          htmlFor={goalsId}
          label="Success criteria (optional)"
          hint="brainstorming 이 끝났을 때 어떤 산출물·결정이 있어야 하는지"
        >
          <textarea
            id={goalsId}
            rows={2}
            value={goals}
            onChange={(e) => setGoals(e.target.value)}
            className={`${fieldControl} resize-y`}
            maxLength={2000}
          />
        </Field>

        {props.errorMessage && (
          <div role="alert" className="text-[11px] text-red-700">
            {props.errorMessage}
          </div>
        )}

        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            className={btnGhost}
            onClick={props.onDismiss}
            disabled={props.busy}
          >
            Skip
          </button>
          <button
            type="submit"
            disabled={!canSubmit}
            className={btnPrimary}
          >
            {props.busy ? "…" : "Start brainstorming"}
          </button>
        </div>
      </form>
    </div>
  );
}
