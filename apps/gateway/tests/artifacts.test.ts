import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  sessions,
  workPackageArtifacts,
  workPackages,
  workspaces,
} from "@agent-desk/shared";
import { openDatabase, type DbHandle } from "../src/db";
import {
  reconcileArtifacts,
  scanArtifactDirs,
} from "../src/work-packages/artifacts";

let fsDir: string;
beforeEach(() => {
  fsDir = mkdtempSync(join(tmpdir(), "ad-art-"));
});
afterEach(() => {
  rmSync(fsDir, { recursive: true, force: true });
});

describe("scanArtifactDirs", () => {
  it("docs/superpowers/{specs,plans} 의 .md 파일을 sha256 과 함께 반환", async () => {
    mkdirSync(join(fsDir, "docs/superpowers/specs"), { recursive: true });
    mkdirSync(join(fsDir, "docs/superpowers/plans"), { recursive: true });
    writeFileSync(join(fsDir, "docs/superpowers/specs/a.md"), "hello");
    writeFileSync(join(fsDir, "docs/superpowers/plans/b.md"), "world");
    const out = await scanArtifactDirs(fsDir);
    const byPath = Object.fromEntries(out.map((e) => [e.relPath, e]));
    expect(byPath["docs/superpowers/specs/a.md"].sha256).toMatch(
      /^[a-f0-9]{64}$/,
    );
    expect(byPath["docs/superpowers/specs/a.md"].size).toBe(5);
    expect(byPath["docs/superpowers/plans/b.md"]).toBeTruthy();
  });

  it("non-.md 파일은 무시", async () => {
    mkdirSync(join(fsDir, "docs/superpowers/specs"), { recursive: true });
    writeFileSync(join(fsDir, "docs/superpowers/specs/note.txt"), "x");
    writeFileSync(join(fsDir, "docs/superpowers/specs/c.md"), "y");
    const out = await scanArtifactDirs(fsDir);
    expect(out.map((e) => e.relPath)).toEqual([
      "docs/superpowers/specs/c.md",
    ]);
  });

  it("디렉토리가 없으면 빈 배열", async () => {
    const out = await scanArtifactDirs(fsDir);
    expect(out).toEqual([]);
  });

  it("symlink 는 따라가지 않음", async () => {
    const target = mkdtempSync(join(tmpdir(), "ad-art-tgt-"));
    writeFileSync(join(target, "evil.md"), "x");
    mkdirSync(join(fsDir, "docs/superpowers/specs"), { recursive: true });
    symlinkSync(
      join(target, "evil.md"),
      join(fsDir, "docs/superpowers/specs/link.md"),
    );
    const out = await scanArtifactDirs(fsDir);
    expect(out.map((e) => e.relPath)).not.toContain(
      "docs/superpowers/specs/link.md",
    );
    rmSync(target, { recursive: true, force: true });
  });
});

describe("reconcileArtifacts", () => {
  let dbDir: string;
  let handle: DbHandle;
  let wpId: number;

  beforeEach(() => {
    dbDir = mkdtempSync(join(tmpdir(), "ad-rec-"));
    handle = openDatabase({ filePath: join(dbDir, "db.sqlite") });
    const w = handle.db
      .insert(workspaces)
      .values({ name: "ws", path: fsDir, createdAt: Date.now() })
      .returning()
      .all();
    const s = handle.db
      .insert(sessions)
      .values({
        tmuxName: "ad-rec-1",
        workspaceId: w[0].id,
        cli: "claude",
        args: "",
        status: "active",
        lastActivityAt: Date.now(),
        createdAt: Date.now(),
        adopted: 0,
      })
      .returning()
      .all();
    const wp = handle.db
      .insert(workPackages)
      .values({
        sessionId: s[0].id,
        packageId: "planning",
        currentStep: 1,
        status: "active",
        inputsJson: JSON.stringify({}),
        baselineJson: JSON.stringify({}),
        createdAt: Date.now(),
        advancedAt: Date.now(),
      })
      .returning()
      .all();
    wpId = wp[0].id;
  });

  afterEach(() => {
    handle.close();
    rmSync(dbDir, { recursive: true, force: true });
  });

  it("신규 파일은 INSERT, 변한 파일은 drift=1 로 UPDATE", async () => {
    mkdirSync(join(fsDir, "docs/superpowers/specs"), { recursive: true });
    writeFileSync(join(fsDir, "docs/superpowers/specs/foo.md"), "v1");

    const r1 = await reconcileArtifacts({
      db: handle.db,
      workPackageId: wpId,
      stepIndex: 1,
      workspacePath: fsDir,
      previousBaseline: {},
      now: 100,
    });
    expect(r1.inserted).toBe(1);
    expect(r1.updatedDrift).toBe(0);
    expect(r1.newBaseline["docs/superpowers/specs/foo.md"]).toMatch(
      /^[a-f0-9]{64}$/,
    );

    const rows1 = handle.db
      .select()
      .from(workPackageArtifacts)
      .where(eq(workPackageArtifacts.workPackageId, wpId))
      .all();
    expect(rows1).toHaveLength(1);
    expect(rows1[0].driftDetected).toBe(0);

    writeFileSync(
      join(fsDir, "docs/superpowers/specs/foo.md"),
      "v2 longer body",
    );
    const r2 = await reconcileArtifacts({
      db: handle.db,
      workPackageId: wpId,
      stepIndex: 2,
      workspacePath: fsDir,
      previousBaseline: r1.newBaseline,
      now: 200,
    });
    expect(r2.inserted).toBe(0);
    expect(r2.updatedDrift).toBe(1);

    const rows2 = handle.db
      .select()
      .from(workPackageArtifacts)
      .where(eq(workPackageArtifacts.workPackageId, wpId))
      .all();
    expect(rows2).toHaveLength(1);
    expect(rows2[0].driftDetected).toBe(1);
    expect(rows2[0].lastSeenAt).toBe(200);
  });
});
