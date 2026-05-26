import { Hono } from "hono";
import { eq } from "drizzle-orm";
import {
  brainstormingBriefRequest,
  createSessionRequest,
  sessions,
  sessionEvents,
  workspaces,
  type CliEntry,
  type SessionDto,
} from "@agent-desk/shared";
import type { DbHandle } from "../db";
import { generateSessionName } from "../util/slug";
import type { TmuxClient } from "../tmux/commands";
import { injectPrompt, type InjectResult } from "../tmux/inject";
import { ensureSkillInstalled, type EnsureSkillResult } from "../skills/install";

function shellEscape(s: string): string {
  if (/^[A-Za-z0-9_.\/=:-]+$/.test(s)) return s;
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

type SessionRow = typeof sessions.$inferSelect;

function toDto(s: SessionRow): SessionDto {
  return {
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
    briefedAt: s.briefedAt,
  };
}

function formatBrainstormingPrompt(payload: {
  topic: string;
  context?: string;
  constraints?: string;
  goals?: string;
}): string {
  const parts: string[] = [];
  parts.push(`Topic: ${payload.topic}`);
  if (payload.context?.trim()) parts.push(`Context: ${payload.context.trim()}`);
  if (payload.constraints?.trim())
    parts.push(`Constraints: ${payload.constraints.trim()}`);
  if (payload.goals?.trim()) parts.push(`Goals: ${payload.goals.trim()}`);
  // Slash command + structured one-liner. Newlines are replaced with " · " so the
  // entire payload fits a single Enter-terminated REPL message.
  const sanitized = parts
    .map((p) => p.replace(/\r?\n/g, " · "))
    .join(" · ");
  return `/brainstorming ${sanitized}`;
}

export function sessionRoutes(opts: {
  db: DbHandle["db"];
  tmux: TmuxClient;
  cli: CliEntry[];
  /** Override injection runner for tests. */
  injectFn?: typeof injectPrompt;
  /** Override skill installer for tests. */
  ensureSkillFn?: typeof ensureSkillInstalled;
}): Hono {
  const inject = opts.injectFn ?? injectPrompt;
  const ensureSkill = opts.ensureSkillFn ?? ensureSkillInstalled;
  const r = new Hono();

  r.get("/", (c) => {
    const rows = opts.db.select().from(sessions).all();
    return c.json({ sessions: rows.map(toDto) });
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
    if (!ws || ws.deletedAt != null) return c.json({ error: "unknown_workspace" }, 400);

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
    return c.json(toDto(inserted[0]), 201);
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

  r.post("/:id/brief", async (c) => {
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id)) return c.json({ error: "bad_id" }, 400);

    const s = opts.db.select().from(sessions).where(eq(sessions.id, id)).get();
    if (!s) return c.json({ error: "not_found" }, 404);
    if (s.status !== "active") return c.json({ error: "session_dead" }, 409);
    if (s.briefedAt != null) return c.json({ error: "already_briefed" }, 409);
    if (s.cli !== "claude") return c.json({ error: "cli_not_supported" }, 400);

    const parsed = brainstormingBriefRequest.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: "invalid_request" }, 400);

    // JIT 스킬 설치 — 워크스페이스 의 .claude/skills/brainstorming 을
    // vendor/superpowers/skills/brainstorming 으로 symlink. 워크스페이스 경로가
    // 비어 있거나 vendor source 가 없으면 fail-fast 한다 (실패해도 ws path 만
    // 채워졌으면 그대로 inject 시도 → 클로드가 스킬 없다고 답할 뿐).
    const ws = opts.db
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, s.workspaceId!))
      .get();
    let installResult: EnsureSkillResult | null = null;
    if (ws) {
      installResult = await ensureSkill({
        workspacePath: ws.path,
        skillName: "brainstorming",
      });
    }

    const prompt = formatBrainstormingPrompt(parsed.data);

    let result: InjectResult;
    try {
      result = await inject({
        tmux: opts.tmux,
        name: s.tmuxName,
        prompt,
      });
    } catch (err) {
      result = {
        injected: false,
        reason: "tmux_error",
        detail: (err as Error).message,
      };
    }

    const at = Date.now();
    if (result.injected) {
      opts.db
        .update(sessions)
        .set({ briefedAt: at, lastActivityAt: at })
        .where(eq(sessions.id, id))
        .run();
      opts.db
        .insert(sessionEvents)
        .values({
          sessionId: id,
          kind: "briefed",
          payloadJson: JSON.stringify({
            topic: parsed.data.topic,
            skillInstall: installResult,
          }),
          at,
        })
        .run();
      const updated = opts.db
        .select()
        .from(sessions)
        .where(eq(sessions.id, id))
        .get();
      return c.json({ session: toDto(updated!), result, install: installResult }, 200);
    }

    opts.db
      .insert(sessionEvents)
      .values({
        sessionId: id,
        kind: "brief-failed",
        payloadJson: JSON.stringify({
          reason: result.reason,
          detail: result.detail,
          skillInstall: installResult,
        }),
        at,
      })
      .run();
    return c.json({ session: toDto(s), result, install: installResult }, 502);
  });

  return r;
}
