import { WebSocketServer } from "ws";
import type { IncomingMessage, Server } from "node:http";
import { eq } from "drizzle-orm";
import { sessions, sessionEvents } from "@agent-desk/shared/db/schema";
import type { DbHandle } from "../db";
import { attachPtyToSocket } from "../tmux/attach";

export function attachWsServer(opts: {
  httpServer: Server;
  db: DbHandle["db"];
  token: string;
}): { close: () => Promise<void> } {
  const wss = new WebSocketServer({ noServer: true });

  opts.httpServer.on("upgrade", (req: IncomingMessage, socket, head) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const match = url.pathname.match(/^\/sessions\/(\d+)\/attach$/);
    if (!match) {
      // Not our path — let other upgrade handlers (e.g. progress-server) process it
      return;
    }
    const tokenFromQuery = url.searchParams.get("token");
    const header = req.headers["authorization"];
    const headerToken =
      typeof header === "string" && header.toLowerCase().startsWith("bearer ")
        ? header.slice(7)
        : null;
    const provided = headerToken ?? tokenFromQuery;

    const id = Number(match[1]);
    const cols = Number(url.searchParams.get("cols") ?? "80");
    const rows = Number(url.searchParams.get("rows") ?? "24");

    const session = opts.db
      .select()
      .from(sessions)
      .where(eq(sessions.id, id))
      .get();

    wss.handleUpgrade(req, socket, head, (ws) => {
      if (provided !== opts.token) {
        ws.close(4401, "unauthorized");
        return;
      }
      if (!session || session.status !== "active") {
        ws.close(4404, "not_found");
        return;
      }

      opts.db
        .insert(sessionEvents)
        .values({
          sessionId: id,
          kind: "attached",
          payloadJson: JSON.stringify({ cols, rows }),
          at: Date.now(),
        })
        .run();
      let lastActivityFlush = 0;
      attachPtyToSocket({
        tmuxName: session.tmuxName,
        cols,
        rows,
        ws,
        onActivity: () => {
          const now = Date.now();
          if (now - lastActivityFlush > 1000) {
            lastActivityFlush = now;
            opts.db
              .update(sessions)
              .set({ lastActivityAt: now })
              .where(eq(sessions.id, id))
              .run();
          }
        },
        onClose: () => {
          opts.db
            .insert(sessionEvents)
            .values({
              sessionId: id,
              kind: "detached",
              payloadJson: null,
              at: Date.now(),
            })
            .run();
        },
      });
    });
  });

  return {
    close: async () => {
      wss.close();
    },
  };
}
