import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { eq, and } from "drizzle-orm";
import { Hono } from "hono";
import { bearerAuth } from "../src/auth";
import {
  sessions,
  workPackageEvents,
  workPackages,
  workspaces,
} from "@agent-desk/shared";
import { progressRoutes } from "../src/routes/progress";
import { openDatabase, type DbHandle } from "../src/db";

const TOKEN = "secret";
const H = {
  authorization: `Bearer ${TOKEN}`,
  "content-type": "application/json",
};

let dir: string;
let fsRoot: string;
let handle: DbHandle;
let app: Hono;
let broadcast: ReturnType<typeof vi.fn>;
let wsId: number;
let sessionId: number;
let wpId: number;

beforeAll(async () => {
  dir    = mkdtempSync(join(tmpdir(), "ad-prog-"));
  fsRoot = mkdtempSync(join(tmpdir(), "ad-prog-fs-"));
  mkdirSync(join(fsRoot, "docs/superpowers/specs"),  { recursive: true });
  mkdirSync(join(fsRoot, "docs/superpowers/plans"), { recursive: true });

  handle = openDatabase({ filePath: join(dir, "db.sqlite") });

  const [ws] = handle.db
    .insert(workspaces)
    .values({ name: "test", path: fsRoot, createdAt: Date.now() })
    .returning().all();
  wsId = ws.id;
});

afterAll(async () => {
  handle.db.$client.close();
  rmSync(dir,    { recursive: true, force: true });
  rmSync(fsRoot, { recursive: true, force: true });
});

beforeEach(() => {
  broadcast = vi.fn();
  // fresh Hono app each test (broadcast mock reset)
  app = new Hono();
  app.use("*", bearerAuth(TOKEN));
  app.route("/sessions", progressRoutes({ db: handle.db, broadcast }));

  const now = Date.now();
  const [s] = handle.db
    .insert(sessions)
    .values({
      tmuxName: `s-${now}`,
      workspaceId: wsId,
      cli: "claude",
      args: "",
      status: "active",
      lastActivityAt: now,
      createdAt: now,
      adopted: 0,
    })
    .returning().all();
  sessionId = s.id;

  const [wp] = handle.db
    .insert(workPackages)
    .values({
      sessionId,
      packageId: "planning",
      currentStep: 1,
      status: "active",
      inputsJson: JSON.stringify({ topic: "test" }),
      baselineJson: JSON.stringify({}),
      createdAt: now,
      advancedAt: now,
    })
    .returning().all();
  wpId = wp.id;
});

// Helper: call via Hono.fetch (no real HTTP server needed)
function post(path: string, body: unknown) {
  return app.fetch(
    new Request(`http://localhost${path}`, {
      method: "POST",
      headers: H,
      body: JSON.stringify(body),
    }),
  );
}

describe("POST /sessions/:id/progress — filePath", () => {
  it("specs/ 안 파일 → recorded:true, stepReady:true, hook-file 이벤트 기록", async () => {
    const filePath = `${fsRoot}/docs/superpowers/specs/2026-05-28-foo.md`;
    writeFileSync(filePath, "# test");

    const res = await post(`/sessions/${sessionId}/progress`, { filePath });
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.recorded).toBe(true);
    expect(body.stepReady).toBe(true);

    const events = handle.db
      .select()
      .from(workPackageEvents)
      .where(and(
        eq(workPackageEvents.workPackageId, wpId),
        eq(workPackageEvents.kind, "hook-file"),
      ))
      .all();
    expect(events).toHaveLength(1);
    const payload = JSON.parse(events[0].payloadJson!);
    expect(payload.markerMatched).toBe(true);
    expect(payload.stepIndex).toBe(1);
    expect(broadcast).toHaveBeenCalledOnce();
  });

  it("상대 경로로 specs/ 안 파일 → stepReady:true (Claude Code는 상대 경로로 보냄)", async () => {
    const relPath = "docs/superpowers/specs/2026-05-28-relative.md";
    writeFileSync(join(fsRoot, relPath), "# test relative");

    const res = await post(`/sessions/${sessionId}/progress`, { filePath: relPath });
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.recorded).toBe(true);
    expect(body.stepReady).toBe(true);
    expect(broadcast).toHaveBeenCalledOnce();
  });

  it("plans/ 파일은 step 1에서 stepReady:false (wrong dir)", async () => {
    const filePath = `${fsRoot}/docs/superpowers/plans/2026-05-28-foo.md`;
    writeFileSync(filePath, "# test");

    const res = await post(`/sessions/${sessionId}/progress`, { filePath });
    const body = await res.json() as Record<string, unknown>;
    expect(body.stepReady).toBe(false);
    expect(broadcast).not.toHaveBeenCalled();
  });

  it("active work package 없으면 recorded:false", async () => {
    handle.db.update(workPackages)
      .set({ status: "completed", completedAt: Date.now() })
      .where(eq(workPackages.id, wpId))
      .run();

    const res = await post(`/sessions/${sessionId}/progress`, {
      filePath: `${fsRoot}/docs/superpowers/specs/x.md`,
    });
    const body = await res.json() as Record<string, unknown>;
    expect(body.recorded).toBe(false);
  });

  it("dead 세션이면 recorded:false", async () => {
    handle.db.update(sessions)
      .set({ status: "dead" })
      .where(eq(sessions.id, sessionId))
      .run();

    const res = await post(`/sessions/${sessionId}/progress`, {
      filePath: `${fsRoot}/docs/superpowers/specs/x.md`,
    });
    const body = await res.json() as Record<string, unknown>;
    expect(body.recorded).toBe(false);
  });
});

describe("error cases", () => {
  it("non-numeric session id → 400", async () => {
    const res = await post("/sessions/abc/progress", { filePath: "/some/path" });
    expect(res.status).toBe(400);
  });

  it("malformed JSON body → 400", async () => {
    const res = await app.fetch(
      new Request(`http://localhost/sessions/${sessionId}/progress`, {
        method: "POST",
        headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
        body: "not-valid-json",
      }),
    );
    expect(res.status).toBe(400);
  });

  it("invalid body schema (empty object) → 400", async () => {
    const res = await post(`/sessions/${sessionId}/progress`, {});
    expect(res.status).toBe(400);
  });
});

describe("POST /sessions/:id/progress — lastMessage", () => {
  it("lastMessage → recorded:true, stepReady:false, hook-turn 이벤트 기록", async () => {
    const res = await post(`/sessions/${sessionId}/progress`, {
      lastMessage: "브레인스토밍을 진행하겠습니다.",
    });
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.recorded).toBe(true);
    expect(body.stepReady).toBe(false);

    const events = handle.db
      .select()
      .from(workPackageEvents)
      .where(and(
        eq(workPackageEvents.workPackageId, wpId),
        eq(workPackageEvents.kind, "hook-turn"),
      ))
      .all();
    expect(events).toHaveLength(1);
    const payload = JSON.parse(events[0].payloadJson!);
    expect(payload.lastMessage).toBe("브레인스토밍을 진행하겠습니다.");
    expect(payload.markerMatched).toBe(false);
    expect(broadcast).not.toHaveBeenCalled();
  });
});
