import { mkdirSync, mkdtempSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createServer } from "../src/server";
import { openDatabase, type DbHandle } from "../src/db";
import { sessions } from "@agent-desk/shared/db/schema";

let dir: string;
let handle: DbHandle;
let url: string;
let stop: () => Promise<void>;
const TOKEN = "secret";
const headers = { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" };
const killSession = vi.fn(async () => {});

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "ad-ws-"));
  handle = openDatabase({ filePath: join(dir, "db.sqlite") });
  const built = await createServer({
    db: handle,
    token: TOKEN,
    cli: [],
    bind: "127.0.0.1",
    port: 0,
    tmux: {
      listSessions: async () => [],
      newSession: async () => {},
      killSession,
      hasSession: async () => true,
    },
  });
  url = built.url;
  stop = built.close;
});

afterAll(async () => {
  await stop();
  handle.close();
  rmSync(dir, { recursive: true, force: true });
});

async function listActive(): Promise<Array<{ id: number; name: string; path: string; deletedAt: number | null }>> {
  const r = await fetch(`${url}/workspaces`, { headers });
  return ((await r.json()) as { workspaces: Array<{ id: number; name: string; path: string; deletedAt: number | null }> }).workspaces;
}

async function listDeleted(): Promise<Array<{ id: number; name: string; deletedAt: number | null }>> {
  const r = await fetch(`${url}/workspaces?onlyDeleted=true`, { headers });
  return ((await r.json()) as { workspaces: Array<{ id: number; name: string; deletedAt: number | null }> }).workspaces;
}

describe("workspaces 라우트", () => {
  it("처음에는 빈 active 목록을 반환한다", async () => {
    expect(await listActive()).toEqual([]);
    expect(await listDeleted()).toEqual([]);
  });

  it("워크스페이스를 생성하고 반환한다", async () => {
    const res = await fetch(`${url}/workspaces`, {
      method: "POST",
      headers,
      body: JSON.stringify({ name: "owngo", path: "/tmp/ad-test-owngo" }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toMatchObject({
      id: expect.any(Number),
      name: "owngo",
      path: "/tmp/ad-test-owngo",
      deletedAt: null,
    });
  });

  it("중복 경로(활성)를 409 workspace_exists로 거부한다", async () => {
    const res = await fetch(`${url}/workspaces`, {
      method: "POST",
      headers,
      body: JSON.stringify({ name: "owngo-2", path: "/tmp/ad-test-owngo" }),
    });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: "workspace_exists" });
  });

  it("잘못된 페이로드를 400으로 거부한다", async () => {
    const res = await fetch(`${url}/workspaces`, {
      method: "POST",
      headers,
      body: JSON.stringify({ name: "x", path: "relative" }),
    });
    expect(res.status).toBe(400);
  });

  it("DELETE 는 soft-delete 로 처리한다 — active 목록에서 사라지고 trash에 나타난다", async () => {
    const [target] = await listActive();
    const res = await fetch(`${url}/workspaces/${target.id}`, { method: "DELETE", headers });
    expect(res.status).toBe(204);
    expect((await listActive()).map((w) => w.id)).not.toContain(target.id);
    const trash = await listDeleted();
    expect(trash.find((w) => w.id === target.id)?.deletedAt).toEqual(expect.any(Number));
  });

  it("soft-deleted 워크스페이스와 동일 path POST 는 409 workspace_soft_deleted 로 안내한다", async () => {
    const res = await fetch(`${url}/workspaces`, {
      method: "POST",
      headers,
      body: JSON.stringify({ name: "again", path: "/tmp/ad-test-owngo" }),
    });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body).toMatchObject({ error: "workspace_soft_deleted", name: "owngo" });
    expect(body.id).toEqual(expect.any(Number));
  });

  it("restore 로 휴지통에서 active 로 복귀한다", async () => {
    const trash = await listDeleted();
    const target = trash[0];
    const res = await fetch(`${url}/workspaces/${target.id}/restore`, { method: "POST", headers });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ id: target.id, deletedAt: null });
    expect((await listActive()).map((w) => w.id)).toContain(target.id);
    expect((await listDeleted()).map((w) => w.id)).not.toContain(target.id);
  });

  it("DELETE 시 활성 세션을 killSession + status='dead' 로 cascade 처리한다", async () => {
    const [target] = await listActive();
    handle.db
      .insert(sessions)
      .values({
        tmuxName: "ad-cascade-test",
        workspaceId: target.id,
        cli: "claude",
        args: "",
        status: "active",
        lastActivityAt: Date.now(),
        createdAt: Date.now(),
        adopted: 0,
      })
      .run();
    killSession.mockClear();

    const res = await fetch(`${url}/workspaces/${target.id}`, { method: "DELETE", headers });
    expect(res.status).toBe(204);
    expect(killSession).toHaveBeenCalledWith("ad-cascade-test");

    const list = (await (await fetch(`${url}/sessions`, { headers })).json()) as {
      sessions: Array<{ tmuxName: string; status: string }>;
    };
    expect(list.sessions.find((s) => s.tmuxName === "ad-cascade-test")?.status).toBe("dead");
  });

  it("permanent delete 는 wiki 디렉터리와 DB 행을 모두 정리한다", async () => {
    // 실제 디렉터리에 wiki 파일을 만들어 둔다
    const realDir = mkdtempSync(join(tmpdir(), "ad-perm-"));
    const wikiDir = join(realDir, "wiki");
    mkdirSync(wikiDir, { recursive: true });
    writeFileSync(join(wikiDir, "note.md"), "hello");

    const created = await (
      await fetch(`${url}/workspaces`, {
        method: "POST",
        headers,
        body: JSON.stringify({ name: "to-perm", path: realDir }),
      })
    ).json();

    // 먼저 soft delete
    await fetch(`${url}/workspaces/${created.id}`, { method: "DELETE", headers });

    // permanent delete
    const res = await fetch(`${url}/workspaces/${created.id}/permanent`, {
      method: "DELETE",
      headers,
    });
    expect(res.status).toBe(204);
    expect(existsSync(wikiDir)).toBe(false);
    expect((await listDeleted()).map((w) => w.id)).not.toContain(created.id);

    rmSync(realDir, { recursive: true, force: true });
  });

  it("active 워크스페이스에 permanent delete 는 409 로 거부한다", async () => {
    const created = await (
      await fetch(`${url}/workspaces`, {
        method: "POST",
        headers,
        body: JSON.stringify({ name: "live", path: "/tmp/ad-test-live" }),
      })
    ).json();
    const res = await fetch(`${url}/workspaces/${created.id}/permanent`, {
      method: "DELETE",
      headers,
    });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: "not_soft_deleted" });
  });
});
