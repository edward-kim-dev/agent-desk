import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDatabase, type DbHandle } from "../src/db";
import { runNightlyCleanup } from "../src/jobs/nightly-cleanup";
import { sessions } from "@agent-desk/shared/db/schema";

const DAY = 24 * 60 * 60 * 1000;
let dir: string;
let handle: DbHandle;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ad-clean-"));
  handle = openDatabase({ filePath: join(dir, "db.sqlite") });
});

afterEach(() => {
  handle.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("runNightlyCleanup", () => {
  it("7일 이상 비활성인 비-어돕션 세션을 dead로 마킹한다", () => {
    const now = Date.now();
    handle.db
      .insert(sessions)
      .values([
        {
          tmuxName: "old-self",
          adopted: 0,
          status: "active",
          lastActivityAt: now - 8 * DAY,
          createdAt: now - 8 * DAY,
          cli: "claude",
          args: "",
        },
        {
          tmuxName: "old-adopted",
          adopted: 1,
          status: "active",
          lastActivityAt: now - 8 * DAY,
          createdAt: now - 8 * DAY,
          cli: "claude",
          args: "",
        },
        {
          tmuxName: "fresh",
          adopted: 0,
          status: "active",
          lastActivityAt: now - 1 * DAY,
          createdAt: now - 1 * DAY,
          cli: "claude",
          args: "",
        },
      ])
      .run();
    const result = runNightlyCleanup({ db: handle.db, now, maxInactiveMs: 7 * DAY });
    expect(result.markedDeadIds).toHaveLength(1);
    const all = handle.db.select().from(sessions).all();
    const map = Object.fromEntries(all.map((s) => [s.tmuxName, s.status]));
    expect(map["old-self"]).toBe("dead");
    expect(map["old-adopted"]).toBe("active");
    expect(map["fresh"]).toBe("active");
  });
});
