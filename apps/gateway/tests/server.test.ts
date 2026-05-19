import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer } from "../src/server";
import { openDatabase, type DbHandle } from "../src/db";

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
});
