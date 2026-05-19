import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer } from "../src/server";
import { openDatabase, type DbHandle } from "../src/db";

let dir: string;
let handle: DbHandle;
let url: string;
let stop: () => Promise<void>;
const TOKEN = "secret";
const headers = { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" };

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "ad-ws-"));
  handle = openDatabase({ filePath: join(dir, "db.sqlite") });
  const built = await createServer({
    db: handle,
    token: TOKEN,
    cli: [],
    bind: "127.0.0.1",
    port: 0,
  });
  url = built.url;
  stop = built.close;
});

afterAll(async () => {
  await stop();
  handle.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("workspaces 라우트", () => {
  it("처음에는 빈 목록을 반환한다", async () => {
    const res = await fetch(`${url}/workspaces`, { headers });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ workspaces: [] });
  });

  it("워크스페이스를 생성하고 반환한다", async () => {
    const res = await fetch(`${url}/workspaces`, {
      method: "POST",
      headers,
      body: JSON.stringify({ name: "owngo", path: "/workspaces/owngo" }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toMatchObject({
      id: expect.any(Number),
      name: "owngo",
      path: "/workspaces/owngo",
    });
  });

  it("중복 경로를 409로 거부한다", async () => {
    const res = await fetch(`${url}/workspaces`, {
      method: "POST",
      headers,
      body: JSON.stringify({ name: "owngo-2", path: "/workspaces/owngo" }),
    });
    expect(res.status).toBe(409);
  });

  it("잘못된 페이로드를 400으로 거부한다", async () => {
    const res = await fetch(`${url}/workspaces`, {
      method: "POST",
      headers,
      body: JSON.stringify({ name: "x", path: "relative" }),
    });
    expect(res.status).toBe(400);
  });

  it("id로 삭제한다", async () => {
    const list = (await (await fetch(`${url}/workspaces`, { headers })).json()) as {
      workspaces: Array<{ id: number }>;
    };
    const id = list.workspaces[0].id;
    const res = await fetch(`${url}/workspaces/${id}`, { method: "DELETE", headers });
    expect(res.status).toBe(204);
  });
});
