"use client";
import { useCallback, useEffect, useRef } from "react";

export interface TerminalSocketHandlers {
  onData: (chunk: string) => void;
  onClose: () => void;
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
      ws.onclose = () => {
        handlers.onClose();
        if (stopped) return;
        const delay = Math.min(5000, 250 * 2 ** reconnectAttempt.current++);
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
