"use client";
import { useCallback, useEffect, useRef } from "react";

export type TerminalSocketCloseReason =
  | { kind: "ended" }
  | { kind: "not_found" }
  | { kind: "unauthorized" }
  | { kind: "transient"; willRetryInMs: number };

export interface TerminalSocketHandlers {
  onData: (chunk: string) => void;
  onClose: (reason: TerminalSocketCloseReason) => void;
}

const TERMINAL_CLOSE_CODES = new Set([1000, 4401, 4404]);

function reasonForCode(code: number): TerminalSocketCloseReason | null {
  if (code === 4404) return { kind: "not_found" };
  if (code === 4401) return { kind: "unauthorized" };
  if (code === 1000) return { kind: "ended" };
  return null;
}

export function useTerminalSocket(
  sessionId: number | null,
  cols: number,
  rows: number,
  handlers: TerminalSocketHandlers
) {
  const sockRef = useRef<WebSocket | null>(null);
  const reconnectAttempt = useRef(0);
  const lastSizeRef = useRef<{ cols: number; rows: number }>({ cols, rows });

  useEffect(() => {
    if (sessionId == null) return;
    let stopped = false;

    const connect = () => {
      if (stopped) return;
      const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
      const { cols: c, rows: r } = lastSizeRef.current;
      const url = `${proto}//${window.location.hostname}:3334/sessions/${sessionId}/attach?cols=${c}&rows=${r}&token=${encodeURIComponent(window.AGENT_DESK_BROWSER_TOKEN ?? "")}`;
      const ws = new WebSocket(url);
      sockRef.current = ws;
      ws.onopen = () => {
        reconnectAttempt.current = 0;
        const { cols: cc, rows: rr } = lastSizeRef.current;
        ws.send(JSON.stringify({ type: "resize", cols: cc, rows: rr }));
      };
      ws.onmessage = (ev) => handlers.onData(typeof ev.data === "string" ? ev.data : "");
      ws.onclose = (ev) => {
        if (stopped) return;
        const terminal = TERMINAL_CLOSE_CODES.has(ev.code);
        if (terminal) {
          stopped = true;
          handlers.onClose(reasonForCode(ev.code) ?? { kind: "ended" });
          return;
        }
        const delay = Math.min(5000, 250 * 2 ** reconnectAttempt.current++);
        handlers.onClose({ kind: "transient", willRetryInMs: delay });
        setTimeout(connect, delay);
      };
    };
    connect();
    return () => {
      stopped = true;
      sockRef.current?.close();
    };
  }, [sessionId, handlers]);

  const send = useCallback((chunk: string) => {
    const ws = sockRef.current;
    if (ws?.readyState === WebSocket.OPEN) ws.send(chunk);
  }, []);

  const resize = useCallback((c: number, r: number) => {
    lastSizeRef.current = { cols: c, rows: r };
    const ws = sockRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "resize", cols: c, rows: r }));
    }
  }, []);

  return { send, resize };
}

declare global {
  interface Window {
    AGENT_DESK_BROWSER_TOKEN?: string;
  }
}
