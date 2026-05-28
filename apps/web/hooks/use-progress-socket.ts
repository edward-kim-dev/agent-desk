"use client";
import { useEffect, useRef } from "react";

export interface StepReadyEvent {
  workPackageId: number;
  stepIndex: number;
  stepTitle: string;
}

export function useProgressSocket(opts: {
  sessionId: number | null;
  onStepReady: (event: StepReadyEvent) => void;
}): void {
  // Keep latest callback in a ref to avoid stale closure
  const onStepReadyRef = useRef(opts.onStepReady);
  onStepReadyRef.current = opts.onStepReady;

  useEffect(() => {
    if (opts.sessionId == null) return;

    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const token = encodeURIComponent(window.AGENT_DESK_BROWSER_TOKEN ?? "");
    const wsUrl = `${proto}//${window.location.hostname}:3334/sessions/${opts.sessionId}/progress?token=${token}`;
    const ws = new WebSocket(wsUrl);

    ws.onmessage = (ev: MessageEvent) => {
      try {
        const msg = JSON.parse(ev.data as string) as { type: string } & StepReadyEvent;
        if (msg.type === "step_ready") {
          onStepReadyRef.current({
            workPackageId: msg.workPackageId,
            stepIndex: msg.stepIndex,
            stepTitle: msg.stepTitle,
          });
        }
      } catch {
        /* ignore malformed JSON */
      }
    };

    return () => {
      ws.close();
    };
  }, [opts.sessionId]);
}

declare global {
  interface Window {
    AGENT_DESK_BROWSER_TOKEN?: string;
  }
}
