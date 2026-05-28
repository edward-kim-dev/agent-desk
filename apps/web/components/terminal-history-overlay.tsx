"use client";
import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { TERMINAL_THEME } from "@/lib/terminal-theme";
// xterm.css is already imported globally by terminal-panel; no double-import needed.

interface Props {
  history: string;
  onDismiss: () => void;
}

/**
 * Full-area overlay that renders a read-only snapshot of the tmux pane history
 * (captured via `tmux capture-pane -e -S -N`).  The inner xterm.js instance
 * runs in normal-buffer mode so xterm's own wheel handler provides smooth
 * native scrolling — no custom wheel logic required.
 *
 * Dismiss: click "✕ Live" button, press Escape, or the parent unmounts the overlay.
 */
export function TerminalHistoryOverlay({ history, onDismiss }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const term = new Terminal({
      allowProposedApi: true,
      convertEol: true,         // lone \n → \r\n  (tmux capture uses \n)
      cursorBlink: false,
      disableStdin: true,
      scrollback: 5000,
      fontFamily:
        '"D2Coding Ligature", "D2Coding", Menlo, Consolas, "Courier New", monospace',
      fontSize: 13,
      lineHeight: 1.2,
      theme: TERMINAL_THEME,
    });

    const fit = new FitAddon();
    term.loadAddon(fit);
    term.loadAddon(new Unicode11Addon());
    term.unicode.activeVersion = "11";
    term.open(containerRef.current);
    fit.fit();

    // xterm.js auto-follows the cursor as content is written, so the
    // viewport ends up at the most recent output with no extra call needed.
    term.write(history);

    const ro = new ResizeObserver(() => fit.fit());
    ro.observe(containerRef.current);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDismiss();
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      ro.disconnect();
      term.dispose();
    };
  }, [history, onDismiss]);

  return (
    <div className="absolute inset-0 z-20 flex flex-col bg-[var(--background)]">
      {/* ── header bar ─────────────────────────────────────────────────── */}
      <div className="flex shrink-0 items-center justify-between border-b border-[var(--hill-rule)] bg-[var(--background)]/95 px-3 py-1 backdrop-blur-sm">
        <span className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[#1a1208]/50">
          History
        </span>
        <button
          onClick={onDismiss}
          className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#1a1208]/50 transition-opacity hover:opacity-100"
        >
          ✕&nbsp;Live
        </button>
      </div>
      {/* ── xterm viewport ─────────────────────────────────────────────── */}
      <div ref={containerRef} className="min-h-0 flex-1" />
    </div>
  );
}
