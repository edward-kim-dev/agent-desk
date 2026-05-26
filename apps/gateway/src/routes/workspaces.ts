import { Hono } from "hono";
import { existsSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import {
  createWorkspaceRequest,
  sessionEvents,
  sessions,
  workspaces,
} from "@agent-desk/shared";
import type { DbHandle } from "../db";
import type { TmuxClient } from "../tmux/commands";
import { ensureAllSkillsInstalled } from "../skills/install";

export function workspaceRoutes(opts: {
  db: DbHandle["db"];
  tmux: TmuxClient;
  /** Override skills bulk-installer for tests. */
  ensureAllSkillsFn?: typeof ensureAllSkillsInstalled;
}): Hono {
  const { db, tmux } = opts;
  const ensureAllSkills = opts.ensureAllSkillsFn ?? ensureAllSkillsInstalled;
  const r = new Hono();

  r.get("/", (c) => {
    const onlyDeleted = c.req.query("onlyDeleted") === "true";
    const rows = db
      .select()
      .from(workspaces)
      .where(onlyDeleted ? isNotNull(workspaces.deletedAt) : isNull(workspaces.deletedAt))
      .all();
    return c.json({ workspaces: rows });
  });

  r.post("/", async (c) => {
    const parsed = createWorkspaceRequest.safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json({ error: "invalid_request", details: parsed.error.format() }, 400);
    }
    const existing = db
      .select()
      .from(workspaces)
      .where(eq(workspaces.path, parsed.data.path))
      .get();
    if (existing) {
      if (existing.deletedAt != null) {
        return c.json(
          { error: "workspace_soft_deleted", id: existing.id, name: existing.name },
          409,
        );
      }
      return c.json({ error: "workspace_exists" }, 409);
    }
    const inserted = db
      .insert(workspaces)
      .values({
        name: parsed.data.name,
        path: parsed.data.path,
        createdAt: Date.now(),
      })
      .returning()
      .all();
    // vendor/superpowers 의 스킬 전체를 workspace/.claude/skills/ 로 symlink.
    // 실패해도 워크스페이스 생성 자체는 막지 않는다 (사용자가 수동으로 복구 가능).
    try {
      await ensureAllSkills({ workspacePath: inserted[0].path });
    } catch (err) {
      console.warn("[workspaces] skill install on create failed:", err);
    }
    return c.json(inserted[0], 201);
  });

  r.delete("/:id", async (c) => {
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id)) return c.json({ error: "bad_id" }, 400);
    const ws = db.select().from(workspaces).where(eq(workspaces.id, id)).get();
    if (!ws) return c.json({ error: "not_found" }, 404);
    if (ws.deletedAt != null) return c.body(null, 204);

    const now = Date.now();
    const liveSessions = db
      .select()
      .from(sessions)
      .where(and(eq(sessions.workspaceId, id), eq(sessions.status, "active")))
      .all();
    for (const s of liveSessions) {
      try {
        await tmux.killSession(s.tmuxName);
      } catch (err) {
        console.warn("[workspaces] kill failed (continuing):", err);
      }
      db.update(sessions).set({ status: "dead" }).where(eq(sessions.id, s.id)).run();
      db.insert(sessionEvents)
        .values({
          sessionId: s.id,
          kind: "killed",
          payloadJson: JSON.stringify({ reason: "workspace_deleted" }),
          at: now,
        })
        .run();
    }
    db.update(workspaces).set({ deletedAt: now }).where(eq(workspaces.id, id)).run();
    return c.body(null, 204);
  });

  r.post("/:id/restore", (c) => {
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id)) return c.json({ error: "bad_id" }, 400);
    const ws = db.select().from(workspaces).where(eq(workspaces.id, id)).get();
    if (!ws) return c.json({ error: "not_found" }, 404);
    if (ws.deletedAt == null) return c.json(ws);
    const collision = db
      .select()
      .from(workspaces)
      .where(and(eq(workspaces.path, ws.path), isNull(workspaces.deletedAt)))
      .get();
    if (collision) return c.json({ error: "path_taken", id: collision.id }, 409);
    const restored = db
      .update(workspaces)
      .set({ deletedAt: null })
      .where(eq(workspaces.id, id))
      .returning()
      .all();
    return c.json(restored[0]);
  });

  r.delete("/:id/permanent", (c) => {
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id)) return c.json({ error: "bad_id" }, 400);
    const ws = db.select().from(workspaces).where(eq(workspaces.id, id)).get();
    if (!ws) return c.json({ error: "not_found" }, 404);
    if (ws.deletedAt == null) return c.json({ error: "not_soft_deleted" }, 409);

    const rows = db.select({ id: sessions.id }).from(sessions).where(eq(sessions.workspaceId, id)).all();
    for (const s of rows) {
      db.delete(sessionEvents).where(eq(sessionEvents.sessionId, s.id)).run();
    }
    db.delete(sessions).where(eq(sessions.workspaceId, id)).run();
    db.delete(workspaces).where(eq(workspaces.id, id)).run();

    const wikiDir = resolve(ws.path, "wiki");
    if (existsSync(wikiDir)) {
      try {
        rmSync(wikiDir, { recursive: true, force: true });
      } catch (err) {
        console.warn("[workspaces] wiki rm failed (continuing):", err);
      }
    }
    return c.body(null, 204);
  });

  return r;
}
