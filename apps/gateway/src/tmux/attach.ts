import * as pty from "node-pty";
import type { WebSocket } from "ws";

const BATCH_INTERVAL_MS = 16;
const BACKPRESSURE_THRESHOLD = 1 << 20; // 1MB

export interface AttachOptions {
  tmuxName: string;
  cols: number;
  rows: number;
  ws: WebSocket;
  onActivity?: () => void;
  onClose?: () => void;
}

export function attachPtyToSocket(opts: AttachOptions): { dispose: () => void } {
  const term = pty.spawn(
    "tmux",
    ["attach-session", "-t", opts.tmuxName],
    {
      name: "xterm-256color",
      cols: opts.cols,
      rows: opts.rows,
      cwd: process.cwd(),
      env: process.env as Record<string, string>,
    }
  );

  let pending = "";
  let flushTimer: NodeJS.Timeout | undefined;
  let paused = false;

  const flush = () => {
    if (pending.length === 0) return;
    if (opts.ws.readyState !== opts.ws.OPEN) return;
    opts.ws.send(pending);
    pending = "";
    if (opts.ws.bufferedAmount > BACKPRESSURE_THRESHOLD && !paused) {
      paused = true;
      term.pause();
    }
  };

  term.onData((chunk) => {
    pending += chunk;
    opts.onActivity?.();
    if (!flushTimer) flushTimer = setTimeout(() => {
      flushTimer = undefined;
      flush();
    }, BATCH_INTERVAL_MS);
  });

  const drainTimer = setInterval(() => {
    if (paused && opts.ws.bufferedAmount < BACKPRESSURE_THRESHOLD / 2) {
      paused = false;
      term.resume();
    }
  }, 50);

  term.onExit(() => {
    flush();
    if (opts.ws.readyState === opts.ws.OPEN) opts.ws.close(1000);
  });

  opts.ws.on("message", (raw) => {
    try {
      const text = raw.toString();
      if (text.startsWith("{")) {
        const msg = JSON.parse(text);
        if (msg.type === "resize" && Number.isInteger(msg.cols) && Number.isInteger(msg.rows)) {
          term.resize(msg.cols, msg.rows);
          return;
        }
      }
      term.write(text);
    } catch {
      term.write(raw.toString());
    }
  });

  opts.ws.on("close", () => {
    clearInterval(drainTimer);
    if (flushTimer) clearTimeout(flushTimer);
    try {
      term.kill();
    } catch {}
    opts.onClose?.();
  });

  return {
    dispose: () => {
      clearInterval(drainTimer);
      if (flushTimer) clearTimeout(flushTimer);
      try {
        term.kill();
      } catch {}
      if (opts.ws.readyState === opts.ws.OPEN) opts.ws.close(1000);
    },
  };
}
