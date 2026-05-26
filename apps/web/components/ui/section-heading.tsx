"use client";
import type { ReactNode } from "react";

/**
 * Settings·Terminal·Wiki 등에서 공통으로 쓰는 섹션 헤딩.
 * uppercase 0.24em tracking, 옵션으로 count 와 우측 액션 슬롯을 받는다.
 */
export function SectionHeading(props: {
  label: string;
  count?: number;
  /** 우측에 들어갈 액션 (예: + new 버튼) */
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={[
        "flex items-baseline justify-between gap-3",
        "text-[10px] font-semibold uppercase tracking-[0.24em] text-[#1a1208]",
        props.className ?? "",
      ].join(" ")}
    >
      <span className="flex items-baseline gap-2">
        <span>{props.label}</span>
        {props.count != null && (
          <span className="opacity-40">({props.count})</span>
        )}
      </span>
      {props.action && <span className="flex items-center">{props.action}</span>}
    </div>
  );
}
