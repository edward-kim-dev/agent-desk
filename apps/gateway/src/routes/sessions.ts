import { Hono } from "hono";
import { eq } from "drizzle-orm";
import {
  createSessionRequest,
  sessions,
  sessionEvents,
  workspaces,
  type CliEntry,
} from "@agent-desk/shared";
import type { DbHandle } from "../db";
import { generateSessionName } from "../util/slug";
import type { TmuxClient } from "../tmux/commands";

function shellEscape(s: string): string {
  if (/^[A-Za-z0-9_.\/=:-]+$/.test(s)) return s;
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

export function sessionRoutes(opts: {
  db: DbHandle["db"];
  tmux: TmuxClient;
  cli: CliEntry[];
}): Hono {
  const r = new Hono();

  r.get("/", (c) => {
    const rows = opts.db.select().from(sessions).all();
    const dto = rows.map((s) => ({
      id: s.id,
      tmuxName: s.tmuxName,
      workspaceId: s.workspaceId,
      cli: s.cli,
      args: s.args,
      status: s.status,
      adopted: s.adopted === 1,
      attachedClients: 0,
      lastActivityAt: s.lastActivityAt,
      createdAt: s.createdAt,
    }));
    return c.json({ sessions: dto });
  });

  r.post("/", async (c) => {
    const parsed = createSessionRequest.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: "invalid_request" }, 400);

    const cliEntry = opts.cli.find((c) => c.name === parsed.data.cli);
    if (!cliEntry) return c.json({ error: "unknown_cli" }, 400);

    const ws = opts.db
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, parsed.data.workspaceId))
      .get();
    if (!ws) return c.json({ error: "unknown_workspace" }, 400);

    const args = [...cliEntry.defaultArgs, ...parsed.data.args];
    const tmuxName = generateSessionName(ws.name);
    const command = [cliEntry.command, ...args].map(shellEscape).join(" ");

    await opts.tmux.newSession({ name: tmuxName, cwd: ws.path, command });

    const now = Date.now();
    const inserted = opts.db
      .insert(sessions)
      .values({
        tmuxName,
        workspaceId: ws.id,
        cli: cliEntry.name,
        args: args.join(" "),
        status: "active",
        lastActivityAt: now,
        createdAt: now,
        adopted: 0,
      })
      .returning()
      .all();
    opts.db
      .insert(sessionEvents)
      .values({
        sessionId: inserted[0].id,
        kind: "created",
        payloadJson: JSON.stringify({ cli: cliEntry.name, args }),
        at: now,
      })
      .run();
    const s = inserted[0];
    return c.json(
      {
        id: s.id,
        tmuxName: s.tmuxName,
        workspaceId: s.workspaceId,
        cli: s.cli,
        args: s.args,
        status: s.status,
        adopted: s.adopted === 1,
        attachedClients: 0,
        lastActivityAt: s.lastActivityAt,
        createdAt: s.createdAt,
      },
      201
    );
  });

  r.delete("/:id", async (c) => {
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id)) return c.json({ error: "bad_id" }, 400);
    const s = opts.db.select().from(sessions).where(eq(sessions.id, id)).get();
    if (!s) return c.json({ error: "not_found" }, 404);
    try {
      await opts.tmux.killSession(s.tmuxName);
    } catch (err) {
      console.warn("[sessions] kill failed (continuing):", err);
    }
    opts.db
      .update(sessions)
      .set({ status: "dead" })
      .where(eq(sessions.id, id))
      .run();
    opts.db
      .insert(sessionEvents)
      .values({
        sessionId: id,
        kind: "killed",
        payloadJson: JSON.stringify({ reason: "api_delete" }),
        at: Date.now(),
      })
      .run();
    return c.body(null, 204);
  });

  return r;
}
