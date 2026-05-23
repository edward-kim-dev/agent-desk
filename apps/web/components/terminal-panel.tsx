"use client";
import { useEffect, useMemo, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import "@xterm/xterm/css/xterm.css";
import { useTerminalSocket } from "@/hooks/use-terminal-socket";

const HIJACK_KEYS = new Set(["w", "t", "n"]);

export function TerminalPanel(props: { sessionId: number | null }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);

  const handlers = useMemo(
    () => ({
      onData: (chunk: string) => termRef.current?.write(chunk),
      onClose: () => termRef.current?.writeln("\r\n[disconnected, reconnecting…]"),
    }),
    []
  );

  const { send, resize } = useTerminalSocket(
    props.sessionId,
    termRef.current?.cols ?? 80,
    termRef.current?.rows ?? 24,
    handlers
  );

  useEffect(() => {
    if (!containerRef.current || props.sessionId == null) return;
    const term = new Terminal({
      allowProposedApi: true,
      convertEol: false,
      cursorBlink: true,
      fontFamily: '"D2Coding Ligature", "D2Coding", Menlo, Consolas, "Courier New", monospace',
      fontSize: 13,
      lineHeight: 1.2,
      theme: {
        background: "#ffffff",
        foreground: "#1a1208",
        cursor: "#1a1208",
        cursorAccent: "#ffffff",
        selectionBackground: "rgba(26, 18, 8, 0.2)",
      },
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

    term.onData((data) => send(data));
    termRef.current = term;
    fitRef.current = fit;

    const ro = new ResizeObserver(() => {
      fit.fit();
      resize(term.cols, term.rows);
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      term.dispose();
      termRef.current = null;
    };
  }, [send, resize, props.sessionId]);

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />
      {props.sessionId == null && (
        <div className="absolute inset-0 flex items-center justify-center opacity-55">
          select or create a session
        </div>
      )}
    </div>
  );
}
