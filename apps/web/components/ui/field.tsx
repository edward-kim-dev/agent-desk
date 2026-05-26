"use client";
import type { ReactNode } from "react";

/**
 * Label + control 묶음. uppercase 0.22em tracking 라벨 + 하이라인 박스 인풋이 표준.
 * 입력 요소 자체는 children 으로 받고, fieldClass 헬퍼로 동일한 스타일을 공유한다.
 */
export function Field(props: {
  htmlFor?: string;
  label: string;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={["flex flex-col gap-1.5", props.className ?? ""].join(" ")}>
      <label
        htmlFor={props.htmlFor}
        className="text-[10px] font-semibold uppercase tracking-[0.22em] opacity-55"
      >
        {props.label}
      </label>
      {props.children}
      {props.hint && (
        <p className="text-[11px] leading-[1.5] opacity-45">{props.hint}</p>
      )}
    </div>
  );
}

/**
 * `<input>` / `<select>` / `<textarea>` 에 동일한 톤을 적용하기 위한 className.
 * - 하이라인 박스 (rounded 없음)
 * - 흰 배경, 다크 텍스트
 * - 포커스 시 진한 보더
 *
 * 호출부에서 `font-mono` 등 변형을 자유롭게 덧붙일 수 있다.
 */
export const fieldControl = [
  "border border-[var(--hill-rule)] bg-white px-3 py-2 text-[13px] text-[#1a1208]",
  "outline-none placeholder:opacity-30",
  "focus:border-[#1a1208]",
].join(" ");
