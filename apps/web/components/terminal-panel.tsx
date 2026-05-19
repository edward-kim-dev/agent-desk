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
    if (!containerRef.current) return;
    const term = new Terminal({
      allowProposedApi: true,
      convertEol: false,
      cursorBlink: true,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.loadAddon(new WebLinksAddon());
    term.loadAddon(new Unicode11Addon());
    term.unicode.activeVersion = "11";
    term.open(containerRef.current);
    fit.fit();

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
  }, [send, resize]);

  if (props.sessionId == null) {
    return (
      <div className="flex h-full items-center justify-center text-zinc-500">
        select or create a session
      </div>
    );
  }
  return <div ref={containerRef} className="h-full w-full" />;
}
