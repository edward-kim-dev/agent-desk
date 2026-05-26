import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createServer } from "../src/server";
import { openDatabase, type DbHandle } from "../src/db";
import { workspaces } from "@agent-desk/shared/db/schema";

const TOKEN = "secret";
const headers = { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" };

let dir: string;
let handle: DbHandle;
let url: string;
let stop: () => Promise<void>;
let workspaceId: number;
const newSession = vi.fn(async () => {});
const killSession = vi.fn(async () => {});
const injectFn = vi.fn(async () => ({ injected: true }));
const ensureSkillFn = vi.fn(async () => ({
  status: "installed" as const,
  linkPath: "/tmp/ws/.claude/skills/brainstorming",
  sourcePath: "/tmp/vendor/skills/brainstorming",
}));

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "ad-sess-"));
  handle = openDatabase({ filePath: join(dir, "db.sqlite") });
  const inserted = handle.db
    .insert(workspaces)
    .values({ name: "owngo", path: "/workspaces/owngo", createdAt: Date.now() })
    .returning()
    .all();
  workspaceId = inserted[0].id;

  const built = await createServer({
    db: handle,
    token: TOKEN,
    cli: [{ name: "claude", command: "claude", defaultArgs: [] }],
    bind: "127.0.0.1",
    port: 0,
    tmux: {
      listSessions: async () => [],
      newSession,
      killSession,
      hasSession: async () => true,
      sendKeys: async () => {},
      capturePane: async () => "",
      paneCurrentCommand: async () => "claude",
      paneChildren: async () => [],
    },
    injectFn,
    ensureSkillFn,
    ensureAllSkillsFn: async () => ({ results: [] }),
    installSkillsOnStartup: false,
  });
  url = built.url;
  stop = built.close;
});

afterAll(async () => {
  await stop();
  handle.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("sessions 라우트", () => {
  it("세션을 생성하고 tmux.newSession을 호출한다", async () => {
    const res = await fetch(`${url}/sessions`, {
      method: "POST",
      headers,
      body: JSON.stringify({ workspaceId, cli: "claude", args: [] }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.tmuxName).toMatch(/^ad-owngo-[a-z0-9]{6}$/);
    expect(body.workspaceId).toBe(workspaceId);
    expect(newSession).toHaveBeenCalledWith(
      expect.objectContaining({
        cwd: "/workspaces/owngo",
        command: "claude",
        name: body.tmuxName,
      })
    );
  });

  it("알 수 없는 cli를 400으로 거부한다", async () => {
    const res = await fetch(`${url}/sessions`, {
      method: "POST",
      headers,
      body: JSON.stringify({ workspaceId, cli: "nope", args: [] }),
    });
    expect(res.status).toBe(400);
  });

  it("새로 생성한 세션을 포함해 목록을 반환한다", async () => {
    const res = await fetch(`${url}/sessions`, { headers });
    const body = await res.json();
    expect(body.sessions).toHaveLength(1);
    expect(body.sessions[0].cli).toBe("claude");
  });

  it("세션을 종료하고 status를 dead로 마킹한다", async () => {
    const list = (await (await fetch(`${url}/sessions`, { headers })).json()) as {
      sessions: Array<{ id: number; tmuxName: string }>;
    };
    const id = list.sessions[0].id;
    const res = await fetch(`${url}/sessions/${id}`, { method: "DELETE", headers });
    expect(res.status).toBe(204);
    expect(killSession).toHaveBeenCalledWith(list.sessions[0].tmuxName);
    const after = (await (await fetch(`${url}/sessions`, { headers })).json()) as {
      sessions: Array<{ status: string }>;
    };
    expect(after.sessions[0].status).toBe("dead");
  });
});

describe("sessions /brief 라우트", () => {
  async function createSession() {
    const res = await fetch(`${url}/sessions`, {
      method: "POST",
      headers,
      body: JSON.stringify({ workspaceId, cli: "claude", args: [] }),
    });
    expect(res.status).toBe(201);
    return (await res.json()) as { id: number; tmuxName: string };
  }

  it("topic 만 있어도 ensureSkill 와 inject 가 호출되고 briefedAt 이 채워진다", async () => {
    injectFn.mockResolvedValueOnce({ injected: true });
    ensureSkillFn.mockClear();
    const s = await createSession();
    const res = await fetch(`${url}/sessions/${s.id}/brief`, {
      method: "POST",
      headers,
      body: JSON.stringify({ topic: "add notifications" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      session: { briefedAt: number | null };
      result: { injected: boolean };
      install: { status: string };
    };
    expect(body.result.injected).toBe(true);
    expect(body.session.briefedAt).toBeGreaterThan(0);
    expect(body.install.status).toBe("installed");

    expect(ensureSkillFn).toHaveBeenCalledWith({
      workspacePath: "/workspaces/owngo",
      skillName: "brainstorming",
    });
    const call = injectFn.mock.calls.at(-1)![0] as { prompt: string };
    expect(call.prompt).toMatch(/^\/brainstorming /);
    expect(call.prompt).toContain("Topic: add notifications");
  });

  it("이미 briefed 인 세션은 409 로 거부한다", async () => {
    injectFn.mockResolvedValueOnce({ injected: true });
    const s = await createSession();
    await fetch(`${url}/sessions/${s.id}/brief`, {
      method: "POST",
      headers,
      body: JSON.stringify({ topic: "x" }),
    });
    const res = await fetch(`${url}/sessions/${s.id}/brief`, {
      method: "POST",
      headers,
      body: JSON.stringify({ topic: "y" }),
    });
    expect(res.status).toBe(409);
  });

  it("inject 실패는 502 + briefedAt 미설정", async () => {
    injectFn.mockResolvedValueOnce({
      injected: false,
      reason: "cli_exited_to_shell",
      detail: "bash",
    });
    const s = await createSession();
    const res = await fetch(`${url}/sessions/${s.id}/brief`, {
      method: "POST",
      headers,
      body: JSON.stringify({ topic: "test" }),
    });
    expect(res.status).toBe(502);
    const body = (await res.json()) as {
      session: { briefedAt: number | null };
      result: { injected: boolean; reason: string };
    };
    expect(body.session.briefedAt).toBeNull();
    expect(body.result.reason).toBe("cli_exited_to_shell");
  });

  it("topic 누락은 400 으로 거부한다", async () => {
    const s = await createSession();
    const res = await fetch(`${url}/sessions/${s.id}/brief`, {
      method: "POST",
      headers,
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });
});
