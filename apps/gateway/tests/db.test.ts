import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDatabase } from "../src/db";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ad-db-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("openDatabase", () => {
  it("data 디렉터리를 만들고 마이그레이션을 적용한다", () => {
    const dbFile = join(dir, "nested", "agent-desk.sqlite");
    const handle = openDatabase({ filePath: dbFile });
    expect(existsSync(dbFile)).toBe(true);
    const tables = handle.raw
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all() as Array<{ name: string }>;
    const names = tables.map((t) => t.name);
    expect(names).toEqual(
      expect.arrayContaining(["workspaces", "sessions", "session_events"])
    );
    handle.close();
  });

  it("WAL 모드를 활성화한다", () => {
    const dbFile = join(dir, "agent-desk.sqlite");
    const handle = openDatabase({ filePath: dbFile });
    const mode = handle.raw.pragma("journal_mode", { simple: true });
    expect(mode).toBe("wal");
    handle.close();
  });
});
