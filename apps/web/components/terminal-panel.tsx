"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import "@xterm/xterm/css/xterm.css";
import {
  useTerminalSocket,
  type TerminalSocketCloseReason,
} from "@/hooks/use-terminal-socket";
import { gateway } from "@/lib/gateway-client";
import { TERMINAL_THEME } from "@/lib/terminal-theme";
import { TerminalHistoryOverlay } from "./terminal-history-overlay";

const HIJACK_KEYS = new Set(["w", "t", "n"]);

function closeMessage(reason: TerminalSocketCloseReason): string {
  switch (reason.kind) {
    case "ended":
      return "\r\n[session ended]";
    case "not_found":
      return "\r\n[session no longer exists]";
    case "unauthorized":
      return "\r\n[unauthorized — token rejected]";
    case "transient":
      return `\r\n[disconnected, retrying in ${Math.round(reason.willRetryInMs / 100) / 10}s…]`;
  }
}

export function TerminalPanel(props: { sessionId: number | null }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);

  // ── history overlay state ────────────────────────────────────────────────
  // overlayShowingRef: read inside the wheel handler closure (avoids stale state)
  const overlayShowingRef = useRef(false);
  const [overlayHistory, setOverlayHistory] = useState<string | null>(null);

  // Clear overlay whenever the active session changes.
  useEffect(() => {
    setOverlayHistory(null);
    overlayShowingRef.current = false;
  }, [props.sessionId]);

  const handleDismissOverlay = useCallback(() => {
    setOverlayHistory(null);
    overlayShowingRef.current = false;
    // Re-focus the live terminal so keyboard input works immediately.
    // setTimeout defers until after React removes the overlay from the DOM.
    setTimeout(() => termRef.current?.focus(), 0);
  }, []);

  // ── terminal socket ──────────────────────────────────────────────────────
  const handlers = useMemo(
    () => ({
      onData: (chunk: string) => termRef.current?.write(chunk),
      onClose: (reason: TerminalSocketCloseReason) =>
        termRef.current?.writeln(closeMessage(reason)),
    }),
    []
  );

  const { send, resize } = useTerminalSocket(
    props.sessionId,
    termRef.current?.cols ?? 80,
    termRef.current?.rows ?? 24,
    handlers
  );

  // ── xterm initialisation ─────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || props.sessionId == null) return;
    const term = new Terminal({
      allowProposedApi: true,
      convertEol: false,
      cursorBlink: true,
      fontFamily: '"D2Coding Ligature", "D2Coding", Menlo, Consolas, "Courier New", monospace',
      fontSize: 13,
      lineHeight: 1.2,
      theme: TERMINAL_THEME,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.loadAddon(new WebLinksAddon());
    term.loadAddon(new Unicode11Addon());
    term.unicode.activeVersion = "11";
    term.open(containerRef.current);
    fit.fit();

    // xterm measures glyphs at open(); re-fit once the web font is ready so cols/rows match.
    if (typeof document !== "undefined" && document.fonts?.load) {
      document.fonts.load('13px "D2Coding Ligature"').then(() => {
        if (termRef.current === term) {
          term.refresh(0, term.rows - 1);
          fit.fit();
          resize(term.cols, term.rows);
        }
      }).catch(() => {});
    }

    term.attachCustomKeyEventHandler((ev) => {
      const k = ev.key.toLowerCase();
      if ((ev.ctrlKey || ev.metaKey) && HIJACK_KEYS.has(k)) {
        ev.preventDefault();
        return false;
      }
      return true;
    });

    // ── wheel handler ────────────────────────────────────────────────────
    // Uses capture phase so it fires before xterm's own child-element listeners.
    //
    // Two modes:
    //   alt buffer  — Claude Code / TUI apps.  xterm has no scrollback for alt
    //                 buffer; we show a history overlay using tmux capture-pane.
    //   normal buffer — plain shell / scrollable output.  We update
    //                   .xterm-viewport.scrollTop directly for smooth scroll.
    //
    // When the history overlay is visible we call only preventDefault()
    // (suppress page scroll) and return, letting the overlay xterm's own
    // bubble-phase wheel listener handle scrolling naturally.

    const LINE_PX = 13 * 1.2; // fontSize × lineHeight — line-mode px conversion

    const container = containerRef.current!;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault(); // always suppress page scroll

      if (overlayShowingRef.current) {
        // The overlay xterm (normal buffer) handles its own scrolling.
        // Do NOT stopPropagation — the event must reach the overlay's
        // .xterm-viewport bubble-phase listener.
        return;
      }

      // Prevent xterm's built-in wheel → arrow-key conversion.
      e.stopPropagation();

      if (term.buffer.active.type === "alternate") {
        // Alt buffer: show history overlay on first upward scroll.
        if (e.deltaY < 0) {
          overlayShowingRef.current = true;
          void gateway.sessions
            .history(props.sessionId!)
            .then(({ history }) => {
              setOverlayHistory(history);
            })
            .catch(() => {
              overlayShowingRef.current = false;
            });
        }
        return;
      }

      // Normal buffer: update viewport scroll position directly.
      const viewport = container.querySelector(
        ".xterm-viewport"
      ) as HTMLElement | null;
      if (!viewport) return;

      // deltaMode: 0=pixel, 1=line, 2=page
      const delta =
        e.deltaMode === 0
          ? e.deltaY
          : e.deltaMode === 1
          ? e.deltaY * LINE_PX
          : e.deltaY * viewport.clientHeight;

      viewport.scrollTop += delta;
    };

    // capture: true — fires before xterm's bubble-phase listeners
    container.addEventListener("wheel", handleWheel, {
      capture: true,
      passive: false,
    });

    term.onData((data) => send(data));
    termRef.current = term;
    fitRef.current = fit;

    const ro = new ResizeObserver(() => {
      fit.fit();
      resize(term.cols, term.rows);
    });
    ro.observe(containerRef.current);

    return () => {
      container.removeEventListener("wheel", handleWheel, { capture: true });
      ro.disconnect();
      term.dispose();
      termRef.current = null;
    };
  }, [send, resize, props.sessionId]);

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />

      {overlayHistory !== null && (
        <TerminalHistoryOverlay
          history={overlayHistory}
          onDismiss={handleDismissOverlay}
        />
      )}

      {props.sessionId == null && (
        <div className="absolute inset-0 flex items-center justify-center opacity-55">
          select or create a session
        </div>
      )}
    </div>
  );
}
