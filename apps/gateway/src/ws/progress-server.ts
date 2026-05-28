import { WebSocketServer } from "ws";
import type { WebSocket } from "ws";
import type { IncomingMessage, Server } from "node:http";
import type { StepReadyPayload } from "../routes/progress";

export interface ProgressServer {
  subscribe: (sessionId: number, ws: WebSocket) => void;
  unsubscribe: (sessionId: number, ws: WebSocket) => void;
  broadcastStepReady: (event: StepReadyPayload) => void;
  attachToHttpServer: (httpServer: Server, token: string) => void;
  close: () => void;
}

export function createProgressServer(): ProgressServer {
  const subs = new Map<number, Set<WebSocket>>();
  let wss: WebSocketServer | null = null;

  function subscribe(sessionId: number, ws: WebSocket) {
    if (!subs.has(sessionId)) subs.set(sessionId, new Set());
    subs.get(sessionId)!.add(ws);
  }

  function unsubscribe(sessionId: number, ws: WebSocket) {
    const set = subs.get(sessionId);
    if (!set) return;
    set.delete(ws);
    if (set.size === 0) subs.delete(sessionId);
  }

  function broadcastStepReady(event: StepReadyPayload) {
    const clients = subs.get(event.sessionId);
    if (!clients?.size) return;
    const msg = JSON.stringify({
      type: "step_ready",
      workPackageId: event.workPackageId,
      stepIndex: event.stepIndex,
      stepTitle: event.stepTitle,
    });
    for (const ws of clients) {
      if (ws.readyState === ws.OPEN) ws.send(msg);
    }
  }

  function attachToHttpServer(httpServer: Server, token: string) {
    const server = new WebSocketServer({ noServer: true });
    wss = server;

    httpServer.on("upgrade", (req: IncomingMessage, socket, head) => {
      const url = new URL(req.url ?? "/", "http://localhost");
      const match = url.pathname.match(/^\/sessions\/(\d+)\/progress$/);
      if (!match) return; // not our path — let other handlers deal with it

      const sessionId = Number(match[1]);
      const provided =
        url.searchParams.get("token") ??
        (req.headers.authorization?.toLowerCase().startsWith("bearer ")
          ? req.headers.authorization.slice(7)
          : null);

      server.handleUpgrade(req, socket, head, (ws) => {
        if (provided !== token) {
          ws.close(4401, "unauthorized");
          return;
        }
        subscribe(sessionId, ws);
        ws.on("close", () => unsubscribe(sessionId, ws));
      });
    });
  }

  function close() {
    wss?.close();
  }

  return { subscribe, unsubscribe, broadcastStepReady, attachToHttpServer, close };
}

// Singleton for server.ts to import
export const progressServer = createProgressServer();
