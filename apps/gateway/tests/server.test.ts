import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createServer } from "../src/server";
import { openDatabase, type DbHandle } from "../src/db";
import { workspaces as workspacesTable } from "@agent-desk/shared/db/schema";

let dbHandle: DbHandle;
let dir: string;
let url: string;
let stop: () => Promise<void>;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "ad-srv-"));
  dbHandle = openDatabase({ filePath: join(dir, "agent-desk.sqlite") });
  const built = await createServer({
    db: dbHandle,
    token: "secret",
    cli: [],
    bind: "127.0.0.1",
    port: 0,
  });
  url = built.url;
  stop = built.close;
});

afterAll(async () => {
  await stop();
  dbHandle.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("gateway 서버", () => {
  it("인증 없이도 /health에 200을 응답한다 (liveness)", async () => {
    const res = await fetch(`${url}/health`);
    expect(res.status).toBe(200);
  });

  it("인증 없는 /sessions 요청을 거부한다", async () => {
    const res = await fetch(`${url}/sessions`);
    expect(res.status).toBe(401);
  });

  it("잘못된 토큰을 거부한다", async () => {
    const res = await fetch(`${url}/sessions`, {
      headers: { authorization: "Bearer wrong" },
    });
    expect(res.status).toBe(401);
  });

  it("올바른 토큰을 수락한다 (라우트 추가 전까지는 404 가능)", async () => {
    const res = await fetch(`${url}/sessions`, {
      headers: { authorization: "Bearer secret" },
    });
    expect([200, 404]).toContain(res.status);
  });

  it("기동 시 harnessEnabled 워크스페이스에는 harness 도 install 한다", async () => {
    const startupDir = mkdtempSync(join(tmpdir(), "ad-srv-startup-"));
    const startupDb = openDatabase({
      filePath: join(startupDir, "agent-desk.sqlite"),
    });
    startupDb.db
      .insert(workspacesTable)
      .values([
        {
          name: "h",
          path: "/tmp/h",
          createdAt: Date.now(),
          harnessEnabled: 1,
        },
        {
          name: "n",
          path: "/tmp/n",
          createdAt: Date.now(),
          harnessEnabled: 0,
        },
      ])
      .run();

    const allCalls: string[] = [];
    const harnessCalls: string[] = [];
    const fakeAll = vi.fn(async ({ workspacePath }: { workspacePath: string }) => {
      allCalls.push(workspacePath);
      return { results: [] };
    });
    const fakeHarness = vi.fn(
      async ({ workspacePath }: { workspacePath: string }) => {
        harnessCalls.push(workspacePath);
        return {
          status: "installed" as const,
          linkPath: "",
          sourcePath: "",
        };
      },
    );

    const server = await createServer({
      db: startupDb,
      token: "t",
      cli: [],
      bind: "127.0.0.1",
      port: 0,
      ensureAllSkillsFn: fakeAll,
      ensureHarnessFn: fakeHarness,
    });
    await new Promise((r) => setTimeout(r, 50)); // background dispatch flush
    await server.close();
    startupDb.close();
    rmSync(startupDir, { recursive: true, force: true });

    expect(allCalls.sort()).toEqual(["/tmp/h", "/tmp/n"]);
    expect(harnessCalls).toEqual(["/tmp/h"]);
  });
});
