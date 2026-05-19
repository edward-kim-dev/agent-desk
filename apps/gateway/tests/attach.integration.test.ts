import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import { createServer } from "../src/server";
import { openDatabase, type DbHandle } from "../src/db";
import { workspaces, sessions } from "@agent-desk/shared/db/schema";

const HAS_TMUX = (() => {
  try {
    execFileSync("tmux", ["-V"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

const maybe = HAS_TMUX ? describe : describe.skip;

const TOKEN = "secret";

maybe("WS attach 통합 테스트", () => {
  let dir: string;
  let handle: DbHandle;
  let url: string;
  let stop: () => Promise<void>;
  let sessionId: number;
  let tmuxName: string;

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), "ad-att-"));
    handle = openDatabase({ filePath: join(dir, "db.sqlite") });
    const ws = handle.db
      .insert(workspaces)
      .values({ name: "tmp", path: dir, createdAt: Date.now() })
      .returning()
      .all();
    tmuxName = `ad-test-${Math.random().toString(36).slice(2, 8)}`;
    execFileSync("tmux", ["new-session", "-d", "-s", tmuxName, "-c", dir, "bash"]);
    const s = handle.db
      .insert(sessions)
      .values({
        tmuxName,
        workspaceId: ws[0].id,
        cli: "bash",
        args: "",
        status: "active",
        lastActivityAt: Date.now(),
        createdAt: Date.now(),
        adopted: 0,
      })
      .returning()
      .all();
    sessionId = s[0].id;

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
    try {
      execFileSync("tmux", ["kill-session", "-t", tmuxName]);
    } catch {}
    await stop();
    handle.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("토큰 없는 WS 연결을 거부한다", async () => {
    const wsUrl = url.replace("http", "ws") + `/sessions/${sessionId}/attach`;
    const sock = new WebSocket(wsUrl);
    await new Promise<void>((resolve) => {
      sock.on("close", (code) => {
        expect(code).toBe(4401);
        resolve();
      });
      sock.on("error", () => {});
    });
  });

  it("입력한 바이트를 PTY가 그대로 에코한다", async () => {
    const wsUrl =
      url.replace("http", "ws") +
      `/sessions/${sessionId}/attach?cols=80&rows=24&token=${TOKEN}`;
    const sock = new WebSocket(wsUrl);
    const chunks: string[] = [];

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("timeout")), 5000);
      sock.on("open", () => {
        sock.send("echo hello-pty\r");
      });
      sock.on("message", (data) => {
        chunks.push(data.toString());
        if (chunks.join("").includes("hello-pty")) {
          clearTimeout(timer);
          sock.close();
          resolve();
        }
      });
      sock.on("error", reject);
    });

    expect(chunks.join("")).toContain("hello-pty");
  });
});
