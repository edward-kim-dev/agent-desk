import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openDatabase, type DbHandle } from "../src/db";
import { runDiscoveryTick } from "../src/tmux/discover";
import { sessions, sessionEvents } from "@agent-desk/shared/db/schema";

let dir: string;
let handle: DbHandle;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ad-disc-"));
  handle = openDatabase({ filePath: join(dir, "db.sqlite") });
});

afterEach(() => {
  handle.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("runDiscoveryTick", () => {
  it("외부에서 만든 세션을 어돕션한다", async () => {
    await runDiscoveryTick({
      db: handle.db,
      now: 1000,
      tmux: {
        listSessions: vi.fn(async () => [
          {
            name: "manual",
            createdAt: 999,
            attachedClients: 0,
            paneCurrentCommand: "claude",
          },
        ]),
      } as never,
    });
    const rows = handle.db.select().from(sessions).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      tmuxName: "manual",
      adopted: 1,
      status: "active",
      cli: "claude",
    });
    const events = handle.db.select().from(sessionEvents).all();
    expect(events.map((e) => e.kind)).toEqual(["adopted"]);
  });

  it("사라진 세션을 dead로 마킹한다", async () => {
    handle.db
      .insert(sessions)
      .values({
        tmuxName: "ghost",
        cli: "claude",
        args: "",
        status: "active",
        lastActivityAt: 100,
        createdAt: 100,
        adopted: 0,
      })
      .run();
    await runDiscoveryTick({
      db: handle.db,
      now: 2000,
      tmux: { listSessions: vi.fn(async () => []) } as never,
    });
    const row = handle.db
      .select()
      .from(sessions)
      .where(eq(sessions.tmuxName, "ghost"))
      .get();
    expect(row?.status).toBe("dead");
  });

  it("이미 알고 있는 세션을 중복 삽입하지 않는다", async () => {
    handle.db
      .insert(sessions)
      .values({
        tmuxName: "known",
        cli: "claude",
        args: "",
        status: "active",
        lastActivityAt: 100,
        createdAt: 100,
        adopted: 0,
      })
      .run();
    await runDiscoveryTick({
      db: handle.db,
      now: 2000,
      tmux: {
        listSessions: vi.fn(async () => [
          {
            name: "known",
            createdAt: 100,
            attachedClients: 1,
            paneCurrentCommand: "claude",
          },
        ]),
      } as never,
    });
    const rows = handle.db.select().from(sessions).all();
    expect(rows).toHaveLength(1);
  });
});
