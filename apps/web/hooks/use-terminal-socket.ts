"use client";
import { useEffect, useRef } from "react";

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

  useEffect(() => {
    if (sessionId == null) return;
    let stopped = false;

    const connect = () => {
      if (stopped) return;
      const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
      const url = `${proto}//${window.location.hostname}:3334/sessions/${sessionId}/attach?cols=${cols}&rows=${rows}&token=${encodeURIComponent(window.AGENT_DESK_BROWSER_TOKEN ?? "")}`;
      const ws = new WebSocket(url);
      sockRef.current = ws;
      ws.onopen = () => {
        reconnectAttempt.current = 0;
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
  }, [sessionId, cols, rows, handlers]);

  return {
    send: (chunk: string) => sockRef.current?.send(chunk),
    resize: (c: number, r: number) =>
      sockRef.current?.send(JSON.stringify({ type: "resize", cols: c, rows: r })),
  };
}

declare global {
  interface Window {
    AGENT_DESK_BROWSER_TOKEN?: string;
  }
}
