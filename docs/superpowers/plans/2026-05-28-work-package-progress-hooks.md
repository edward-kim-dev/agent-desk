# Work Package Progress Hooks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Claude Code PostToolUse/Stop 훅이 매 turn마다 게이트웨이에 진행 상황을 전송하고, 게이트웨이가 step 완료를 판단해 WS로 웹 UI에 실시간 알림을 보낸다.

**Architecture:** 훅 스크립트(`wp-progress.js`)가 `AGENT_DESK_SESSION_ID` env로 세션을 특정해 `POST /sessions/:id/progress`를 호출. 게이트웨이는 `completionArtifactDir` prefix 매칭으로 step 완료를 판단하고 WS `/sessions/:id/progress` 채널로 push. 웹은 `step_ready` 이벤트 수신 시 오버레이를 표시한다.

**Tech Stack:** TypeScript, Hono, drizzle-orm + better-sqlite3, Zod, Next.js (React), vitest, Node.js `ws`, Node.js `http`/`https`/`path` (훅 스크립트 표준 라이브러리만 사용)

**Spec:** [specs/2026-05-27-work-package-progress-hooks-design.md](../specs/2026-05-27-work-package-progress-hooks-design.md)

**Commit policy:** Phase 끝에 한 번씩. TDD red→green 단계마다 commit 금지.

---

## File Structure

**New (packages/shared):**
- `packages/shared/src/api/work-package.ts` — `reportProgressRequest` DTO 추가 (수정)
- `packages/shared/src/packages/types.ts` — `StepDefinition.completionArtifactDir` 추가 (수정)
- `packages/shared/src/packages/definitions/planning.ts` — 각 step에 `completionArtifactDir` 값 추가 (수정)
- `packages/shared/src/db/schema.ts` — `workPackageEvents.kind` enum에 `hook-file`, `hook-turn` 추가 (수정)

**New (apps/gateway):**
- `apps/gateway/src/hooks/wp-progress.js` — 배포용 훅 스크립트 원본 (신규)
- `apps/gateway/src/routes/progress.ts` — `POST /sessions/:id/progress` 라우트 (신규)
- `apps/gateway/src/ws/progress-server.ts` — WS 진행 채널 + `broadcastStepReady` (신규)
- `apps/gateway/drizzle/0005_work_package_progress_hooks.sql` — kind enum 스냅샷 갱신 (신규)
- `apps/gateway/tests/progress.test.ts` — progress 라우트 통합 테스트 (신규)
- `apps/gateway/tests/progress-hook-install.test.ts` — 훅 설치/제거 단위 테스트 (신규)
- `apps/gateway/tests/progress-server.test.ts` — WS broadcast 단위 테스트 (신규)

**Modified (apps/gateway):**
- `apps/gateway/src/skills/install.ts` — `ensureProgressHookInstalled` / `ensureProgressHookRemoved` 추가
- `apps/gateway/src/routes/sessions.ts` — `sessionEnv`에 3개 env 주입, `opts.gatewayUrl` + `opts.token` 수신
- `apps/gateway/src/routes/workspaces.ts` — 워크스페이스 삭제 시 `ensureProgressHookRemoved` 호출, 생성 시 `ensureProgressHookInstalled` 호출
- `apps/gateway/src/ws/attach-server.ts` — 미매칭 upgrade를 `socket.destroy()` 대신 통과
- `apps/gateway/src/server.ts` — progress 라우트 마운트, progress WS 서버 등록, `gatewayUrl` 조립 + 전달

**New (apps/web):**
- `apps/web/hooks/use-progress-socket.ts` — WS 연결 관리 custom hook (신규)
- `apps/web/components/step-ready-overlay.tsx` — step 완료 감지 오버레이 (신규)
- `apps/web/tests/use-progress-socket.test.ts` — hook 단위 테스트 (신규)
- `apps/web/tests/step-ready-overlay.test.tsx` — 컴포넌트 테스트 (신규)

**Modified (apps/web):**
- `apps/web/components/tabs/terminal-tab.tsx` — `useProgressSocket` + `StepReadyOverlay` 연결

---

## Phase 1 — Shared 타입 + 스키마 확장

### Task 1: StepDefinition에 completionArtifactDir 추가

**Files:**
- Modify: `packages/shared/src/packages/types.ts`
- Modify: `packages/shared/src/packages/definitions/planning.ts`
- Modify: `packages/shared/src/api/work-package.ts`
- Modify: `packages/shared/src/db/schema.ts`
- Test: `packages/shared/tests/packages.test.ts`

- [ ] **Step 1: 테스트 작성 — completionArtifactDir 검증**

`packages/shared/tests/packages.test.ts`에 추가:

```typescript
describe("planning package completionArtifactDir", () => {
  it("step 1 completionArtifactDir는 docs/superpowers/specs/ 이다", () => {
    const step1 = planning.steps.find((s) => s.index === 1);
    expect(step1?.completionArtifactDir).toBe("docs/superpowers/specs/");
  });

  it("step 2 completionArtifactDir는 docs/superpowers/plans/ 이다", () => {
    const step2 = planning.steps.find((s) => s.index === 2);
    expect(step2?.completionArtifactDir).toBe("docs/superpowers/plans/");
  });
});
```

- [ ] **Step 2: 테스트 실행 → FAIL 확인**

```bash
cd /workspaces/owngo/agent-desk
pnpm --filter @agent-desk/shared test -- --reporter=verbose 2>&1 | grep -E "PASS|FAIL|completionArtifact"
```

Expected: `completionArtifactDir` 프로퍼티 없음으로 FAIL

- [ ] **Step 3: StepDefinition 타입에 completionArtifactDir 추가**

`packages/shared/src/packages/types.ts` 전체 교체:

```typescript
import type { z } from "zod";

export interface FieldSpec {
  name: string;
  label: string;
  hint?: string;
  kind: "text" | "textarea";
  required?: boolean;
  maxLength?: number;
  placeholder?: string;
  rows?: number;
}

export interface StartForm<S extends z.ZodTypeAny = z.ZodTypeAny> {
  schema: S;
  fields: FieldSpec[];
}

export interface StepContext {
  workspacePath: string;
  packageInstanceId: number;
}

export interface StepDefinition<I = unknown> {
  index: number;
  title: string;
  skillName: string;
  promptTemplate: (inputs: I, ctx: StepContext) => string;
  /**
   * step 완료 신호로 사용할 artifact 디렉토리.
   * workspace 상대 경로, 끝에 `/` 포함. 예: "docs/superpowers/specs/"
   * PostToolUse hook이 쓴 파일 경로가 이 prefix 안에 있으면 step_ready 판단.
   */
  completionArtifactDir: string;
}

export interface PackageDefinition<I = unknown> {
  id: string;
  title: string;
  description: string;
  cliRequirement: "claude" | "any";
  startForm: StartForm;
  steps: StepDefinition<I>[];
}
```

- [ ] **Step 4: planning.ts에 completionArtifactDir 값 추가**

`packages/shared/src/packages/definitions/planning.ts`의 `steps` 배열 교체:

```typescript
  steps: [
    {
      index: 1,
      title: "Brainstorm",
      skillName: "brainstorming",
      promptTemplate: (inputs) => formatBrainstormingPrompt(inputs),
      completionArtifactDir: "docs/superpowers/specs/",
    },
    {
      index: 2,
      title: "Write plan",
      skillName: "writing-plans",
      promptTemplate: () => "/writing-plans",
      completionArtifactDir: "docs/superpowers/plans/",
    },
  ],
```

- [ ] **Step 5: work_package_events kind enum 확장**

`packages/shared/src/db/schema.ts`의 `workPackageEvents.kind` 수정:

```typescript
export const workPackageEvents = sqliteTable("work_package_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  workPackageId: integer("work_package_id")
    .notNull()
    .references(() => workPackages.id),
  kind: text("kind", {
    enum: [
      "started",
      "step-injected",
      "step-inject-failed",
      "advanced",
      "completed",
      "abandoned",
      "hook-file",
      "hook-turn",
    ],
  }).notNull(),
  payloadJson: text("payload_json"),
  at: integer("at").notNull(),
});
```

- [ ] **Step 6: reportProgressRequest DTO 추가**

`packages/shared/src/api/work-package.ts` 맨 끝에 추가:

```typescript
export const reportProgressRequest = z.union([
  z.object({ filePath: z.string().min(1) }),
  z.object({ lastMessage: z.string().min(1).max(500) }),
]);
export type ReportProgressRequest = z.infer<typeof reportProgressRequest>;

export const reportProgressResponse = z.object({
  recorded: z.boolean(),
  stepReady: z.boolean().optional(),
});
export type ReportProgressResponse = z.infer<typeof reportProgressResponse>;
```

- [ ] **Step 7: shared index.ts에 re-export 추가**

`packages/shared/src/index.ts`에 추가 (기존 api/work-package re-export 옆에):

```typescript
export type { ReportProgressRequest, ReportProgressResponse } from "./api/work-package";
export { reportProgressRequest, reportProgressResponse } from "./api/work-package";
```

- [ ] **Step 8: 테스트 실행 → PASS 확인**

```bash
pnpm --filter @agent-desk/shared test -- --reporter=verbose 2>&1 | grep -E "PASS|FAIL|completionArtifact"
```

Expected: 2개 테스트 PASS

- [ ] **Step 9: typecheck**

```bash
pnpm --filter @agent-desk/shared typecheck
pnpm --filter @agent-desk/gateway typecheck
pnpm --filter @agent-desk/web typecheck
```

Expected: 에러 0 (planning.ts의 TypeScript 컴파일 포함)

---

### Task 2: Drizzle 마이그레이션 생성

**Files:**
- Create: `apps/gateway/drizzle/0005_work_package_progress_hooks.sql`

- [ ] **Step 1: drizzle-kit generate 실행**

```bash
cd /workspaces/owngo/agent-desk
pnpm --filter @agent-desk/gateway exec drizzle-kit generate --name work_package_progress_hooks
```

Expected: `apps/gateway/drizzle/0005_work_package_progress_hooks.sql` 생성

> **Note:** SQLite에서 Drizzle enum은 TypeScript 레벨만이라 DB CHECK constraint 없음. 생성된 SQL이 거의 비어있을 수 있음 — 스냅샷 갱신이 목적.

- [ ] **Step 2: 생성된 SQL 확인**

```bash
cat apps/gateway/drizzle/0005_work_package_progress_hooks.sql
```

내용 무관하게 파일 존재 + meta/_journal.json 갱신 확인.

---

## Phase 2 — Gateway: 훅 스크립트 + 라우트 + WS

### Task 3: 훅 스크립트 작성

**Files:**
- Create: `apps/gateway/src/hooks/wp-progress.js`

- [ ] **Step 1: 스크립트 생성**

`apps/gateway/src/hooks/wp-progress.js` 신규 생성:

```js
#!/usr/bin/env node
// wp-progress.js — agent-desk work-package 진행 추적
// Claude Code PostToolUse(Write|Edit) 및 Stop 훅에서 호출
// Node.js CJS — Windows/Mac/Linux 공통. 항상 exit(0).
//
// TODO(v2-codex): Codex PostToolUse는 apply_patch 도구 사용.
//   file_path가 unified diff에 임베드 → grep '+++ b/' | sed 파싱 필요.
//   설정: .codex/hooks.json  matcher: "apply_patch"
//
// TODO(v2-gemini): Gemini AfterTool, tool_name="write_file",
//   tool_input.file_path 직접 접근 (Claude Code 동일 구조).
//   설정: .gemini/settings.json  matcher: "write_.*"

"use strict";
const path  = require("path");
const http  = require("http");
const https = require("https");

const sessionId = process.env.AGENT_DESK_SESSION_ID;
const baseUrl   = process.env.AGENT_DESK_URL;
const token     = process.env.AGENT_DESK_TOKEN;

if (!sessionId || !baseUrl || !token) process.exit(0);

let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (c) => { raw += c; });
process.stdin.on("end", () => {
  try { run(JSON.parse(raw)); } catch { /* 파싱 실패 무시 */ }
  process.exit(0);
});

function run(input) {
  const event = input.hook_event_name ?? "";
  const tool  = input.tool_name ?? "";
  let payload = null;

  if (event === "PostToolUse" && (tool === "Write" || tool === "Edit")) {
    const fp = input.tool_input?.file_path;
    if (!fp) return;
    payload = { filePath: path.normalize(fp).replace(/\\/g, "/") };
  } else if (event === "Stop") {
    const msg = (input.last_assistant_message ?? "").slice(0, 500);
    if (!msg) return;
    payload = { lastMessage: msg };
  } else {
    return;
  }

  post(`${baseUrl}/sessions/${sessionId}/progress`, payload, token);
}

function post(url, body, bearerToken) {
  const data   = Buffer.from(JSON.stringify(body), "utf8");
  const parsed = new URL(url);
  const lib    = parsed.protocol === "https:" ? https : http;
  const req    = lib.request({
    hostname: parsed.hostname,
    port:     parsed.port || (parsed.protocol === "https:" ? 443 : 80),
    path:     parsed.pathname + parsed.search,
    method:   "POST",
    headers: {
      "Content-Type":   "application/json",
      "Content-Length": data.length,
      "Authorization":  `Bearer ${bearerToken}`,
    },
    timeout: 3000,
  });
  req.on("error",   () => { /* 실패 무시 */ });
  req.on("timeout", () => { req.destroy(); });
  req.write(data);
  req.end();
}
```

- [ ] **Step 2: 스크립트 직접 실행 테스트 (smoke test)**

```bash
# PostToolUse Write 케이스
echo '{"hook_event_name":"PostToolUse","tool_name":"Write","tool_input":{"file_path":"/ws/docs/superpowers/specs/foo.md"}}' \
  | AGENT_DESK_SESSION_ID=42 AGENT_DESK_URL=http://127.0.0.1:9999 AGENT_DESK_TOKEN=test \
    node apps/gateway/src/hooks/wp-progress.js
echo "exit: $?"
```

Expected: exit 0 (연결 실패는 무시하므로 에러 없이 종료)

```bash
# env 없을 때 즉시 종료
echo '{}' | node apps/gateway/src/hooks/wp-progress.js
echo "exit: $?"
```

Expected: exit 0

---

### Task 4: Progress 라우트 (`POST /sessions/:id/progress`)

**Files:**
- Create: `apps/gateway/src/routes/progress.ts`
- Create: `apps/gateway/tests/progress.test.ts`

- [ ] **Step 1: 테스트 파일 작성**

`apps/gateway/tests/progress.test.ts` 신규 생성:

```typescript
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
import {
  sessions,
  workPackageEvents,
  workPackages,
  workspaces,
} from "@agent-desk/shared";
import { createServer } from "../src/server";
import { openDatabase, type DbHandle } from "../src/db";

const TOKEN = "secret";
const H = {
  authorization: `Bearer ${TOKEN}`,
  "content-type": "application/json",
};

let dir: string;
let fsRoot: string;
let handle: DbHandle;
let url: string;
let stop: () => Promise<void>;
let wsId: number;
let sessionId: number;
let wpId: number;

const newSession = vi.fn(async () => {});
const injectFn   = vi.fn(async () => ({ injected: true }));
const ensureSkillFn = vi.fn(async () => ({
  status: "installed" as const,
  linkPath: "/tmp/x/.claude/skills/brainstorming",
  sourcePath: "/tmp/v/brainstorming",
}));

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

  const server = await createServer({
    db: handle,
    token: TOKEN,
    cli: [{ name: "claude", command: "claude", defaultArgs: [] }],
    bind: "127.0.0.1",
    port: 0,
    tmux: {
      listSessions: vi.fn(async () => []),
      newSession,
      killSession: vi.fn(async () => {}),
      hasSession: vi.fn(async () => false),
      sendKeys: vi.fn(async () => {}),
      capturePane: vi.fn(async () => ""),
      paneCurrentCommand: vi.fn(async () => null),
      paneChildren: vi.fn(async () => []),
    },
    injectFn,
    ensureSkillFn,
    startBackgroundJobs: false,
    installSkillsOnStartup: false,
  });
  url  = server.url;
  stop = server.close;
});

afterAll(async () => {
  await stop();
  handle.db.$client.close();
  rmSync(dir,    { recursive: true, force: true });
  rmSync(fsRoot, { recursive: true, force: true });
});

beforeEach(() => {
  // 매 테스트 전 세션 + work package 새로 생성
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

describe("POST /sessions/:id/progress — filePath", () => {
  it("specs/ 안 파일 → recorded:true, stepReady:true, hook-file 이벤트 기록", async () => {
    const filePath = `${fsRoot}/docs/superpowers/specs/2026-05-28-foo.md`;
    writeFileSync(filePath, "# test");

    const res = await fetch(`${url}/sessions/${sessionId}/progress`, {
      method: "POST",
      headers: H,
      body: JSON.stringify({ filePath }),
    });
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
  });

  it("plans/ 파일은 step 1에서 stepReady:false (wrong dir)", async () => {
    const filePath = `${fsRoot}/docs/superpowers/plans/2026-05-28-foo.md`;
    writeFileSync(filePath, "# test");

    const res = await fetch(`${url}/sessions/${sessionId}/progress`, {
      method: "POST",
      headers: H,
      body: JSON.stringify({ filePath }),
    });
    const body = await res.json() as Record<string, unknown>;
    expect(body.stepReady).toBe(false);
  });

  it("active work package 없으면 recorded:false", async () => {
    handle.db.update(workPackages)
      .set({ status: "completed", completedAt: Date.now() })
      .where(eq(workPackages.id, wpId))
      .run();

    const res = await fetch(`${url}/sessions/${sessionId}/progress`, {
      method: "POST",
      headers: H,
      body: JSON.stringify({ filePath: `${fsRoot}/docs/superpowers/specs/x.md` }),
    });
    const body = await res.json() as Record<string, unknown>;
    expect(body.recorded).toBe(false);
  });

  it("dead 세션이면 recorded:false", async () => {
    handle.db.update(sessions)
      .set({ status: "dead" })
      .where(eq(sessions.id, sessionId))
      .run();

    const res = await fetch(`${url}/sessions/${sessionId}/progress`, {
      method: "POST",
      headers: H,
      body: JSON.stringify({ filePath: `${fsRoot}/docs/superpowers/specs/x.md` }),
    });
    const body = await res.json() as Record<string, unknown>;
    expect(body.recorded).toBe(false);
  });
});

describe("POST /sessions/:id/progress — lastMessage", () => {
  it("lastMessage → recorded:true, stepReady:false, hook-turn 이벤트 기록", async () => {
    const res = await fetch(`${url}/sessions/${sessionId}/progress`, {
      method: "POST",
      headers: H,
      body: JSON.stringify({ lastMessage: "브레인스토밍을 진행하겠습니다." }),
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
  });
});
```

- [ ] **Step 2: 테스트 실행 → FAIL 확인**

```bash
pnpm --filter @agent-desk/gateway test -- tests/progress.test.ts --reporter=verbose 2>&1 | tail -20
```

Expected: `progress.ts` 라우트 없어서 404/FAIL

- [ ] **Step 3: progress 라우트 구현**

`apps/gateway/src/routes/progress.ts` 신규 생성:

```typescript
import { Hono } from "hono";
import { eq, and } from "drizzle-orm";
import path from "node:path";
import {
  PACKAGES,
  reportProgressRequest,
  sessions,
  workPackageEvents,
  workPackages,
  workspaces,
} from "@agent-desk/shared";
import type { DbHandle } from "../db";
import type { broadcastStepReady } from "../ws/progress-server";

export function progressRoutes(opts: {
  db: DbHandle["db"];
  broadcast: typeof broadcastStepReady;
}): Hono {
  const r = new Hono();

  r.post("/:id/progress", async (c) => {
    const sessionId = Number(c.req.param("id"));
    if (!Number.isInteger(sessionId))
      return c.json({ error: "bad_id" }, 400);

    const parsed = reportProgressRequest.safeParse(await c.req.json());
    if (!parsed.success)
      return c.json({ error: "invalid_request" }, 400);

    // 세션 조회
    const session = opts.db
      .select()
      .from(sessions)
      .where(eq(sessions.id, sessionId))
      .get();
    if (!session || session.status !== "active")
      return c.json({ recorded: false });

    // active work_package 조회
    const wp = opts.db
      .select()
      .from(workPackages)
      .where(
        and(
          eq(workPackages.sessionId, sessionId),
          eq(workPackages.status, "active"),
        ),
      )
      .get();
    if (!wp) return c.json({ recorded: false });

    // 워크스페이스 경로
    const ws = opts.db
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, session.workspaceId!))
      .get();
    if (!ws) return c.json({ recorded: false });

    const definition = PACKAGES[wp.packageId];
    if (!definition) return c.json({ recorded: false });

    const step = definition.steps.find((s) => s.index === wp.currentStep);
    if (!step) return c.json({ recorded: false });

    const now = Date.now();
    const data = parsed.data;
    let markerMatched = false;

    if ("filePath" in data) {
      // completionArtifactDir prefix 매칭
      const absDir = path.normalize(
        path.join(ws.path, step.completionArtifactDir),
      );
      const absFile = path.normalize(data.filePath);
      markerMatched = absFile.startsWith(absDir);

      opts.db
        .insert(workPackageEvents)
        .values({
          workPackageId: wp.id,
          kind: "hook-file",
          payloadJson: JSON.stringify({
            stepIndex: wp.currentStep,
            filePath: data.filePath,
            markerMatched,
          }),
          at: now,
        })
        .run();

      if (markerMatched) {
        opts.broadcast({
          sessionId,
          workPackageId: wp.id,
          stepIndex: wp.currentStep,
          stepTitle: step.title,
        });
      }
    } else {
      // lastMessage — 기록 전용
      opts.db
        .insert(workPackageEvents)
        .values({
          workPackageId: wp.id,
          kind: "hook-turn",
          payloadJson: JSON.stringify({
            stepIndex: wp.currentStep,
            lastMessage: data.lastMessage,
            markerMatched: false,
          }),
          at: now,
        })
        .run();
    }

    return c.json({ recorded: true, stepReady: markerMatched });
  });

  return r;
}
```

- [ ] **Step 4: 테스트 실행 → PASS 확인**

```bash
pnpm --filter @agent-desk/gateway test -- tests/progress.test.ts --reporter=verbose 2>&1 | tail -20
```

Expected: 5개 테스트 모두 PASS

---

### Task 5: WS Progress 서버

**Files:**
- Create: `apps/gateway/src/ws/progress-server.ts`
- Create: `apps/gateway/tests/progress-server.test.ts`
- Modify: `apps/gateway/src/ws/attach-server.ts`

- [ ] **Step 1: 테스트 작성**

`apps/gateway/tests/progress-server.test.ts` 신규 생성:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createProgressServer,
  type ProgressServer,
} from "../src/ws/progress-server";

function makeWs(readyState = 1 /* OPEN */) {
  return { readyState, send: vi.fn(), close: vi.fn() };
}

let server: ProgressServer;

beforeEach(() => {
  server = createProgressServer();
});

describe("subscribe / unsubscribe", () => {
  it("subscribe 후 broadcast → send 호출", () => {
    const ws = makeWs();
    server.subscribe(1, ws as never);
    server.broadcastStepReady({
      sessionId: 1,
      workPackageId: 10,
      stepIndex: 1,
      stepTitle: "Brainstorm",
    });
    expect(ws.send).toHaveBeenCalledOnce();
    const msg = JSON.parse((ws.send as ReturnType<typeof vi.fn>).mock.calls[0][0]);
    expect(msg).toEqual({
      type: "step_ready",
      workPackageId: 10,
      stepIndex: 1,
      stepTitle: "Brainstorm",
    });
  });

  it("unsubscribe 후 broadcast → send 미호출", () => {
    const ws = makeWs();
    server.subscribe(1, ws as never);
    server.unsubscribe(1, ws as never);
    server.broadcastStepReady({
      sessionId: 1, workPackageId: 10, stepIndex: 1, stepTitle: "Brainstorm",
    });
    expect(ws.send).not.toHaveBeenCalled();
  });

  it("CLOSED 상태 ws는 send 건너뜀", () => {
    const ws = makeWs(3 /* CLOSED */);
    server.subscribe(1, ws as never);
    server.broadcastStepReady({
      sessionId: 1, workPackageId: 10, stepIndex: 1, stepTitle: "Brainstorm",
    });
    expect(ws.send).not.toHaveBeenCalled();
  });

  it("구독자 없는 세션 broadcast → 에러 없음", () => {
    expect(() =>
      server.broadcastStepReady({
        sessionId: 99, workPackageId: 10, stepIndex: 1, stepTitle: "Brainstorm",
      }),
    ).not.toThrow();
  });
});
```

- [ ] **Step 2: 테스트 실행 → FAIL 확인**

```bash
pnpm --filter @agent-desk/gateway test -- tests/progress-server.test.ts --reporter=verbose 2>&1 | tail -15
```

Expected: 모듈 없음으로 FAIL

- [ ] **Step 3: progress-server.ts 구현**

`apps/gateway/src/ws/progress-server.ts` 신규 생성:

```typescript
import { WebSocketServer } from "ws";
import type { WebSocket } from "ws";
import type { IncomingMessage, Server } from "node:http";

export interface StepReadyEvent {
  sessionId: number;
  workPackageId: number;
  stepIndex: number;
  stepTitle: string;
}

export interface ProgressServer {
  subscribe: (sessionId: number, ws: WebSocket) => void;
  unsubscribe: (sessionId: number, ws: WebSocket) => void;
  broadcastStepReady: (event: StepReadyEvent) => void;
  attachToHttpServer: (httpServer: Server, token: string, db: { select: () => { from: (t: unknown) => { where: (c: unknown) => { get: () => unknown } } } }) => void;
}

export function createProgressServer(): ProgressServer {
  const subs = new Map<number, Set<WebSocket>>();

  function subscribe(sessionId: number, ws: WebSocket) {
    if (!subs.has(sessionId)) subs.set(sessionId, new Set());
    subs.get(sessionId)!.add(ws);
  }

  function unsubscribe(sessionId: number, ws: WebSocket) {
    subs.get(sessionId)?.delete(ws);
  }

  function broadcastStepReady(event: StepReadyEvent) {
    const clients = subs.get(event.sessionId);
    if (!clients?.size) return;
    const msg = JSON.stringify({
      type: "step_ready",
      workPackageId: event.workPackageId,
      stepIndex: event.stepIndex,
      stepTitle: event.stepTitle,
    });
    for (const ws of clients) {
      if (ws.readyState === ws.OPEN) ws.send(msg);
    }
  }

  function attachToHttpServer(
    httpServer: Server,
    token: string,
    db: Parameters<ProgressServer["attachToHttpServer"]>[2],
  ) {
    const wss = new WebSocketServer({ noServer: true });

    httpServer.on("upgrade", (req: IncomingMessage, socket, head) => {
      const url = new URL(req.url ?? "/", "http://localhost");
      const match = url.pathname.match(/^\/sessions\/(\d+)\/progress$/);
      if (!match) {
        // 매칭 안 되면 파괴하지 않음 — attach-server 등 다른 핸들러가 처리
        return;
      }

      const sessionId = Number(match[1]);
      const provided  =
        url.searchParams.get("token") ??
        (req.headers.authorization?.toLowerCase().startsWith("bearer ")
          ? req.headers.authorization.slice(7)
          : null);

      wss.handleUpgrade(req, socket, head, (ws) => {
        if (provided !== token) { ws.close(4401, "unauthorized"); return; }

        subscribe(sessionId, ws);
        ws.on("close", () => unsubscribe(sessionId, ws));
      });
    });
  }

  return { subscribe, unsubscribe, broadcastStepReady, attachToHttpServer };
}

// 싱글턴 인스턴스 — server.ts가 import해서 사용
export const progressServer = createProgressServer();
export const broadcastStepReady = progressServer.broadcastStepReady.bind(progressServer);
```

- [ ] **Step 4: attach-server.ts 수정 — 미매칭 upgrade 통과**

`apps/gateway/src/ws/attach-server.ts`에서 `socket.destroy()` 제거:

```typescript
// 변경 전
if (!match) {
  socket.destroy();
  return;
}

// 변경 후
if (!match) {
  // 다른 upgrade 핸들러(progress-server 등)가 처리하도록 통과
  return;
}
```

- [ ] **Step 5: 테스트 실행 → PASS 확인**

```bash
pnpm --filter @agent-desk/gateway test -- tests/progress-server.test.ts --reporter=verbose 2>&1 | tail -15
```

Expected: 4개 테스트 모두 PASS

---

### Task 6: 훅 설치/제거 + 세션 env 주입

**Files:**
- Modify: `apps/gateway/src/skills/install.ts`
- Create: `apps/gateway/tests/progress-hook-install.test.ts`
- Modify: `apps/gateway/src/routes/sessions.ts`

- [ ] **Step 1: 설치 테스트 작성**

`apps/gateway/tests/progress-hook-install.test.ts` 신규 생성:

```typescript
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, afterEach } from "vitest";
import {
  ensureProgressHookInstalled,
  ensureProgressHookRemoved,
} from "../src/skills/install";

let tmp: string;

afterEach(() => {
  if (tmp) rmSync(tmp, { recursive: true, force: true });
});

describe("ensureProgressHookInstalled", () => {
  it("wp-progress.js를 .claude/hooks/에 복사하고 settings.json에 훅 등록", async () => {
    tmp = mkdtempSync(join(tmpdir(), "ad-hook-install-"));
    await ensureProgressHookInstalled(tmp);

    const hookPath = join(tmp, ".claude", "hooks", "wp-progress.js");
    expect(existsSync(hookPath)).toBe(true);

    const settings = JSON.parse(
      readFileSync(join(tmp, ".claude", "settings.json"), "utf8"),
    );
    const postHooks = settings.hooks?.PostToolUse ?? [];
    expect(
      postHooks.some((h: { hooks: { command: string }[] }) =>
        h.hooks?.some((hh) => hh.command?.includes("wp-progress.js")),
      ),
    ).toBe(true);
    const stopHooks = settings.hooks?.Stop ?? [];
    expect(
      stopHooks.some((h: { hooks: { command: string }[] }) =>
        h.hooks?.some((hh) => hh.command?.includes("wp-progress.js")),
      ),
    ).toBe(true);
  });

  it("idempotent — 두 번 호출해도 중복 항목 없음", async () => {
    tmp = mkdtempSync(join(tmpdir(), "ad-hook-install-"));
    await ensureProgressHookInstalled(tmp);
    await ensureProgressHookInstalled(tmp);

    const settings = JSON.parse(
      readFileSync(join(tmp, ".claude", "settings.json"), "utf8"),
    );
    const postHooks = settings.hooks?.PostToolUse ?? [];
    const wpEntries = postHooks.filter((h: { hooks: { command: string }[] }) =>
      h.hooks?.some((hh) => hh.command?.includes("wp-progress.js")),
    );
    expect(wpEntries).toHaveLength(1);
  });

  it("기존 settings.json에 다른 훅이 있으면 보존", async () => {
    tmp = mkdtempSync(join(tmpdir(), "ad-hook-install-"));
    const settingsPath = join(tmp, ".claude", "settings.json");
    const { mkdirSync, writeFileSync } = await import("node:fs");
    mkdirSync(join(tmp, ".claude"), { recursive: true });
    writeFileSync(
      settingsPath,
      JSON.stringify({
        hooks: {
          PostToolUse: [
            { matcher: "Bash", hooks: [{ type: "command", command: "other.sh" }] },
          ],
        },
      }),
    );

    await ensureProgressHookInstalled(tmp);

    const settings = JSON.parse(readFileSync(settingsPath, "utf8"));
    const postHooks = settings.hooks?.PostToolUse ?? [];
    expect(postHooks).toHaveLength(2);
    expect(
      postHooks.some((h: { matcher: string }) => h.matcher === "Bash"),
    ).toBe(true);
  });
});

describe("ensureProgressHookRemoved", () => {
  it("wp-progress.js 삭제 + settings.json에서 항목 제거", async () => {
    tmp = mkdtempSync(join(tmpdir(), "ad-hook-install-"));
    await ensureProgressHookInstalled(tmp);
    await ensureProgressHookRemoved(tmp);

    const hookPath = join(tmp, ".claude", "hooks", "wp-progress.js");
    expect(existsSync(hookPath)).toBe(false);

    const settings = JSON.parse(
      readFileSync(join(tmp, ".claude", "settings.json"), "utf8"),
    );
    const postHooks = settings.hooks?.PostToolUse ?? [];
    expect(
      postHooks.some((h: { hooks: { command: string }[] }) =>
        h.hooks?.some((hh) => hh.command?.includes("wp-progress.js")),
      ),
    ).toBe(false);
  });

  it("이미 없어도 에러 없음", async () => {
    tmp = mkdtempSync(join(tmpdir(), "ad-hook-install-"));
    await expect(ensureProgressHookRemoved(tmp)).resolves.not.toThrow();
  });
});
```

- [ ] **Step 2: 테스트 실행 → FAIL 확인**

```bash
pnpm --filter @agent-desk/gateway test -- tests/progress-hook-install.test.ts --reporter=verbose 2>&1 | tail -15
```

Expected: `ensureProgressHookInstalled` 없음으로 FAIL

- [ ] **Step 3: install.ts에 hook 설치/제거 함수 추가**

`apps/gateway/src/skills/install.ts` 맨 끝에 추가:

```typescript
// ─────────────────────────────────────────────────────
// Progress Hook 설치 / 제거
// ─────────────────────────────────────────────────────

const HOOK_SCRIPT_SRC = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../hooks/wp-progress.js",
);

const POST_TOOL_USE_ENTRY = {
  matcher: "Write|Edit",
  hooks: [{ type: "command", command: "node .claude/hooks/wp-progress.js" }],
};

const STOP_ENTRY = {
  hooks: [{ type: "command", command: "node .claude/hooks/wp-progress.js" }],
};

function isWpEntry(h: { hooks?: { command?: string }[] }): boolean {
  return h.hooks?.some((hh) => hh.command?.includes("wp-progress.js")) ?? false;
}

async function readSettings(settingsPath: string): Promise<Record<string, unknown>> {
  try {
    return JSON.parse(await fs.readFile(settingsPath, "utf8")) as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function writeSettings(settingsPath: string, data: Record<string, unknown>): Promise<void> {
  await fs.writeFile(settingsPath, JSON.stringify(data, null, 2), "utf8");
}

export async function ensureProgressHookInstalled(workspacePath: string): Promise<void> {
  const hooksDir    = path.join(workspacePath, ".claude", "hooks");
  const hookDst     = path.join(hooksDir, "wp-progress.js");
  const settingsPath = path.join(workspacePath, ".claude", "settings.json");

  await fs.mkdir(hooksDir, { recursive: true });
  await fs.copyFile(HOOK_SCRIPT_SRC, hookDst);
  // chmod +x 불필요 — node로 직접 실행

  const settings = await readSettings(settingsPath);
  const hooks = (settings.hooks ?? {}) as Record<string, unknown[]>;

  // PostToolUse 항목 idempotent 추가
  const postHooks = (hooks.PostToolUse ?? []) as typeof POST_TOOL_USE_ENTRY[];
  if (!postHooks.some(isWpEntry)) postHooks.push(POST_TOOL_USE_ENTRY);
  hooks.PostToolUse = postHooks;

  // Stop 항목 idempotent 추가
  const stopHooks = (hooks.Stop ?? []) as typeof STOP_ENTRY[];
  if (!stopHooks.some(isWpEntry)) stopHooks.push(STOP_ENTRY);
  hooks.Stop = stopHooks;

  settings.hooks = hooks;
  await writeSettings(settingsPath, settings);
}

export async function ensureProgressHookRemoved(workspacePath: string): Promise<void> {
  const hookDst      = path.join(workspacePath, ".claude", "hooks", "wp-progress.js");
  const settingsPath = path.join(workspacePath, ".claude", "settings.json");

  await fs.rm(hookDst, { force: true });

  let settings: Record<string, unknown>;
  try {
    settings = await readSettings(settingsPath);
  } catch {
    return;
  }

  const hooks = (settings.hooks ?? {}) as Record<string, unknown[]>;
  if (hooks.PostToolUse) {
    hooks.PostToolUse = (hooks.PostToolUse as typeof POST_TOOL_USE_ENTRY[]).filter(
      (h) => !isWpEntry(h),
    );
  }
  if (hooks.Stop) {
    hooks.Stop = (hooks.Stop as typeof STOP_ENTRY[]).filter(
      (h) => !isWpEntry(h),
    );
  }
  settings.hooks = hooks;
  await writeSettings(settingsPath, settings);
}
```

- [ ] **Step 4: 테스트 실행 → PASS 확인**

```bash
pnpm --filter @agent-desk/gateway test -- tests/progress-hook-install.test.ts --reporter=verbose 2>&1 | tail -15
```

Expected: 5개 테스트 모두 PASS

- [ ] **Step 5: sessions.ts에 env 주입 추가**

`apps/gateway/src/routes/sessions.ts`에서 `sessionRoutes` 시그니처 변경 및 env 주입:

```typescript
// opts 타입에 추가
export function sessionRoutes(opts: {
  db: DbHandle["db"];
  tmux: TmuxClient;
  cli: CliEntry[];
  gatewayUrl: string;   // 추가
  token: string;        // 추가
}): Hono {
```

`POST /` 핸들러 내 `sessionEnv` 블록 수정:

```typescript
const sessionEnv: Record<string, string> = {};
if (cliEntry.name === "claude") {
  if (ws.harnessEnabled === 1) {
    sessionEnv.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS = "1";
  }
  // work-package progress hook env
  sessionEnv.AGENT_DESK_SESSION_ID = String(inserted[0].id);
  sessionEnv.AGENT_DESK_URL        = opts.gatewayUrl;
  sessionEnv.AGENT_DESK_TOKEN      = opts.token;
}
```

> 기존 `if (cliEntry.name === "claude" && ws.harnessEnabled === 1)` 블록을 위 코드로 교체.

---

### Task 7: server.ts 통합 배선

**Files:**
- Modify: `apps/gateway/src/server.ts`
- Modify: `apps/gateway/src/routes/workspaces.ts`

- [ ] **Step 1: server.ts 업데이트**

`apps/gateway/src/server.ts`에서 import 추가:

```typescript
import { progressRoutes } from "./routes/progress";
import { progressServer } from "./ws/progress-server";
import {
  ensureProgressHookInstalled,
  ensureProgressHookRemoved,
  // ...기존 imports
} from "./skills/install";
```

`createServer` 내 `api.route("/sessions", ...)` 호출 교체:

```typescript
// 서버 바인드 후 gatewayUrl 조립 (addr 얻은 후)
const addr = server.address() as AddressInfo;
const gatewayUrl = `http://${opts.bind}:${addr.port}`;

api.route(
  "/sessions",
  sessionRoutes({
    db: opts.db.db,
    tmux,
    cli: opts.cli,
    gatewayUrl,
    token: opts.token,
  }),
);
api.route("/sessions", progressRoutes({
  db: opts.db.db,
  broadcast: progressServer.broadcastStepReady.bind(progressServer),
}));
```

> **Note:** `gatewayUrl`은 `addr` 이후에 조립하므로 `sessionRoutes`를 서버 바인드 후 등록. 현재 server.ts 구조에서 `serve()`가 완료된 뒤 `addr`를 얻으므로 route 등록을 그 뒤로 이동해야 할 수 있음. 기존 구조와 맞게 조정할 것.

`attachWsServer` 호출 바로 아래에 추가:

```typescript
progressServer.attachToHttpServer(
  server as unknown as Server,
  opts.token,
  opts.db.db,
);
```

워크스페이스 startup 스킬 설치 루프에 progress hook 추가:

```typescript
for (const ws of rows) {
  try { await ensureAllSkills({ workspacePath: ws.path }); }
  catch (err) { console.warn("[startup] skill install failed:", err); }
  try { await ensureProgressHookInstalled(ws.path); }
  catch (err) { console.warn("[startup] progress hook install failed:", err); }
  // ...harness 기존 코드
}
```

- [ ] **Step 2: workspaces.ts 업데이트 — 생성 + 삭제 시 hook 처리**

`apps/gateway/src/routes/workspaces.ts` import에 추가:

```typescript
import {
  ensureProgressHookInstalled,
  ensureProgressHookRemoved,
  // ...기존 imports
} from "../skills/install";
```

워크스페이스 생성 핸들러(`POST /`) 내 skill 설치 직후에 추가:

```typescript
try {
  await ensureProgressHookInstalled(parsed.data.path);
} catch (err) {
  console.warn("[workspaces] progress hook install on create failed:", err);
}
```

워크스페이스 삭제 핸들러(`DELETE /:id`) 내 `deletedAt` 업데이트 직전에 추가:

```typescript
try {
  await ensureProgressHookRemoved(ws.path);
} catch (err) {
  console.warn("[workspaces] progress hook remove on delete failed:", err);
}
db.update(workspaces).set({ deletedAt: now }).where(eq(workspaces.id, id)).run();
```

- [ ] **Step 3: typecheck + 전체 테스트**

```bash
cd /workspaces/owngo/agent-desk
pnpm typecheck
pnpm test 2>&1 | tail -30
```

Expected: 타입 에러 0, 기존 테스트 모두 PASS + 신규 테스트 PASS

---

## Phase 3 — Web Frontend

### Task 8: useProgressSocket custom hook

**Files:**
- Create: `apps/web/hooks/use-progress-socket.ts`
- Create: `apps/web/tests/use-progress-socket.test.ts`

- [ ] **Step 1: 테스트 작성**

`apps/web/tests/use-progress-socket.test.ts` 신규 생성:

```typescript
import { renderHook, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useProgressSocket } from "../hooks/use-progress-socket";

interface FakeWs {
  readyState: number;
  onmessage: ((e: { data: string }) => void) | null;
  onclose: (() => void) | null;
  close: () => void;
}

const fakeWsInstances: FakeWs[] = [];
const realWs = globalThis.WebSocket;

beforeEach(() => {
  fakeWsInstances.length = 0;
  class MockWebSocket implements FakeWs {
    readyState = 1;
    onmessage: ((e: { data: string }) => void) | null = null;
    onclose: (() => void) | null = null;
    close = vi.fn(() => { this.readyState = 3; });
    constructor(_url: string) { fakeWsInstances.push(this); }
    static OPEN = 1;
    static CLOSED = 3;
  }
  (globalThis as unknown as { WebSocket: typeof MockWebSocket }).WebSocket = MockWebSocket;
});

afterEach(() => {
  (globalThis as unknown as { WebSocket: typeof realWs }).WebSocket = realWs;
});

describe("useProgressSocket", () => {
  it("sessionId null이면 WS 연결 안 함", () => {
    renderHook(() => useProgressSocket({ sessionId: null, onStepReady: vi.fn() }));
    expect(fakeWsInstances).toHaveLength(0);
  });

  it("sessionId 있으면 /sessions/:id/progress WS 연결", () => {
    renderHook(() => useProgressSocket({ sessionId: 5, onStepReady: vi.fn() }));
    expect(fakeWsInstances).toHaveLength(1);
  });

  it("step_ready 메시지 수신 시 onStepReady 콜백 호출", () => {
    const onStepReady = vi.fn();
    renderHook(() => useProgressSocket({ sessionId: 5, onStepReady }));
    const ws = fakeWsInstances[0];
    act(() => {
      ws.onmessage?.({
        data: JSON.stringify({
          type: "step_ready",
          workPackageId: 10,
          stepIndex: 1,
          stepTitle: "Brainstorm",
        }),
      });
    });
    expect(onStepReady).toHaveBeenCalledWith({
      workPackageId: 10,
      stepIndex: 1,
      stepTitle: "Brainstorm",
    });
  });

  it("unmount 시 WS close 호출", () => {
    const { unmount } = renderHook(() =>
      useProgressSocket({ sessionId: 5, onStepReady: vi.fn() }),
    );
    unmount();
    expect(fakeWsInstances[0].close).toHaveBeenCalled();
  });

  it("sessionId 변경 시 이전 WS 닫고 새 WS 연결", () => {
    const { rerender } = renderHook(
      ({ id }: { id: number }) =>
        useProgressSocket({ sessionId: id, onStepReady: vi.fn() }),
      { initialProps: { id: 1 } },
    );
    rerender({ id: 2 });
    expect(fakeWsInstances).toHaveLength(2);
    expect(fakeWsInstances[0].close).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 테스트 실행 → FAIL 확인**

```bash
pnpm --filter @agent-desk/web test -- tests/use-progress-socket.test.ts --reporter=verbose 2>&1 | tail -15
```

Expected: 모듈 없음으로 FAIL

- [ ] **Step 3: useProgressSocket 구현**

`apps/web/hooks/use-progress-socket.ts` 신규 생성:

```typescript
"use client";
import { useEffect, useRef } from "react";

export interface StepReadyEvent {
  workPackageId: number;
  stepIndex: number;
  stepTitle: string;
}

export function useProgressSocket(opts: {
  sessionId: number | null;
  onStepReady: (event: StepReadyEvent) => void;
}): void {
  const onStepReadyRef = useRef(opts.onStepReady);
  onStepReadyRef.current = opts.onStepReady;

  useEffect(() => {
    if (opts.sessionId == null) return;

    // use-terminal-socket.ts 와 동일 패턴:
    // Next.js proxy는 WS upgrade 불가 → gateway(port 3334)에 직접 연결
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const token = encodeURIComponent(
      (window as unknown as { AGENT_DESK_BROWSER_TOKEN?: string })
        .AGENT_DESK_BROWSER_TOKEN ?? "",
    );
    const wsUrl = `${proto}//${window.location.hostname}:3334/sessions/${opts.sessionId}/progress?token=${token}`;
    const ws = new WebSocket(wsUrl);

    ws.onmessage = (e: MessageEvent) => {
      try {
        const msg = JSON.parse(e.data as string) as { type: string } & StepReadyEvent;
        if (msg.type === "step_ready") {
          onStepReadyRef.current({
            workPackageId: msg.workPackageId,
            stepIndex: msg.stepIndex,
            stepTitle: msg.stepTitle,
          });
        }
      } catch { /* 파싱 실패 무시 */ }
    };

    return () => {
      ws.close();
    };
  }, [opts.sessionId]);
}
```

> **Note:** `use-terminal-socket.ts`와 동일하게 gateway port 3334 직접 연결. `window.AGENT_DESK_BROWSER_TOKEN`은 기존 터미널 연결과 동일한 토큰 사용.

- [ ] **Step 4: 테스트 실행 → PASS 확인**

```bash
pnpm --filter @agent-desk/web test -- tests/use-progress-socket.test.ts --reporter=verbose 2>&1 | tail -15
```

Expected: 5개 테스트 모두 PASS

- [ ] **Step 5: WS 연결 패턴 검증**

```bash
grep -n "3334\|AGENT_DESK_BROWSER_TOKEN" apps/web/hooks/use-terminal-socket.ts
```

Expected: `port 3334` + `AGENT_DESK_BROWSER_TOKEN` 사용 확인. use-progress-socket.ts가 동일 패턴을 따름을 검증.

---

### Task 9: StepReadyOverlay 컴포넌트

**Files:**
- Create: `apps/web/components/step-ready-overlay.tsx`
- Create: `apps/web/tests/step-ready-overlay.test.tsx`

- [ ] **Step 1: 테스트 작성**

`apps/web/tests/step-ready-overlay.test.tsx` 신규 생성:

```typescript
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { StepReadyOverlay } from "../components/step-ready-overlay";

const defaultProps = {
  stepTitle: "Brainstorm",
  nextStepTitle: "Write plan",
  isLastStep: false,
  onAdvance: vi.fn(),
  onDismiss: vi.fn(),
};

describe("StepReadyOverlay", () => {
  it("현재 step 제목과 다음 step 제목을 표시", () => {
    render(<StepReadyOverlay {...defaultProps} />);
    expect(screen.getByText(/Brainstorm/)).toBeTruthy();
    expect(screen.getByText(/Write plan/)).toBeTruthy();
  });

  it("[다음 단계로] 클릭 시 onAdvance 호출", () => {
    const onAdvance = vi.fn();
    render(<StepReadyOverlay {...defaultProps} onAdvance={onAdvance} />);
    fireEvent.click(screen.getByRole("button", { name: /다음 단계/ }));
    expect(onAdvance).toHaveBeenCalledOnce();
  });

  it("[지금은 괜찮아요] 클릭 시 onDismiss 호출", () => {
    const onDismiss = vi.fn();
    render(<StepReadyOverlay {...defaultProps} onDismiss={onDismiss} />);
    fireEvent.click(screen.getByRole("button", { name: /지금은/ }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it("마지막 step이면 '완료로 처리' 버튼 표시", () => {
    render(<StepReadyOverlay {...defaultProps} isLastStep={true} />);
    expect(screen.getByRole("button", { name: /완료/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /다음 단계/ })).toBeFalsy();
  });
});
```

- [ ] **Step 2: 테스트 실행 → FAIL 확인**

```bash
pnpm --filter @agent-desk/web test -- tests/step-ready-overlay.test.tsx --reporter=verbose 2>&1 | tail -15
```

Expected: 모듈 없음으로 FAIL

- [ ] **Step 3: StepReadyOverlay 구현**

`apps/web/components/step-ready-overlay.tsx` 신규 생성:

```tsx
"use client";

interface StepReadyOverlayProps {
  stepTitle: string;
  nextStepTitle: string | null;
  isLastStep: boolean;
  onAdvance: () => void;
  onDismiss: () => void;
}

export function StepReadyOverlay({
  stepTitle,
  nextStepTitle,
  isLastStep,
  onAdvance,
  onDismiss,
}: StepReadyOverlayProps) {
  return (
    <div className="absolute bottom-4 left-4 right-4 z-10 rounded-lg border border-border bg-card p-4 shadow-lg">
      <div className="mb-3">
        <p className="text-sm font-medium text-foreground">
          📦 <span className="font-semibold">{stepTitle}</span> 완료 감지
        </p>
        {nextStepTitle && !isLastStep && (
          <p className="mt-1 text-xs text-muted-foreground">
            다음 단계: {nextStepTitle}
          </p>
        )}
      </div>
      <div className="flex gap-2">
        {isLastStep ? (
          <button
            onClick={onAdvance}
            className="flex-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
          >
            완료로 처리
          </button>
        ) : (
          <button
            onClick={onAdvance}
            className="flex-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
          >
            다음 단계로
          </button>
        )}
        <button
          onClick={onDismiss}
          className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted"
        >
          지금은 괜찮아요
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: 테스트 실행 → PASS 확인**

```bash
pnpm --filter @agent-desk/web test -- tests/step-ready-overlay.test.tsx --reporter=verbose 2>&1 | tail -15
```

Expected: 4개 테스트 모두 PASS

---

### Task 10: terminal-tab 연결

**Files:**
- Modify: `apps/web/components/tabs/terminal-tab.tsx`

- [ ] **Step 1: terminal-tab.tsx 상단에 import 추가**

```typescript
import { useProgressSocket, type StepReadyEvent } from "@/hooks/use-progress-socket";
import { StepReadyOverlay } from "../step-ready-overlay";
```

- [ ] **Step 2: state 추가**

기존 state 선언 블록에 추가:

```typescript
const [stepReadyEvent, setStepReadyEvent] = useState<StepReadyEvent | null>(null);
/** 이미 dismiss한 stepIndex — 같은 step 재표시 방지 */
const dismissedStepRef = useRef<number | null>(null);
```

- [ ] **Step 3: useProgressSocket 마운트**

기존 `useEffect` / `useCallback` 블록 아래에 추가:

```typescript
useProgressSocket({
  sessionId: selectedSessionId,
  onStepReady: (event) => {
    // 이미 dismiss한 step이면 무시
    if (dismissedStepRef.current === event.stepIndex) return;
    setStepReadyEvent(event);
  },
});
```

- [ ] **Step 4: 오버레이 렌더링 추가**

`terminal-tab.tsx` return 문 내 `<TerminalPanel>` 컴포넌트 감싸는 div에 추가:

```tsx
{/* TerminalPanel 감싸는 relative 컨테이너 */}
<div className="relative flex-1 overflow-hidden">
  <TerminalPanel
    session={selectedSession}
    /* ...기존 props */
  />
  {stepReadyEvent && activeWp && (
    <StepReadyOverlay
      stepTitle={stepReadyEvent.stepTitle}
      nextStepTitle={
        /* 현재 step 다음 step title 계산 */
        packages
          .find((p) => p.id === activeWp.packageId)
          ?.stepTitles[stepReadyEvent.stepIndex] ?? null
      }
      isLastStep={
        stepReadyEvent.stepIndex >=
        (packages.find((p) => p.id === activeWp.packageId)?.stepTitles.length ?? 1)
      }
      onAdvance={async () => {
        setStepReadyEvent(null);
        await handleAdvance(); // 기존 advance 핸들러 재사용
      }}
      onDismiss={() => {
        dismissedStepRef.current = stepReadyEvent.stepIndex;
        setStepReadyEvent(null);
      }}
    />
  )}
</div>
```

> **Note:** 기존 `handleAdvance` 함수가 `terminal-tab.tsx`에 있으면 재사용. 없으면 `gateway.workPackages.advance` 직접 호출.

- [ ] **Step 5: typecheck + 전체 테스트**

```bash
cd /workspaces/owngo/agent-desk
pnpm typecheck
pnpm test 2>&1 | tail -30
```

Expected: 타입 에러 0, 신규 포함 모든 테스트 PASS

---

## 최종 검증 + 커밋

- [ ] **Step 1: 전체 테스트 실행**

```bash
cd /workspaces/owngo/agent-desk
pnpm test 2>&1 | grep -E "Tests|PASS|FAIL|Error" | tail -20
```

Expected: 실패 0

- [ ] **Step 2: typecheck 전체**

```bash
pnpm typecheck
```

Expected: 에러 0

- [ ] **Step 3: shared+gateway 커밋**

```bash
git add \
  packages/shared/src/packages/types.ts \
  packages/shared/src/packages/definitions/planning.ts \
  packages/shared/src/db/schema.ts \
  packages/shared/src/api/work-package.ts \
  packages/shared/src/index.ts \
  packages/shared/tests/packages.test.ts \
  apps/gateway/src/hooks/wp-progress.js \
  apps/gateway/src/routes/progress.ts \
  apps/gateway/src/ws/progress-server.ts \
  apps/gateway/src/ws/attach-server.ts \
  apps/gateway/src/skills/install.ts \
  apps/gateway/src/routes/sessions.ts \
  apps/gateway/src/routes/workspaces.ts \
  apps/gateway/src/server.ts \
  apps/gateway/drizzle/ \
  apps/gateway/tests/progress.test.ts \
  apps/gateway/tests/progress-hook-install.test.ts \
  apps/gateway/tests/progress-server.test.ts

git commit -m "feat(shared,gateway): work-package progress hooks — PostToolUse 기반 step 완료 감지 + WS push

- StepDefinition.completionArtifactDir 추가 (planning: specs/→plans/)
- work_package_events kind에 hook-file/hook-turn 통합
- wp-progress.js (Node.js CJS, Windows/Mac/Linux 공통)
- POST /sessions/:id/progress 라우트
- WS /sessions/:id/progress 전용 채널
- ensureProgressHookInstalled/Removed (워크스페이스 생성/삭제 연동)
- 세션 시작 시 AGENT_DESK_SESSION_ID/URL/TOKEN env 주입

Co-Authored-By: Claude <noreply@anthropic.com>"
```

- [ ] **Step 4: web 커밋**

```bash
git add \
  apps/web/hooks/use-progress-socket.ts \
  apps/web/components/step-ready-overlay.tsx \
  apps/web/components/tabs/terminal-tab.tsx \
  apps/web/tests/use-progress-socket.test.ts \
  apps/web/tests/step-ready-overlay.test.tsx

git commit -m "feat(web): work-package step_ready 오버레이 + useProgressSocket

- useProgressSocket: WS /sessions/:id/progress 구독
- StepReadyOverlay: step 완료 감지 오버레이 (다음 단계로 / 지금은 괜찮아요)
- terminal-tab: WS 구독 + 오버레이 렌더링 연결

Co-Authored-By: Claude <noreply@anthropic.com>"
```

- [ ] **Step 5: owngo submodule pointer bump**

```bash
git -C /workspaces/owngo add agent-desk
git -C /workspaces/owngo commit -m "chore: agent-desk 서브모듈 갱신 — work-package progress hooks

Co-Authored-By: Claude <noreply@anthropic.com>"
```
