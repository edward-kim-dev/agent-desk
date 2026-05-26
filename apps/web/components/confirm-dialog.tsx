"use client";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { fieldControl } from "./ui/field";
import {
  btnGhost,
  btnPrimary,
  btnPrimaryDanger,
} from "./ui/button-classes";

export interface RequireTypingSpec {
  /** 사용자가 정확히 입력해야 하는 값 (예: 워크스페이스 이름) */
  value: string;
  /** 사용자가 입력해야 한다는 라벨 */
  label?: string;
  placeholder?: string;
}

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  /** 본문 — 짧은 설명 한두 문단 */
  body: ReactNode;
  /** 확인 버튼 라벨 */
  confirmLabel: string;
  /** 취소 버튼 라벨 */
  cancelLabel?: string;
  /** 'danger' 일 때 빨간색 톤 */
  tone?: "default" | "danger";
  /** 입력 검증 필요 (예: 영구 삭제 시 이름 타이핑) */
  requireTyping?: RequireTypingSpec;
  /** 확인 클릭 — Promise 가능. throw 시 자동으로 닫지 않고 에러 메시지를 본문 하단에 노출 */
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
}

export function ConfirmDialog(props: ConfirmDialogProps) {
  const {
    open,
    title,
    body,
    confirmLabel,
    cancelLabel = "Cancel",
    tone = "default",
    requireTyping,
    onConfirm,
    onClose,
  } = props;

  const titleId = useId();
  const bodyId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const confirmBtnRef = useRef<HTMLButtonElement>(null);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setTyped("");
      setError(null);
      setBusy(false);
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    document.addEventListener("keydown", onKey);
    const t = window.setTimeout(() => {
      if (requireTyping) inputRef.current?.focus();
      else confirmBtnRef.current?.focus();
    }, 0);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.clearTimeout(t);
    };
  }, [open, busy, onClose, requireTyping]);

  const typingOk = useMemo(() => {
    if (!requireTyping) return true;
    return typed === requireTyping.value;
  }, [requireTyping, typed]);

  if (!open) return null;

  const confirmDisabled = busy || !typingOk;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={bodyId}
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
    >
      <button
        type="button"
        aria-label="close"
        tabIndex={-1}
        className="absolute inset-0 cursor-default bg-[#1a1208]/40"
        onClick={() => {
          if (!busy) onClose();
        }}
      />
      <div
        className={[
          "relative z-10 w-full max-w-md bg-white",
          "border border-[var(--hill-rule)]",
          "shadow-[0_24px_60px_-24px_rgba(26,18,8,0.35)]",
        ].join(" ")}
      >
        <header className="border-b border-[var(--hill-rule)] px-6 pt-5 pb-4">
          <div
            className={[
              "text-[10px] font-semibold uppercase tracking-[0.24em]",
              tone === "danger" ? "text-red-700" : "opacity-55",
            ].join(" ")}
          >
            {tone === "danger" ? "Danger" : "Confirm"}
          </div>
          <h2
            id={titleId}
            className="mt-1.5 text-[15px] leading-[1.4] tracking-tight text-[#1a1208]"
          >
            {title}
          </h2>
        </header>

        <div
          id={bodyId}
          className="px-6 py-5 text-[13px] leading-[1.6] text-[#1a1208]/80"
        >
          {body}
          {requireTyping && (
            <div className="mt-5 flex flex-col gap-2">
              <label
                htmlFor={`${titleId}-typed`}
                className="text-[10px] font-semibold uppercase tracking-[0.22em] opacity-55"
              >
                {requireTyping.label ??
                  `Type "${requireTyping.value}" to confirm`}
              </label>
              <input
                ref={inputRef}
                id={`${titleId}-typed`}
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder={requireTyping.placeholder ?? requireTyping.value}
                className={`${fieldControl} font-mono`}
              />
            </div>
          )}
          {error && (
            <div role="alert" className="mt-4 text-[12px] text-red-700">
              {error}
            </div>
          )}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-[var(--hill-rule)] px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className={btnGhost}
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmBtnRef}
            type="button"
            disabled={confirmDisabled}
            onClick={async () => {
              setError(null);
              setBusy(true);
              try {
                await onConfirm();
              } catch (e) {
                setError((e as Error).message);
                setBusy(false);
                return;
              }
              setBusy(false);
            }}
            className={tone === "danger" ? btnPrimaryDanger : btnPrimary}
          >
            {busy ? "…" : confirmLabel}
          </button>
        </footer>
      </div>
    </div>
  );
}
