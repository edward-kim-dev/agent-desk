# Work Packages V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** agent-desk 에 "planning" work package 1 개를 도입한다 — picker 에서 명시 선택 → 시작 폼 → `/brainstorming` → `/writing-plans` 의 2-step 흐름을 DB 인스턴스로 추적. 게이트웨이가 step 전이 시점마다 `<ws>/docs/superpowers/{specs,plans}/` 를 스캔해 산출물 .md 의 sha256/size 인덱스를 보유한다. briefing-form-modal 및 brief endpoint 는 완전 삭제.

**Architecture:** 정의(코드) + 인스턴스(DB) 분리. 정의는 `@agent-desk/shared/packages` 에서 web/gateway 양쪽이 import. 게이트웨이가 step 전환 시점의 hard transition (DB 전이 + tmux 주입 + artifact discovery) 을 단일 트랜잭션으로 묶고, V1 은 메타-스킬 SKILL.md / hook / AGENTS.md 자동 주입을 도입하지 않는다.

**Tech Stack:** TypeScript, Hono, drizzle-orm + better-sqlite3, Zod, Next.js 16 (React), vitest, tmux send-keys, Node 22 `node:crypto` (sha256), `node:fs/promises` (디렉토리 스캔).

**Spec:** [specs/2026-05-27-work-packages-design.md](../specs/2026-05-27-work-packages-design.md)

**Commit policy:** Phase 끝에 한 번씩 (memory: "agent-desk 커밋은 모듈 단위 큼직하게"). TDD red→green 단계마다는 commit 금지.

---

## File Structure

**New (`packages/shared`):**
- `packages/shared/src/packages/types.ts` — `PackageDefinition`, `StepDefinition`, `FieldSpec`, `StepContext`
- `packages/shared/src/packages/format-prompt.ts` — `formatBrainstormingPrompt` (게이트웨이 사본을 shared 로 이전)
- `packages/shared/src/packages/definitions/planning.ts` — planning 정의
- `packages/shared/src/packages/index.ts` — `PACKAGES` 레지스트리 + `toCatalogEntry`
- `packages/shared/src/api/work-package.ts` — DTO/요청 Zod 스키마 (artifact DTO 포함)
- `packages/shared/tests/packages.test.ts` — 정의·스키마 단위 테스트

**New (`apps/gateway`):**
- `apps/gateway/src/routes/work-packages.ts` — 5 endpoint (catalog/start/advance/complete/list-session/list-artifacts)
- `apps/gateway/src/work-packages/artifacts.ts` — `scanArtifactDirs`, `reconcileArtifacts` 헬퍼
- `apps/gateway/drizzle/0004_work_packages.sql` — 마이그레이션 (3 신규 테이블 + briefedAt DROP + enum cleanup)
- `apps/gateway/tests/work-packages.test.ts` — endpoint 통합
- `apps/gateway/tests/artifacts.test.ts` — scan/reconcile 단위

**Modified (`packages/shared`):**
- `packages/shared/src/db/schema.ts` — `workPackages` (with `baselineJson`), `workPackageEvents`, `workPackageArtifacts` 추가. `sessions.briefedAt` 컬럼 제거. `sessionEvents.kind` enum 에서 `briefed`/`brief-failed` 제거. `sessionDto` 에서 `briefedAt` 필드 제거.
- `packages/shared/src/index.ts` — packages/index, api/work-package 재export
- `packages/shared/src/api/session.ts` — `brainstormingBriefRequest`/`BrainstormingBriefRequest` 제거. `sessionDto.briefedAt` 제거. `sessionEventKind` enum 에서 `briefed`/`brief-failed` 제거.

**Modified (`apps/gateway`):**
- `apps/gateway/src/server.ts` — `workPackageRoutes` 마운트
- `apps/gateway/src/routes/sessions.ts` — `formatBrainstormingPrompt` 로컬 함수 제거, `/brief` 핸들러 + import 제거, `briefedAt` toDto 매핑 제거
- `apps/gateway/tests/sessions.test.ts` — `/brief` describe 블록 (192-275) 제거

**New (`apps/web`):**
- `apps/web/components/package-start-form.tsx` — `FieldSpec[]` 렌더링 + Back 버튼
- `apps/web/components/package-picker.tsx` — 카드 그리드, cli mismatch disabled
- `apps/web/components/work-package-modal.tsx` — picker → form 2-step 컨테이너
- `apps/web/components/active-package-card.tsx` — 진행도 + Next/Complete + Artifact 슬롯
- `apps/web/components/artifact-list.tsx` — 링크 리스트 + drift 배지
- `apps/web/tests/package-start-form.test.tsx`
- `apps/web/tests/package-picker.test.tsx`
- `apps/web/tests/work-package-modal.test.tsx`
- `apps/web/tests/active-package-card.test.tsx`
- `apps/web/tests/artifact-list.test.tsx`

**Modified (`apps/web`):**
- `apps/web/lib/gateway-client.ts` — `packages.list`, `workPackages.{start,advance,complete,listForSession,listArtifacts}`. 기존 `sessions.brief` 메서드 제거.
- `apps/web/components/tabs/terminal-tab.tsx` — modal trigger 룰 갱신 (`briefedAt` 의존 제거, active 인스턴스 fetch), `BriefingFormModal` import → `WorkPackageModal`
- `apps/web/components/session-list.tsx` — `briefedAt` 표시·trigger 의존 부분 제거
- `apps/web/tests/session-list.test.tsx` — fixture 의 `briefedAt` 필드 제거

**Deleted:**
- `apps/web/components/briefing-form-modal.tsx`
- 관련 테스트 (있다면)

**Modified (root):**
- `README.md` — features 섹션에 work packages 한 줄 추가

---

## Phase 1 — Shared 패키지 + DB + briefing 흔적 제거 + drizzle 마이그레이션

이 phase 의 변경은 서로 강하게 결합 (shared 타입 변경 → gateway 임포트 깨짐). 한 phase 안에서 끝까지 가서 컴파일 + 기존 테스트 그린 후 commit.

### Task 1.1: PackageDefinition 타입

**Files:**
- Create: `packages/shared/src/packages/types.ts`

- [ ] **Step 1: Write `types.ts`**

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

### Task 1.2: `formatBrainstormingPrompt` shared 로 이전

**Files:**
- Create: `packages/shared/src/packages/format-prompt.ts`

- [ ] **Step 1: 본문 작성**

```typescript
export function formatBrainstormingPrompt(payload: {
  topic: string;
  context?: string;
  constraints?: string;
  goals?: string;
}): string {
  const parts: string[] = [];
  parts.push(`Topic: ${payload.topic}`);
  if (payload.context?.trim()) parts.push(`Context: ${payload.context.trim()}`);
  if (payload.constraints?.trim()) parts.push(`Constraints: ${payload.constraints.trim()}`);
  if (payload.goals?.trim()) parts.push(`Goals: ${payload.goals.trim()}`);
  const sanitized = parts.map((p) => p.replace(/\r?\n/g, " · ")).join(" · ");
  return `/brainstorming ${sanitized}`;
}
```

### Task 1.3: planning 정의

**Files:**
- Create: `packages/shared/src/packages/definitions/planning.ts`

- [ ] **Step 1: 작성**

```typescript
import { z } from "zod";
import type { PackageDefinition } from "../types";
import { formatBrainstormingPrompt } from "../format-prompt";

export const planningInputs = z.object({
  topic: z.string().min(1).max(500),
  context: z.string().max(2000).optional(),
  constraints: z.string().max(2000).optional(),
  goals: z.string().max(2000).optional(),
});
export type PlanningInputs = z.infer<typeof planningInputs>;

export const planning: PackageDefinition<PlanningInputs> = {
  id: "planning",
  title: "기획",
  description: "아이디어를 brainstorming → spec → plan 으로 정리합니다.",
  cliRequirement: "claude",
  startForm: {
    schema: planningInputs,
    fields: [
      { name: "topic", label: "What are we planning?", kind: "text", required: true, maxLength: 500, placeholder: "Add a notifications system to agent-desk" },
      { name: "context", label: "Context", hint: "배경, 이전 결정, 사용자가 미리 알리고 싶은 것", kind: "textarea", maxLength: 2000, rows: 3 },
      { name: "constraints", label: "Constraints", hint: "기술 스택, 시간 예산, 범위에서 빠지는 것", kind: "textarea", maxLength: 2000, rows: 2 },
      { name: "goals", label: "Success criteria", hint: "끝났을 때 어떤 산출물·결정이 있어야 하는지", kind: "textarea", maxLength: 2000, rows: 2 },
    ],
  },
  steps: [
    {
      index: 1,
      title: "Brainstorm",
      skillName: "brainstorming",
      promptTemplate: (inputs) => formatBrainstormingPrompt(inputs),
    },
    {
      index: 2,
      title: "Write plan",
      skillName: "writing-plans",
      promptTemplate: () => "/writing-plans",
    },
  ],
};
```

### Task 1.4: PACKAGES 레지스트리

**Files:**
- Create: `packages/shared/src/packages/index.ts`

- [ ] **Step 1: 작성**

```typescript
import type { PackageDefinition } from "./types";
import { planning } from "./definitions/planning";

export * from "./types";
export * from "./format-prompt";
export { planning };

export const PACKAGES: Record<string, PackageDefinition> = {
  [planning.id]: planning,
};

export function getPackage(id: string): PackageDefinition | undefined {
  return PACKAGES[id];
}

export interface PackageCatalogEntry {
  id: string;
  title: string;
  description: string;
  cliRequirement: "claude" | "any";
  fields: PackageDefinition["startForm"]["fields"];
  stepTitles: string[];
}

export function toCatalogEntry(def: PackageDefinition): PackageCatalogEntry {
  return {
    id: def.id,
    title: def.title,
    description: def.description,
    cliRequirement: def.cliRequirement,
    fields: def.startForm.fields,
    stepTitles: def.steps.map((s) => s.title),
  };
}
```

### Task 1.5: API DTO

**Files:**
- Create: `packages/shared/src/api/work-package.ts`

- [ ] **Step 1: 작성**

```typescript
import { z } from "zod";

export const workPackageStatus = z.enum(["active", "completed", "abandoned"]);
export type WorkPackageStatus = z.infer<typeof workPackageStatus>;

export const workPackageDto = z.object({
  id: z.number().int(),
  sessionId: z.number().int(),
  packageId: z.string(),
  currentStep: z.number().int().nonnegative(),
  status: workPackageStatus,
  inputs: z.record(z.string(), z.unknown()),
  createdAt: z.number().int(),
  advancedAt: z.number().int(),
  completedAt: z.number().int().nullable(),
});
export type WorkPackageDto = z.infer<typeof workPackageDto>;

export const workPackageArtifactDto = z.object({
  id: z.number().int(),
  stepIndex: z.number().int(),
  filePath: z.string(),
  sha256: z.string(),
  size: z.number().int().nonnegative(),
  recordedAt: z.number().int(),
  lastSeenSha256: z.string(),
  lastSeenAt: z.number().int(),
  driftDetected: z.boolean(),
});
export type WorkPackageArtifactDto = z.infer<typeof workPackageArtifactDto>;

export const startWorkPackageRequest = z.object({
  packageId: z.string().min(1),
  inputs: z.record(z.string(), z.unknown()),
});
export type StartWorkPackageRequest = z.infer<typeof startWorkPackageRequest>;

export const advanceWorkPackageRequest = z.object({
  expectedCurrentStep: z.number().int().positive(),
});
export type AdvanceWorkPackageRequest = z.infer<typeof advanceWorkPackageRequest>;

export const completeWorkPackageRequest = z.object({
  outcome: z.enum(["success", "abandoned"]).default("success"),
});
export type CompleteWorkPackageRequest = z.infer<typeof completeWorkPackageRequest>;
```

### Task 1.6: DB schema 갱신 + briefing 흔적 제거

**Files:**
- Modify: `packages/shared/src/db/schema.ts`
- Modify: `packages/shared/src/api/session.ts`

- [ ] **Step 1: `db/schema.ts` 정정**

`sessions` 테이블에서 `briefedAt: integer("briefed_at"),` 라인 삭제.

`sessionEvents.kind` enum 에서 `"briefed"`, `"brief-failed"` 두 항목 삭제 (배열에 남는 항목: `"created","attached","detached","killed","adopted"`).

파일 끝에 새 테이블 정의 추가:

```typescript
export const workPackages = sqliteTable("work_packages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  sessionId: integer("session_id").notNull().references(() => sessions.id),
  packageId: text("package_id").notNull(),
  currentStep: integer("current_step").notNull().default(0),
  status: text("status", { enum: ["active", "completed", "abandoned"] }).notNull(),
  inputsJson: text("inputs_json").notNull(),
  baselineJson: text("baseline_json").notNull(),
  createdAt: integer("created_at").notNull(),
  advancedAt: integer("advanced_at").notNull(),
  completedAt: integer("completed_at"),
});

export const workPackageEvents = sqliteTable("work_package_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  workPackageId: integer("work_package_id").notNull().references(() => workPackages.id),
  kind: text("kind", {
    enum: ["started", "step-injected", "step-inject-failed", "advanced", "completed", "abandoned"],
  }).notNull(),
  payloadJson: text("payload_json"),
  at: integer("at").notNull(),
});

export const workPackageArtifacts = sqliteTable("work_package_artifacts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  workPackageId: integer("work_package_id").notNull().references(() => workPackages.id),
  stepIndex: integer("step_index").notNull(),
  filePath: text("file_path").notNull(),
  sha256: text("sha256").notNull(),
  size: integer("size").notNull(),
  recordedAt: integer("recorded_at").notNull(),
  lastSeenSha256: text("last_seen_sha256").notNull(),
  lastSeenAt: integer("last_seen_at").notNull(),
  driftDetected: integer("drift_detected").notNull().default(0),
});
```

- [ ] **Step 2: `api/session.ts` 정정**

다음 항목들 삭제:
- `brainstormingBriefRequest` Zod 스키마 정의
- `BrainstormingBriefRequest` 타입 export
- `sessionEventKind` enum 의 `"briefed"`, `"brief-failed"` 항목
- `sessionDto` 의 `briefedAt: z.number().int().nullable(),` 라인

### Task 1.7: shared root re-export

**Files:**
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: 두 export 추가**

```typescript
export * from "./packages";
export * from "./api/work-package";
```

### Task 1.8: shared 단위 테스트

**Files:**
- Create: `packages/shared/tests/packages.test.ts`

- [ ] **Step 1: 테스트 본문**

```typescript
import { describe, expect, it } from "vitest";
import {
  PACKAGES,
  formatBrainstormingPrompt,
  getPackage,
  planning,
  startWorkPackageRequest,
  toCatalogEntry,
} from "../src";

describe("packages registry", () => {
  it("planning 패키지가 PACKAGES 에 등록되어 있다", () => {
    expect(PACKAGES.planning).toBe(planning);
    expect(getPackage("planning")).toBe(planning);
    expect(getPackage("nope")).toBeUndefined();
  });

  it("planning 정의가 cli=claude, 2-step 구조이다", () => {
    expect(planning.cliRequirement).toBe("claude");
    expect(planning.steps.map((s) => s.index)).toEqual([1, 2]);
    expect(planning.steps.map((s) => s.skillName)).toEqual(["brainstorming", "writing-plans"]);
  });

  it("startForm.schema 가 topic 누락을 거부한다", () => {
    const r = planning.startForm.schema.safeParse({ context: "x" });
    expect(r.success).toBe(false);
  });

  it("Step 1 promptTemplate 가 /brainstorming 프롬프트를 만든다", () => {
    const out = planning.steps[0].promptTemplate(
      { topic: "X", context: "Y" },
      { workspacePath: "/tmp", packageInstanceId: -1 },
    );
    expect(out).toBe("/brainstorming Topic: X · Context: Y");
  });

  it("Step 2 promptTemplate 가 /writing-plans 만 반환한다", () => {
    const out = planning.steps[1].promptTemplate(
      { topic: "X" },
      { workspacePath: "/tmp", packageInstanceId: 7 },
    );
    expect(out).toBe("/writing-plans");
  });

  it("formatBrainstormingPrompt 가 줄바꿈을 · 로 치환한다", () => {
    const out = formatBrainstormingPrompt({ topic: "T", context: "line1\nline2" });
    expect(out).toContain("line1 · line2");
  });

  it("toCatalogEntry 가 schema 를 제거하고 stepTitles 를 펼친다", () => {
    const entry = toCatalogEntry(planning);
    expect(entry.id).toBe("planning");
    expect(entry.stepTitles).toEqual(["Brainstorm", "Write plan"]);
    expect("schema" in (entry as Record<string, unknown>)).toBe(false);
  });

  it("startWorkPackageRequest 가 packageId 누락을 거부한다", () => {
    expect(startWorkPackageRequest.safeParse({ inputs: {} }).success).toBe(false);
  });
});
```

- [ ] **Step 2: 실행**

```bash
pnpm -F @agent-desk/shared test
```

Expected: 신규 테스트 PASS, 기존 schema/api/sanity 테스트도 그대로 PASS.

이 시점에 `apps/web/tests/session-list.test.tsx` 의 fixture 와 `apps/gateway/src/routes/sessions.ts` 의 `briefedAt` 매핑이 컴파일을 깬다 — 다음 task 들에서 즉시 정리.

### Task 1.9: gateway 의 briefing 코드 제거

**Files:**
- Modify: `apps/gateway/src/routes/sessions.ts`
- Modify: `apps/gateway/tests/sessions.test.ts`

- [ ] **Step 1: `routes/sessions.ts` 정정**

다음 항목들 삭제:
- import 의 `brainstormingBriefRequest`
- import 의 `ensureSkillInstalled`, `EnsureSkillResult` (brief 만 사용했음)
- import 의 `injectPrompt`, `InjectResult` (brief 만 사용했음 — start session 도 inject 안 함)
- 로컬 `formatBrainstormingPrompt` 함수 (41-59)
- `sessionRoutes` 의 `injectFn`, `ensureSkillFn` 옵션
- `toDto` 의 `briefedAt: s.briefedAt,` 라인
- `r.post("/:id/brief", ...)` 핸들러 전체 (163-251)

남은 핸들러: `GET /`, `POST /`, `DELETE /:id`.

- [ ] **Step 2: `tests/sessions.test.ts` 정정**

`describe("sessions /brief 라우트", ...)` 블록 (대략 192-275) 전체 삭제.
beforeAll 의 `injectFn`, `ensureSkillFn` vi.fn 정의는 그대로 두되 `createServer` 호출에서 옵션 키 제거 (sessionRoutes 가 더 이상 받지 않음).
정확한 형태: 위 시그니처가 빠졌으므로 server.test 의 `injectFn`/`ensureSkillFn` 전달도 일관되게 정리. 빌드 깨지면 그 곳까지 정리.

- [ ] **Step 3: 게이트웨이 typecheck**

```bash
pnpm -F @agent-desk/gateway typecheck
```

Expected: PASS. brief 관련 임포트 흔적이 모두 사라진 상태.

### Task 1.10: web 의 briefing 코드 제거

**Files:**
- Delete: `apps/web/components/briefing-form-modal.tsx`
- Modify: `apps/web/components/tabs/terminal-tab.tsx`
- Modify: `apps/web/components/session-list.tsx`
- Modify: `apps/web/lib/gateway-client.ts`
- Modify: `apps/web/tests/session-list.test.tsx`

- [ ] **Step 1: 파일 삭제**

```bash
rm /workspaces/owngo/agent-desk/apps/web/components/briefing-form-modal.tsx
```

briefing-form-modal 관련 별도 테스트 파일은 없음 (확인 후 있으면 삭제).

- [ ] **Step 2: `terminal-tab.tsx` 정정**

- import `BriefingFormModal` 라인 삭제
- 컴포넌트 사용처 (대략 193 라인) 삭제 — Phase 3 에서 `WorkPackageModal` 로 교체될 때까지 자리만 빔
- `briefedAt` 의존 조건 (대략 101 라인 `target.briefedAt == null`) 삭제 — Phase 3 에서 `active work-package == null` 조건으로 교체

이 task 의 목적은 깨진 빌드만 일단 회복. Phase 3 에서 진짜 modal 와이어.

- [ ] **Step 3: `session-list.tsx` 정정**

`briefedAt` 표시·표시 분기를 제거 (Search: `briefedAt`).

- [ ] **Step 4: `gateway-client.ts` 정정**

기존 `sessions.brief` 메서드와 `BriefResponse` 타입 제거 (대략 64 라인). 다른 메서드는 유지.

- [ ] **Step 5: `tests/session-list.test.tsx` fixture 정정**

`briefedAt: null,` 라인 (대략 21, 34) 삭제.

- [ ] **Step 6: web typecheck + test**

```bash
pnpm -F @agent-desk/web typecheck
pnpm -F @agent-desk/web test
```

Expected: PASS. (Phase 3 에서 추가될 컴포넌트 테스트는 아직 없음 — 그건 Phase 3 에서.)

### Task 1.11: drizzle 마이그레이션 생성

**Files:**
- Create: `apps/gateway/drizzle/0004_work_packages.sql`

- [ ] **Step 1: drizzle-kit 자동 생성**

```bash
cd /workspaces/owngo/agent-desk/apps/gateway && pnpm exec drizzle-kit generate
```

- [ ] **Step 2: 생성된 SQL 검토**

새 `0004_*.sql` 파일이 포함해야 할 statement:

- `CREATE TABLE work_packages` (id, session_id FK, package_id, current_step, status, inputs_json, baseline_json, created_at, advanced_at, completed_at)
- `CREATE TABLE work_package_events` (id, work_package_id FK, kind CHECK, payload_json, at)
- `CREATE TABLE work_package_artifacts` (id, work_package_id FK, step_index, file_path, sha256, size, recorded_at, last_seen_sha256, last_seen_at, drift_detected, UNIQUE(work_package_id, file_path))
- `ALTER TABLE sessions DROP COLUMN briefed_at`
- `session_events` CHECK 재생성 (drizzle 가 자동) — `briefed`, `brief-failed` enum 에서 빠짐. SQLite 의 drop-recreate-rename 패턴이 생성될 수 있음.

drizzle 가 다른 형태로 만들었거나 누락이 있으면 수동으로 SQL 정리 + `meta/_journal.json` 도 갱신. UNIQUE index 가 직접 SQL 로 누락되면 `CREATE UNIQUE INDEX work_package_artifacts_unique ON work_package_artifacts(work_package_id, file_path);` 추가.

- [ ] **Step 3: db migration 적용 테스트**

```bash
pnpm -F @agent-desk/gateway test -- tests/db.test.ts
```

Expected: 마이그레이션 적용 성공, 기존 테이블 + 신규 테이블 모두 존재. SQL 형식 문제면 위 단계로 돌아가 정정.

### Task 1.12: Phase 1 회귀 + commit

- [ ] **Step 1: 전체 테스트**

```bash
cd /workspaces/owngo/agent-desk && pnpm typecheck && pnpm test
```

Expected: PASS. brief 관련 테스트가 사라졌고 새 packages 테스트는 그린.

- [ ] **Step 2: 커밋**

```bash
git -C /workspaces/owngo/agent-desk add packages/shared apps/gateway/src/routes/sessions.ts apps/gateway/tests/sessions.test.ts apps/gateway/drizzle apps/web/components/briefing-form-modal.tsx apps/web/components/tabs/terminal-tab.tsx apps/web/components/session-list.tsx apps/web/lib/gateway-client.ts apps/web/tests/session-list.test.tsx

git -C /workspaces/owngo/agent-desk commit -m "$(cat <<'EOF'
feat(shared): work package 정의·DB schema, briefing 흔적 제거

- packages/shared/src/packages/* : PackageDefinition 타입, planning 정의, PACKAGES 레지스트리, formatBrainstormingPrompt 공통화
- packages/shared/src/api/work-package.ts : DTO/요청 스키마 (artifact 포함)
- packages/shared/src/db/schema.ts : work_packages(+ baseline_json), work_package_events, work_package_artifacts 추가; sessions.briefedAt 제거; sessionEvents enum cleanup
- apps/gateway/drizzle/0004_work_packages.sql : 마이그레이션 (테이블 3 + DROP COLUMN + CHECK 갱신)
- apps/gateway/src/routes/sessions.ts : formatBrainstormingPrompt + /brief 핸들러 제거, toDto 의 briefedAt 매핑 제거
- apps/gateway/tests/sessions.test.ts : /brief describe 블록 삭제
- apps/web : briefing-form-modal 파일·import·sessions.brief client·briefedAt trigger·fixture 정리

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 2 — Gateway: artifact discovery 헬퍼 + work-packages 라우트

### Task 2.1: `scanArtifactDirs` 헬퍼

**Files:**
- Create: `apps/gateway/src/work-packages/artifacts.ts`
- Create: `apps/gateway/tests/artifacts.test.ts`

- [ ] **Step 1: 테스트 작성 — fs 임시 디렉토리 기반**

```typescript
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { scanArtifactDirs } from "../src/work-packages/artifacts";

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "ad-art-")); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

describe("scanArtifactDirs", () => {
  it("docs/superpowers/{specs,plans} 의 .md 파일을 sha256 과 함께 반환", async () => {
    mkdirSync(join(dir, "docs/superpowers/specs"), { recursive: true });
    mkdirSync(join(dir, "docs/superpowers/plans"), { recursive: true });
    writeFileSync(join(dir, "docs/superpowers/specs/a.md"), "hello");
    writeFileSync(join(dir, "docs/superpowers/plans/b.md"), "world");
    const out = await scanArtifactDirs(dir);
    const byPath = Object.fromEntries(out.map((e) => [e.relPath, e]));
    expect(byPath["docs/superpowers/specs/a.md"].sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(byPath["docs/superpowers/specs/a.md"].size).toBe(5);
    expect(byPath["docs/superpowers/plans/b.md"]).toBeTruthy();
  });

  it("non-.md 파일은 무시", async () => {
    mkdirSync(join(dir, "docs/superpowers/specs"), { recursive: true });
    writeFileSync(join(dir, "docs/superpowers/specs/note.txt"), "x");
    writeFileSync(join(dir, "docs/superpowers/specs/c.md"), "y");
    const out = await scanArtifactDirs(dir);
    expect(out.map((e) => e.relPath)).toEqual(["docs/superpowers/specs/c.md"]);
  });

  it("디렉토리가 없으면 빈 배열", async () => {
    const out = await scanArtifactDirs(dir);
    expect(out).toEqual([]);
  });

  it("symlink 는 따라가지 않음", async () => {
    const target = mkdtempSync(join(tmpdir(), "ad-art-tgt-"));
    writeFileSync(join(target, "evil.md"), "x");
    mkdirSync(join(dir, "docs/superpowers/specs"), { recursive: true });
    const { symlinkSync } = await import("node:fs");
    symlinkSync(join(target, "evil.md"), join(dir, "docs/superpowers/specs/link.md"));
    const out = await scanArtifactDirs(dir);
    expect(out.map((e) => e.relPath)).not.toContain("docs/superpowers/specs/link.md");
    rmSync(target, { recursive: true, force: true });
  });
});
```

- [ ] **Step 2: 실행 → FAIL (모듈 없음)**

- [ ] **Step 3: 구현**

```typescript
// apps/gateway/src/work-packages/artifacts.ts
import { createHash } from "node:crypto";
import { readFile, readdir, lstat } from "node:fs/promises";
import { join, relative } from "node:path";

export interface ArtifactSnapshot {
  relPath: string;
  sha256: string;
  size: number;
}

const ART_DIRS = [
  ["docs", "superpowers", "specs"],
  ["docs", "superpowers", "plans"],
] as const;

export async function scanArtifactDirs(workspacePath: string): Promise<ArtifactSnapshot[]> {
  const out: ArtifactSnapshot[] = [];
  for (const segs of ART_DIRS) {
    const abs = join(workspacePath, ...segs);
    let entries: string[];
    try {
      entries = await readdir(abs);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw err;
    }
    for (const name of entries) {
      if (!name.endsWith(".md") || name.startsWith(".")) continue;
      const full = join(abs, name);
      let stat;
      try {
        stat = await lstat(full);
      } catch {
        continue;
      }
      if (!stat.isFile()) continue;  // symlink·dir skip
      const buf = await readFile(full);
      const sha = createHash("sha256").update(buf).digest("hex");
      out.push({
        relPath: relative(workspacePath, full).replace(/\\/g, "/"),
        sha256: sha,
        size: stat.size,
      });
    }
  }
  return out;
}
```

- [ ] **Step 4: 실행 → PASS**

```bash
pnpm -F @agent-desk/gateway test -- tests/artifacts.test.ts
```

### Task 2.2: `reconcileArtifacts` 헬퍼

**Files:**
- Modify: `apps/gateway/src/work-packages/artifacts.ts`
- Modify: `apps/gateway/tests/artifacts.test.ts`

- [ ] **Step 1: 테스트 추가**

```typescript
import { workPackages, workPackageArtifacts } from "@agent-desk/shared";
import { openDatabase } from "../src/db";
import { reconcileArtifacts } from "../src/work-packages/artifacts";
import { eq } from "drizzle-orm";

describe("reconcileArtifacts", () => {
  it("baseline 에 없던 신규 파일을 INSERT, 변한 파일을 drift=1 로 UPDATE", async () => {
    // setup: workspaces, work_packages row 하나 만들고 baseline 빈 map 으로
    const dbDir = mkdtempSync(join(tmpdir(), "ad-rec-"));
    const handle = openDatabase({ filePath: join(dbDir, "db.sqlite") });
    // workspaces 행 + sessions 행 + work_packages 행 3 단계 (FK)
    // ... (생략 — sessions.test 의 setup 참조)
    // …
    const fsRoot = mkdtempSync(join(tmpdir(), "ad-rec-fs-"));
    mkdirSync(join(fsRoot, "docs/superpowers/specs"), { recursive: true });
    writeFileSync(join(fsRoot, "docs/superpowers/specs/foo.md"), "v1");
    const result = await reconcileArtifacts({
      db: handle.db,
      workPackageId: /* wp.id */,
      stepIndex: 1,
      workspacePath: fsRoot,
      previousBaseline: {},
      now: 100,
    });
    expect(result.newBaseline["docs/superpowers/specs/foo.md"]).toMatch(/^[a-f0-9]{64}$/);
    const rows = handle.db.select().from(workPackageArtifacts).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].driftDetected).toBe(0);

    // 두번째 호출: 같은 파일 내용 변경 → drift
    writeFileSync(join(fsRoot, "docs/superpowers/specs/foo.md"), "v2 longer");
    const r2 = await reconcileArtifacts({
      db: handle.db, workPackageId: /* wp.id */, stepIndex: 2, workspacePath: fsRoot,
      previousBaseline: result.newBaseline, now: 200,
    });
    const rows2 = handle.db.select().from(workPackageArtifacts).all();
    expect(rows2).toHaveLength(1);
    expect(rows2[0].driftDetected).toBe(1);
    expect(rows2[0].lastSeenAt).toBe(200);

    rmSync(dbDir, { recursive: true, force: true });
    rmSync(fsRoot, { recursive: true, force: true });
  });
});
```

(setup boilerplate 는 sessions.test.ts 를 참조해 정확한 FK 삽입 순서로 채움.)

- [ ] **Step 2: 실행 → FAIL**

- [ ] **Step 3: 구현 추가 (`artifacts.ts` 에 append)**

```typescript
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { workPackageArtifacts } from "@agent-desk/shared/db/schema";
import { and, eq } from "drizzle-orm";

export interface ReconcileOptions {
  db: BetterSQLite3Database<typeof import("@agent-desk/shared/db/schema")>;
  workPackageId: number;
  stepIndex: number;
  workspacePath: string;
  previousBaseline: Record<string, string>;   // {relPath: sha256}
  now: number;
}

export interface ReconcileResult {
  newBaseline: Record<string, string>;
  inserted: number;
  updatedDrift: number;
}

export async function reconcileArtifacts(opts: ReconcileOptions): Promise<ReconcileResult> {
  const snapshot = await scanArtifactDirs(opts.workspacePath);
  const newBaseline: Record<string, string> = {};
  let inserted = 0;
  let updatedDrift = 0;

  for (const s of snapshot) {
    newBaseline[s.relPath] = s.sha256;
    const prior = opts.previousBaseline[s.relPath];

    const existing = opts.db.select().from(workPackageArtifacts)
      .where(and(
        eq(workPackageArtifacts.workPackageId, opts.workPackageId),
        eq(workPackageArtifacts.filePath, s.relPath),
      ))
      .get();

    if (!existing) {
      opts.db.insert(workPackageArtifacts).values({
        workPackageId: opts.workPackageId,
        stepIndex: opts.stepIndex,
        filePath: s.relPath,
        sha256: s.sha256,
        size: s.size,
        recordedAt: opts.now,
        lastSeenSha256: s.sha256,
        lastSeenAt: opts.now,
        driftDetected: 0,
      }).run();
      inserted++;
      continue;
    }

    // 이미 인덱스에 있는 파일 — drift 비교
    const drift = existing.sha256 !== s.sha256 ? 1 : 0;
    opts.db.update(workPackageArtifacts)
      .set({ lastSeenSha256: s.sha256, lastSeenAt: opts.now, driftDetected: drift })
      .where(eq(workPackageArtifacts.id, existing.id))
      .run();
    if (drift) updatedDrift++;
  }

  return { newBaseline, inserted, updatedDrift };
}
```

`prior` 변수를 사용하지 않는 점에 주의 — `existing.sha256` 이 첫 관측 sha 의 진실 원천이므로 drift 비교는 그걸로. previousBaseline 은 다음 baseline 계산에만 영향 (다음 step 의 새 시작점 결정).

- [ ] **Step 4: 실행 → PASS**

### Task 2.3: work-packages 라우트 skeleton

**Files:**
- Create: `apps/gateway/src/routes/work-packages.ts`

- [ ] **Step 1: skeleton + factory signature**

```typescript
import { Hono } from "hono";
import { and, desc, eq } from "drizzle-orm";
import {
  PACKAGES,
  advanceWorkPackageRequest,
  completeWorkPackageRequest,
  sessions,
  startWorkPackageRequest,
  toCatalogEntry,
  workPackages,
  workPackageArtifacts,
  workPackageEvents,
  workspaces,
  type StepContext,
  type WorkPackageArtifactDto,
  type WorkPackageDto,
} from "@agent-desk/shared";
import type { DbHandle } from "../db";
import type { TmuxClient } from "../tmux/commands";
import { injectPrompt, type InjectResult } from "../tmux/inject";
import { ensureSkillInstalled, type EnsureSkillResult } from "../skills/install";
import { reconcileArtifacts, scanArtifactDirs } from "../work-packages/artifacts";

type WorkPackageRow = typeof workPackages.$inferSelect;
type ArtifactRow = typeof workPackageArtifacts.$inferSelect;

function rowToDto(r: WorkPackageRow): WorkPackageDto {
  return {
    id: r.id, sessionId: r.sessionId, packageId: r.packageId,
    currentStep: r.currentStep, status: r.status as WorkPackageDto["status"],
    inputs: JSON.parse(r.inputsJson) as Record<string, unknown>,
    createdAt: r.createdAt, advancedAt: r.advancedAt, completedAt: r.completedAt,
  };
}

function artifactToDto(r: ArtifactRow): WorkPackageArtifactDto {
  return {
    id: r.id, stepIndex: r.stepIndex, filePath: r.filePath,
    sha256: r.sha256, size: r.size,
    recordedAt: r.recordedAt, lastSeenSha256: r.lastSeenSha256, lastSeenAt: r.lastSeenAt,
    driftDetected: r.driftDetected === 1,
  };
}

function baselineFromSnapshot(snap: { relPath: string; sha256: string }[]): Record<string, string> {
  return Object.fromEntries(snap.map((s) => [s.relPath, s.sha256]));
}

export interface WorkPackageRouteOptions {
  db: DbHandle["db"];
  tmux: TmuxClient;
  injectFn?: typeof injectPrompt;
  ensureSkillFn?: typeof ensureSkillInstalled;
  scanFn?: typeof scanArtifactDirs;
  reconcileFn?: typeof reconcileArtifacts;
  now?: () => number;
}

export function workPackageRoutes(opts: WorkPackageRouteOptions): {
  sessionScoped: Hono;
  instanceScoped: Hono;
  catalog: Hono;
} {
  const inject = opts.injectFn ?? injectPrompt;
  const ensureSkill = opts.ensureSkillFn ?? ensureSkillInstalled;
  const scan = opts.scanFn ?? scanArtifactDirs;
  const reconcile = opts.reconcileFn ?? reconcileArtifacts;
  const now = opts.now ?? (() => Date.now());

  const sessionScoped = new Hono();
  const instanceScoped = new Hono();
  const catalog = new Hono();

  catalog.get("/", (c) => {
    return c.json({ packages: Object.values(PACKAGES).map(toCatalogEntry) });
  });

  return { sessionScoped, instanceScoped, catalog };
}
```

- [ ] **Step 2: server.ts 마운트**

`apps/gateway/src/server.ts` 에 import + 마운트 추가:

```typescript
import { workPackageRoutes } from "./routes/work-packages";
// …
const wp = workPackageRoutes({
  db: opts.db.db, tmux,
  injectFn: opts.injectFn,
  ensureSkillFn: opts.ensureSkillFn,
});
api.route("/packages", wp.catalog);
api.route("/sessions", wp.sessionScoped);
api.route("/work-packages", wp.instanceScoped);
```

- [ ] **Step 3: typecheck**

```bash
pnpm -F @agent-desk/gateway typecheck
```

Expected: PASS.

### Task 2.4: 통합 테스트 setup + GET /packages

**Files:**
- Create: `apps/gateway/tests/work-packages.test.ts`

- [ ] **Step 1: setup (sessions.test 베이스)**

```typescript
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { workspaces, sessions, workPackages, workPackageArtifacts } from "@agent-desk/shared";
import { createServer } from "../src/server";
import { openDatabase, type DbHandle } from "../src/db";

const TOKEN = "secret";
const headers = { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" };

let dir: string, fsRoot: string;
let handle: DbHandle;
let url: string;
let stop: () => Promise<void>;
let workspaceId: number;
let claudeSessionId: number;
let codexSessionId: number;

const newSession = vi.fn(async () => {});
const injectFn = vi.fn(async () => ({ injected: true }));
const ensureSkillFn = vi.fn(async () => ({
  status: "installed" as const,
  linkPath: "/tmp/ws/.claude/skills/brainstorming",
  sourcePath: "/tmp/vendor/skills/brainstorming",
}));

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "ad-wp-"));
  fsRoot = mkdtempSync(join(tmpdir(), "ad-wp-fs-"));
  mkdirSync(join(fsRoot, "docs/superpowers/specs"), { recursive: true });
  mkdirSync(join(fsRoot, "docs/superpowers/plans"), { recursive: true });

  handle = openDatabase({ filePath: join(dir, "db.sqlite") });
  const w = handle.db.insert(workspaces).values({
    name: "owngo", path: fsRoot, createdAt: Date.now(),
  }).returning().all();
  workspaceId = w[0].id;
  const sClaude = handle.db.insert(sessions).values({
    tmuxName: "ad-wp-claude", workspaceId, cli: "claude", args: "",
    status: "active", lastActivityAt: Date.now(), createdAt: Date.now(), adopted: 0,
  }).returning().all();
  claudeSessionId = sClaude[0].id;
  const sCodex = handle.db.insert(sessions).values({
    tmuxName: "ad-wp-codex", workspaceId, cli: "codex", args: "",
    status: "active", lastActivityAt: Date.now(), createdAt: Date.now(), adopted: 0,
  }).returning().all();
  codexSessionId = sCodex[0].id;

  const built = await createServer({
    db: handle, token: TOKEN,
    cli: [
      { name: "claude", command: "claude", defaultArgs: [] },
      { name: "codex", command: "codex", defaultArgs: [] },
    ],
    bind: "127.0.0.1", port: 0,
    tmux: {
      listSessions: async () => [], newSession, killSession: async () => {},
      hasSession: async () => true, sendKeys: async () => {},
      capturePane: async () => "", paneCurrentCommand: async () => "claude",
      paneChildren: async () => [],
    },
    injectFn, ensureSkillFn,
    ensureAllSkillsFn: async () => ({ results: [] }),
    installSkillsOnStartup: false,
  });
  url = built.url; stop = built.close;
});

afterAll(async () => {
  await stop(); handle.close();
  rmSync(dir, { recursive: true, force: true });
  rmSync(fsRoot, { recursive: true, force: true });
});

beforeEach(() => { injectFn.mockClear(); ensureSkillFn.mockClear(); });
```

- [ ] **Step 2: GET /packages 테스트**

```typescript
describe("GET /packages", () => {
  it("planning 패키지를 반환한다", async () => {
    const res = await fetch(`${url}/packages`, { headers });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.packages).toHaveLength(1);
    expect(body.packages[0].id).toBe("planning");
    expect(body.packages[0].stepTitles).toEqual(["Brainstorm", "Write plan"]);
  });
});
```

- [ ] **Step 3: 실행 → PASS** (catalog 는 Task 2.3 에서 이미 와이어드)

```bash
pnpm -F @agent-desk/gateway test -- tests/work-packages.test.ts
```

### Task 2.5: POST start 핸들러 (TDD)

**Files:**
- Modify: `apps/gateway/tests/work-packages.test.ts`
- Modify: `apps/gateway/src/routes/work-packages.ts`

- [ ] **Step 1: Failing test — happy path + artifact discovery**

```typescript
describe("POST /sessions/:id/work-packages — start", () => {
  it("Step 1 prompt 주입 + row 생성 + baseline 저장 + 기존 spec 1 개를 artifact 로 인덱싱", async () => {
    // start 직전 fs 에 이미 .md 가 있다 (이전 사용자 작업의 흔적) — 즉시 baseline 으로 캡처되어야 함
    writeFileSync(join(fsRoot, "docs/superpowers/specs/preexisting.md"), "old");

    const res = await fetch(`${url}/sessions/${claudeSessionId}/work-packages`, {
      method: "POST", headers,
      body: JSON.stringify({ packageId: "planning", inputs: { topic: "T", context: "C" } }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.instance.currentStep).toBe(1);
    expect(body.step).toEqual({ index: 1, title: "Brainstorm" });
    expect(injectFn).toHaveBeenCalledTimes(1);
    expect(injectFn.mock.calls[0][0].prompt).toBe("/brainstorming Topic: T · Context: C");

    // start 시점에는 baseline 만 잡고 artifact 는 INSERT 하지 않음 (spec §3.7)
    const arts = handle.db.select().from(workPackageArtifacts).all();
    expect(arts).toHaveLength(0);
    // baseline 에는 preexisting.md 포함
    const row = handle.db.select().from(workPackages).where(eq(workPackages.id, body.instance.id)).get();
    const baseline = JSON.parse(row!.baselineJson);
    expect(baseline["docs/superpowers/specs/preexisting.md"]).toMatch(/^[a-f0-9]{64}$/);
  });
});
```

(Note: spec §3.7 의 "start: baseline 저장, advance/complete 시점에 reconcile" 결정. start 자체는 reconcile 하지 않음 — 이전 사용자 흔적과 work-package 산출물을 구분.)

- [ ] **Step 2: 실행 → FAIL**

- [ ] **Step 3: 핸들러 구현**

```typescript
sessionScoped.post("/:sessionId/work-packages", async (c) => {
  const sid = Number(c.req.param("sessionId"));
  if (!Number.isInteger(sid)) return c.json({ error: "bad_id" }, 400);

  const parsed = startWorkPackageRequest.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: "invalid_request" }, 400);

  const def = PACKAGES[parsed.data.packageId];
  if (!def) return c.json({ error: "unknown_package" }, 400);

  const sessionRow = opts.db.select().from(sessions).where(eq(sessions.id, sid)).get();
  if (!sessionRow) return c.json({ error: "unknown_session" }, 400);
  if (sessionRow.status !== "active") return c.json({ error: "session_dead" }, 409);
  if (def.cliRequirement === "claude" && sessionRow.cli !== "claude") {
    return c.json({ error: "session_cli_mismatch" }, 409);
  }

  const existing = opts.db.select().from(workPackages)
    .where(and(eq(workPackages.sessionId, sid), eq(workPackages.status, "active")))
    .get();
  if (existing) return c.json({ error: "already_has_active_package" }, 409);

  const inputsParsed = def.startForm.schema.safeParse(parsed.data.inputs);
  if (!inputsParsed.success) return c.json({ error: "invalid_inputs" }, 400);

  const ws = opts.db.select().from(workspaces).where(eq(workspaces.id, sessionRow.workspaceId!)).get();
  if (!ws) return c.json({ error: "workspace_missing" }, 500);

  let installResult: EnsureSkillResult | null = null;
  try {
    installResult = await ensureSkill({ workspacePath: ws.path, skillName: def.steps[0].skillName });
  } catch (err) {
    installResult = { status: "error", linkPath: "", sourcePath: "", detail: (err as Error).message };
  }

  // start 시점 baseline scan (어떤 .md 가 이미 있었는지 기록 — 이후 advance 시 비교 기준)
  const baselineSnap = await scan(ws.path);
  const baseline = baselineFromSnapshot(baselineSnap);

  const ctx: StepContext = { workspacePath: ws.path, packageInstanceId: -1 };
  const prompt = def.steps[0].promptTemplate(inputsParsed.data, ctx);

  let injectResult: InjectResult;
  try {
    injectResult = await inject({ tmux: opts.tmux, name: sessionRow.tmuxName, prompt });
  } catch (err) {
    injectResult = { injected: false, reason: "tmux_error", detail: (err as Error).message };
  }
  if (!injectResult.injected) {
    return c.json({ error: "inject_failed", result: injectResult, install: installResult }, 502);
  }

  const t = now();
  const inserted = opts.db.insert(workPackages).values({
    sessionId: sid, packageId: def.id, currentStep: 1, status: "active",
    inputsJson: JSON.stringify(inputsParsed.data),
    baselineJson: JSON.stringify(baseline),
    createdAt: t, advancedAt: t,
  }).returning().all();
  const row = inserted[0];

  opts.db.insert(workPackageEvents).values({
    workPackageId: row.id, kind: "started",
    payloadJson: JSON.stringify({ packageId: def.id, install: installResult }), at: t,
  }).run();
  opts.db.insert(workPackageEvents).values({
    workPackageId: row.id, kind: "step-injected",
    payloadJson: JSON.stringify({ step: 1, install: installResult }), at: t,
  }).run();
  opts.db.update(sessions).set({ lastActivityAt: t }).where(eq(sessions.id, sid)).run();

  return c.json({
    instance: rowToDto(row),
    step: { index: 1, title: def.steps[0].title },
    inject: injectResult, install: installResult,
  }, 200);
});
```

- [ ] **Step 4: 실행 → PASS**

### Task 2.6: start 에러 경로

**Files:**
- Modify: `apps/gateway/tests/work-packages.test.ts`

- [ ] **Step 1: 에러 케이스 추가**

```typescript
it("unknown_package 를 400 으로 거부", async () => {
  const res = await fetch(`${url}/sessions/${claudeSessionId}/work-packages`, {
    method: "POST", headers,
    body: JSON.stringify({ packageId: "nope", inputs: { topic: "t" } }),
  });
  expect(res.status).toBe(400);
  expect((await res.json()).error).toBe("unknown_package");
});

it("invalid_inputs 를 400 으로 거부 (topic 누락)", async () => {
  // 이전 active 인스턴스 abandon
  const active = handle.db.select().from(workPackages).where(eq(workPackages.status, "active")).get();
  if (active) await fetch(`${url}/work-packages/${active.id}/complete`, {
    method: "POST", headers, body: JSON.stringify({ outcome: "abandoned" }),
  });
  const res = await fetch(`${url}/sessions/${claudeSessionId}/work-packages`, {
    method: "POST", headers,
    body: JSON.stringify({ packageId: "planning", inputs: { context: "no topic" } }),
  });
  expect(res.status).toBe(400);
  expect((await res.json()).error).toBe("invalid_inputs");
});

it("cli != claude 인 세션을 409 로 거부", async () => {
  const res = await fetch(`${url}/sessions/${codexSessionId}/work-packages`, {
    method: "POST", headers,
    body: JSON.stringify({ packageId: "planning", inputs: { topic: "t" } }),
  });
  expect(res.status).toBe(409);
  expect((await res.json()).error).toBe("session_cli_mismatch");
});

it("inject 실패 시 502 + work_packages row 없음 + audit 없음", async () => {
  injectFn.mockResolvedValueOnce({ injected: false, reason: "timeout" });
  // 새 세션
  const s = handle.db.insert(sessions).values({
    tmuxName: "ad-wp-fail", workspaceId, cli: "claude", args: "",
    status: "active", lastActivityAt: Date.now(), createdAt: Date.now(), adopted: 0,
  }).returning().all();
  const before = handle.db.select().from(workPackages).all().length;
  const res = await fetch(`${url}/sessions/${s[0].id}/work-packages`, {
    method: "POST", headers,
    body: JSON.stringify({ packageId: "planning", inputs: { topic: "t" } }),
  });
  expect(res.status).toBe(502);
  const after = handle.db.select().from(workPackages).all().length;
  expect(after).toBe(before);
});
```

- [ ] **Step 2: 실행 → 모두 PASS** (이미 구현됨)

### Task 2.7: POST advance (TDD)

**Files:**
- Modify: `apps/gateway/tests/work-packages.test.ts`
- Modify: `apps/gateway/src/routes/work-packages.ts`

- [ ] **Step 1: Failing test — happy + artifact reconcile**

```typescript
describe("POST /work-packages/:id/advance", () => {
  it("step 1 → step 2: /writing-plans 주입 + Step 1 에서 새로 생긴 spec.md 를 artifact 로 인덱싱", async () => {
    // 새 세션·인스턴스
    const s = handle.db.insert(sessions).values({
      tmuxName: "ad-wp-adv", workspaceId, cli: "claude", args: "",
      status: "active", lastActivityAt: Date.now(), createdAt: Date.now(), adopted: 0,
    }).returning().all();
    const sid = s[0].id;
    // 인스턴스 생성 (이때 fsRoot 에 baseline 캡처)
    const startRes = await fetch(`${url}/sessions/${sid}/work-packages`, {
      method: "POST", headers,
      body: JSON.stringify({ packageId: "planning", inputs: { topic: "X" } }),
    });
    const wpId = (await startRes.json()).instance.id;

    // 사용자가 brainstorming 끝에 spec.md 를 만든 척
    writeFileSync(join(fsRoot, "docs/superpowers/specs/new-design.md"), "design body");

    injectFn.mockClear();
    const res = await fetch(`${url}/work-packages/${wpId}/advance`, {
      method: "POST", headers, body: JSON.stringify({ expectedCurrentStep: 1 }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.instance.currentStep).toBe(2);
    expect(injectFn.mock.calls[0][0].prompt).toBe("/writing-plans");

    // artifact INSERT 확인
    const arts = handle.db.select().from(workPackageArtifacts)
      .where(eq(workPackageArtifacts.workPackageId, wpId)).all();
    const newDesign = arts.find((a) => a.filePath === "docs/superpowers/specs/new-design.md");
    expect(newDesign).toBeTruthy();
    expect(newDesign!.stepIndex).toBe(1);  // step 1 끝나는 시점에 인덱싱
  });

  it("expected_step_mismatch 를 409 로 거부", async () => {
    const active = handle.db.select().from(workPackages)
      .where(eq(workPackages.status, "active")).get();
    if (!active) throw new Error("active row 없음");
    const res = await fetch(`${url}/work-packages/${active.id}/advance`, {
      method: "POST", headers, body: JSON.stringify({ expectedCurrentStep: 99 }),
    });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("expected_step_mismatch");
  });

  it("마지막 step 에서 no_next_step 을 409 로 반환", async () => {
    const last = handle.db.select().from(workPackages)
      .where(and(eq(workPackages.status, "active"), eq(workPackages.currentStep, 2))).get();
    if (!last) throw new Error("step 2 active row 없음");
    const res = await fetch(`${url}/work-packages/${last.id}/advance`, {
      method: "POST", headers, body: JSON.stringify({ expectedCurrentStep: 2 }),
    });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("no_next_step");
  });
});
```

- [ ] **Step 2: 실행 → FAIL**

- [ ] **Step 3: advance 핸들러 구현**

`instanceScoped.post("/:id/advance", ...)`:

```typescript
instanceScoped.post("/:id/advance", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) return c.json({ error: "bad_id" }, 400);

  const parsed = advanceWorkPackageRequest.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: "invalid_request" }, 400);

  const row = opts.db.select().from(workPackages).where(eq(workPackages.id, id)).get();
  if (!row) return c.json({ error: "not_found" }, 404);
  if (row.status !== "active") return c.json({ error: "already_completed" }, 409);
  if (row.currentStep !== parsed.data.expectedCurrentStep) {
    return c.json({ error: "expected_step_mismatch", actual: row.currentStep }, 409);
  }

  const def = PACKAGES[row.packageId];
  if (!def) return c.json({ error: "unknown_package" }, 500);
  const nextStep = def.steps[row.currentStep];
  if (!nextStep) return c.json({ error: "no_next_step" }, 409);

  const sessionRow = opts.db.select().from(sessions).where(eq(sessions.id, row.sessionId)).get();
  if (!sessionRow) return c.json({ error: "session_missing" }, 500);
  const ws = opts.db.select().from(workspaces).where(eq(workspaces.id, sessionRow.workspaceId!)).get();
  if (!ws) return c.json({ error: "workspace_missing" }, 500);

  // 이전 step 의 산출물 reconcile (step_index = 끝나는 step = row.currentStep)
  const previousBaseline = JSON.parse(row.baselineJson) as Record<string, string>;
  const t = now();
  const recon = await reconcile({
    db: opts.db, workPackageId: row.id, stepIndex: row.currentStep,
    workspacePath: ws.path, previousBaseline, now: t,
  });

  let installResult: EnsureSkillResult | null = null;
  try {
    installResult = await ensureSkill({ workspacePath: ws.path, skillName: nextStep.skillName });
  } catch (err) {
    installResult = { status: "error", linkPath: "", sourcePath: "", detail: (err as Error).message };
  }

  const inputs = JSON.parse(row.inputsJson) as Record<string, unknown>;
  const ctx: StepContext = { workspacePath: ws.path, packageInstanceId: row.id };
  const prompt = nextStep.promptTemplate(inputs, ctx);

  let injectResult: InjectResult;
  try {
    injectResult = await inject({ tmux: opts.tmux, name: sessionRow.tmuxName, prompt });
  } catch (err) {
    injectResult = { injected: false, reason: "tmux_error", detail: (err as Error).message };
  }

  if (!injectResult.injected) {
    opts.db.insert(workPackageEvents).values({
      workPackageId: row.id, kind: "step-inject-failed",
      payloadJson: JSON.stringify({ step: nextStep.index, reason: injectResult.reason, detail: injectResult.detail }),
      at: t,
    }).run();
    return c.json({ error: "inject_failed", result: injectResult, install: installResult }, 502);
  }

  opts.db.update(workPackages).set({
    currentStep: nextStep.index, advancedAt: t,
    baselineJson: JSON.stringify(recon.newBaseline),
  }).where(eq(workPackages.id, row.id)).run();

  opts.db.insert(workPackageEvents).values({
    workPackageId: row.id, kind: "advanced",
    payloadJson: JSON.stringify({
      from: row.currentStep, to: nextStep.index,
      inserted: recon.inserted, updatedDrift: recon.updatedDrift,
    }),
    at: t,
  }).run();
  opts.db.insert(workPackageEvents).values({
    workPackageId: row.id, kind: "step-injected",
    payloadJson: JSON.stringify({ step: nextStep.index, install: installResult }), at: t,
  }).run();
  opts.db.update(sessions).set({ lastActivityAt: t }).where(eq(sessions.id, row.sessionId)).run();

  const updated = opts.db.select().from(workPackages).where(eq(workPackages.id, row.id)).get();
  return c.json({
    instance: rowToDto(updated!),
    step: { index: nextStep.index, title: nextStep.title },
    inject: injectResult, install: installResult,
    artifactsDelta: { inserted: recon.inserted, updatedDrift: recon.updatedDrift },
  }, 200);
});
```

- [ ] **Step 4: 실행 → PASS**

### Task 2.8: POST complete (TDD)

**Files:**
- Modify: `apps/gateway/tests/work-packages.test.ts`
- Modify: `apps/gateway/src/routes/work-packages.ts`

- [ ] **Step 1: Failing test**

```typescript
describe("POST /work-packages/:id/complete", () => {
  it("status=completed 로 전이 + 마지막 step 산출물 인덱싱", async () => {
    // setup
    const s = handle.db.insert(sessions).values({
      tmuxName: "ad-wp-cmp", workspaceId, cli: "claude", args: "",
      status: "active", lastActivityAt: Date.now(), createdAt: Date.now(), adopted: 0,
    }).returning().all();
    const start = await fetch(`${url}/sessions/${s[0].id}/work-packages`, {
      method: "POST", headers, body: JSON.stringify({ packageId: "planning", inputs: { topic: "T" } }),
    });
    const wpId = (await start.json()).instance.id;

    // step 1 끝, 새 plan.md 생성
    writeFileSync(join(fsRoot, "docs/superpowers/plans/p.md"), "plan body");
    const res = await fetch(`${url}/work-packages/${wpId}/complete`, {
      method: "POST", headers, body: JSON.stringify({}),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.instance.status).toBe("completed");
    expect(body.instance.completedAt).toBeGreaterThan(0);

    const arts = handle.db.select().from(workPackageArtifacts)
      .where(eq(workPackageArtifacts.workPackageId, wpId)).all();
    expect(arts.some((a) => a.filePath === "docs/superpowers/plans/p.md")).toBe(true);
  });

  it("abandoned outcome 을 받는다", async () => {
    const s = handle.db.insert(sessions).values({
      tmuxName: "ad-wp-abd", workspaceId, cli: "claude", args: "",
      status: "active", lastActivityAt: Date.now(), createdAt: Date.now(), adopted: 0,
    }).returning().all();
    const start = await fetch(`${url}/sessions/${s[0].id}/work-packages`, {
      method: "POST", headers, body: JSON.stringify({ packageId: "planning", inputs: { topic: "T" } }),
    });
    const wpId = (await start.json()).instance.id;
    const res = await fetch(`${url}/work-packages/${wpId}/complete`, {
      method: "POST", headers, body: JSON.stringify({ outcome: "abandoned" }),
    });
    expect((await res.json()).instance.status).toBe("abandoned");
  });

  it("이미 완료된 인스턴스는 409", async () => {
    const done = handle.db.select().from(workPackages)
      .where(eq(workPackages.status, "completed")).get();
    if (!done) throw new Error("no completed row");
    const res = await fetch(`${url}/work-packages/${done.id}/complete`, {
      method: "POST", headers, body: JSON.stringify({}),
    });
    expect(res.status).toBe(409);
  });
});
```

- [ ] **Step 2: 실행 → FAIL**

- [ ] **Step 3: 핸들러 구현**

```typescript
instanceScoped.post("/:id/complete", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) return c.json({ error: "bad_id" }, 400);

  const parsed = completeWorkPackageRequest.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: "invalid_request" }, 400);

  const row = opts.db.select().from(workPackages).where(eq(workPackages.id, id)).get();
  if (!row) return c.json({ error: "not_found" }, 404);
  if (row.status !== "active") return c.json({ error: "already_completed" }, 409);

  const sessionRow = opts.db.select().from(sessions).where(eq(sessions.id, row.sessionId)).get();
  const ws = sessionRow
    ? opts.db.select().from(workspaces).where(eq(workspaces.id, sessionRow.workspaceId!)).get()
    : null;
  const t = now();
  if (ws) {
    const previousBaseline = JSON.parse(row.baselineJson) as Record<string, string>;
    await reconcile({
      db: opts.db, workPackageId: row.id, stepIndex: row.currentStep,
      workspacePath: ws.path, previousBaseline, now: t,
    });
  }

  const newStatus = parsed.data.outcome === "abandoned" ? "abandoned" : "completed";
  opts.db.update(workPackages).set({ status: newStatus, completedAt: t })
    .where(eq(workPackages.id, id)).run();
  opts.db.insert(workPackageEvents).values({
    workPackageId: id, kind: newStatus,
    payloadJson: JSON.stringify({ at: t }), at: t,
  }).run();

  const updated = opts.db.select().from(workPackages).where(eq(workPackages.id, id)).get();
  return c.json({ instance: rowToDto(updated!) }, 200);
});
```

- [ ] **Step 4: 실행 → PASS**

### Task 2.9: GET /sessions/:id/work-packages + GET /work-packages/:id/artifacts

**Files:**
- Modify: `apps/gateway/tests/work-packages.test.ts`
- Modify: `apps/gateway/src/routes/work-packages.ts`

- [ ] **Step 1: Failing tests**

```typescript
describe("GET /sessions/:id/work-packages", () => {
  it("세션의 인스턴스를 최신순으로 반환", async () => {
    const res = await fetch(`${url}/sessions/${claudeSessionId}/work-packages`, { headers });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.instances)).toBe(true);
    expect(body.instances.length).toBeGreaterThan(0);
  });
});

describe("GET /work-packages/:id/artifacts", () => {
  it("artifact 인덱스를 반환", async () => {
    const wp = handle.db.select().from(workPackages).get();
    if (!wp) throw new Error("no wp");
    const res = await fetch(`${url}/work-packages/${wp.id}/artifacts`, { headers });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.artifacts)).toBe(true);
  });
});
```

- [ ] **Step 2: 실행 → FAIL**

- [ ] **Step 3: 핸들러**

```typescript
sessionScoped.get("/:sessionId/work-packages", (c) => {
  const sid = Number(c.req.param("sessionId"));
  if (!Number.isInteger(sid)) return c.json({ error: "bad_id" }, 400);
  const rows = opts.db.select().from(workPackages)
    .where(eq(workPackages.sessionId, sid))
    .orderBy(desc(workPackages.createdAt))
    .all();
  return c.json({ instances: rows.map(rowToDto) });
});

instanceScoped.get("/:id/artifacts", (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) return c.json({ error: "bad_id" }, 400);
  const rows = opts.db.select().from(workPackageArtifacts)
    .where(eq(workPackageArtifacts.workPackageId, id))
    .all();
  return c.json({ artifacts: rows.map(artifactToDto) });
});
```

- [ ] **Step 4: 실행 → PASS**

### Task 2.10: Phase 2 회귀 + commit

- [ ] **Step 1: 전체**

```bash
cd /workspaces/owngo/agent-desk && pnpm typecheck && pnpm test
```

Expected: PASS.

- [ ] **Step 2: 커밋**

```bash
git -C /workspaces/owngo/agent-desk add apps/gateway

git -C /workspaces/owngo/agent-desk commit -m "$(cat <<'EOF'
feat(gateway): work-packages 라우트 + artifact discovery (inline)

- routes/work-packages.ts : GET /packages, POST /sessions/:id/work-packages, POST /work-packages/:id/{advance,complete}, GET /sessions/:id/work-packages, GET /work-packages/:id/artifacts
- work-packages/artifacts.ts : scanArtifactDirs (docs/superpowers/{specs,plans}/*.md sha256), reconcileArtifacts (이전 baseline 비교 → INSERT 신규 / UPDATE drift)
- server.ts : 라우트 마운트
- start 시점에 baseline 만 캡처, advance/complete 시점에 reconcile
- 모든 CLI 에서 동일 동작 (hook·AGENTS.md 미사용)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 3 — Web: picker, modal, ActiveCard, ArtifactList

### Task 3.1: gateway-client 메서드

**Files:**
- Modify: `apps/web/lib/gateway-client.ts`

- [ ] **Step 1: 추가**

기존 export 객체에 `packages`, `workPackages` 네임스페이스 추가:

```typescript
packages: {
  list: async (opts?: { signal?: AbortSignal }) =>
    fetchJson(`/packages`, { signal: opts?.signal }) as Promise<{ packages: PackageCatalogEntry[] }>,
},
workPackages: {
  listForSession: async (sessionId: number, opts?: { signal?: AbortSignal }) =>
    fetchJson(`/sessions/${sessionId}/work-packages`, { signal: opts?.signal }) as Promise<{
      instances: WorkPackageDto[];
    }>,
  listArtifacts: async (id: number, opts?: { signal?: AbortSignal }) =>
    fetchJson(`/work-packages/${id}/artifacts`, { signal: opts?.signal }) as Promise<{
      artifacts: WorkPackageArtifactDto[];
    }>,
  start: async (sessionId: number, body: StartWorkPackageRequest) =>
    fetchJson(`/sessions/${sessionId}/work-packages`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }) as Promise<{ instance: WorkPackageDto; step: { index: number; title: string } }>,
  advance: async (id: number, body: AdvanceWorkPackageRequest) =>
    fetchJson(`/work-packages/${id}/advance`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }) as Promise<{ instance: WorkPackageDto; step: { index: number; title: string } }>,
  complete: async (id: number, body?: CompleteWorkPackageRequest) =>
    fetchJson(`/work-packages/${id}/complete`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify(body ?? { outcome: "success" }),
    }) as Promise<{ instance: WorkPackageDto }>,
},
```

imports:

```typescript
import type {
  AdvanceWorkPackageRequest, CompleteWorkPackageRequest,
  PackageCatalogEntry, StartWorkPackageRequest,
  WorkPackageArtifactDto, WorkPackageDto,
} from "@agent-desk/shared";
```

- [ ] **Step 2: 기존 client 테스트에 1 케이스 추가**

`apps/web/tests/gateway-client.test.ts` 에:

```typescript
it("workPackages.start 호출 시 POST /sessions/:id/work-packages", async () => {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({
    instance: { id: 1, sessionId: 7, packageId: "planning", currentStep: 1,
      status: "active", inputs: {}, createdAt: 1, advancedAt: 1, completedAt: null },
    step: { index: 1, title: "Brainstorm" },
  }), { status: 200 }));
  global.fetch = fetchMock as unknown as typeof fetch;
  const r = await gateway.workPackages.start(7, { packageId: "planning", inputs: { topic: "t" } });
  expect(r.instance.id).toBe(1);
  expect(fetchMock).toHaveBeenCalledWith(
    expect.stringContaining("/sessions/7/work-packages"),
    expect.objectContaining({ method: "POST" }),
  );
});
```

- [ ] **Step 3: 실행 → PASS**

### Task 3.2: PackageStartForm

**Files:**
- Create: `apps/web/components/package-start-form.tsx`
- Create: `apps/web/tests/package-start-form.test.tsx`

- [ ] **Step 1: 테스트**

```typescript
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { FieldSpec } from "@agent-desk/shared";
import { PackageStartForm } from "../components/package-start-form";

const fields: FieldSpec[] = [
  { name: "topic", label: "Topic", kind: "text", required: true, maxLength: 100 },
  { name: "context", label: "Context", kind: "textarea", maxLength: 500, rows: 3 },
];

describe("PackageStartForm", () => {
  it("필드를 렌더한다", () => {
    render(<PackageStartForm fields={fields} onSubmit={() => {}} onDismiss={() => {}} onBack={() => {}} />);
    expect(screen.getByLabelText(/Topic/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Context/i)).toBeInTheDocument();
  });

  it("submit 시 입력값 전달", () => {
    const onSubmit = vi.fn();
    render(<PackageStartForm fields={fields} onSubmit={onSubmit} onDismiss={() => {}} onBack={() => {}} />);
    fireEvent.change(screen.getByLabelText(/Topic/i), { target: { value: "X" } });
    fireEvent.change(screen.getByLabelText(/Context/i), { target: { value: "Y" } });
    fireEvent.submit(screen.getByRole("form"));
    expect(onSubmit).toHaveBeenCalledWith({ topic: "X", context: "Y" });
  });

  it("required 빈 상태면 submit 비활성", () => {
    render(<PackageStartForm fields={fields} onSubmit={() => {}} onDismiss={() => {}} onBack={() => {}} />);
    expect(screen.getByRole("button", { name: /Start/i })).toBeDisabled();
  });

  it("Back 버튼이 onBack 호출", () => {
    const onBack = vi.fn();
    render(<PackageStartForm fields={fields} onSubmit={() => {}} onDismiss={() => {}} onBack={onBack} />);
    fireEvent.click(screen.getByRole("button", { name: /Back/i }));
    expect(onBack).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 실행 → FAIL**

- [ ] **Step 3: 구현**

```tsx
"use client";
import { useEffect, useId, useRef, useState } from "react";
import type { FieldSpec } from "@agent-desk/shared";
import { Field, fieldControl } from "./ui/field";
import { btnGhost, btnPrimary } from "./ui/button-classes";

export function PackageStartForm(props: {
  fields: FieldSpec[];
  busy?: boolean;
  errorMessage?: string | null;
  submitLabel?: string;
  onBack: () => void;
  onSubmit: (payload: Record<string, string>) => void | Promise<void>;
  onDismiss: () => void;
}) {
  const baseId = useId();
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(props.fields.map((f) => [f.name, ""])),
  );
  const firstRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  useEffect(() => { queueMicrotask(() => firstRef.current?.focus()); }, []);

  const requiredMissing = props.fields.some((f) => f.required && !values[f.name]?.trim());
  const canSubmit = !requiredMissing && !props.busy;

  return (
    <form
      role="form"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!canSubmit) return;
        const trimmed: Record<string, string> = {};
        for (const f of props.fields) {
          const v = values[f.name]?.trim();
          if (v) trimmed[f.name] = v;
        }
        await props.onSubmit(trimmed);
      }}
      className="flex w-full max-w-lg flex-col gap-4 border border-[var(--hill-rule)] bg-[var(--background)] p-6 shadow-[0_24px_72px_-32px_rgba(26,18,8,0.45)]"
    >
      {props.fields.map((f, i) => {
        const id = `${baseId}-${f.name}`;
        return (
          <Field key={f.name} htmlFor={id} label={f.label} hint={f.hint}>
            {f.kind === "text" ? (
              <input
                ref={i === 0 ? (firstRef as React.RefObject<HTMLInputElement>) : undefined}
                id={id} type="text" required={f.required}
                maxLength={f.maxLength} placeholder={f.placeholder}
                value={values[f.name]}
                onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
                className={fieldControl}
              />
            ) : (
              <textarea
                ref={i === 0 ? (firstRef as React.RefObject<HTMLTextAreaElement>) : undefined}
                id={id} rows={f.rows ?? 3}
                maxLength={f.maxLength} placeholder={f.placeholder}
                value={values[f.name]}
                onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
                className={`${fieldControl} resize-y`}
              />
            )}
          </Field>
        );
      })}

      {props.errorMessage && (
        <div role="alert" className="text-[11px] text-red-700">{props.errorMessage}</div>
      )}

      <div className="flex items-center justify-between gap-2">
        <button type="button" className={btnGhost} onClick={props.onBack} disabled={props.busy}>
          Back
        </button>
        <div className="flex gap-2">
          <button type="button" className={btnGhost} onClick={props.onDismiss} disabled={props.busy}>
            Skip
          </button>
          <button type="submit" disabled={!canSubmit} className={btnPrimary}>
            {props.busy ? "…" : (props.submitLabel ?? "Start work package")}
          </button>
        </div>
      </div>
    </form>
  );
}
```

- [ ] **Step 4: 실행 → PASS**

### Task 3.3: PackagePicker

**Files:**
- Create: `apps/web/components/package-picker.tsx`
- Create: `apps/web/tests/package-picker.test.tsx`

- [ ] **Step 1: 테스트**

```typescript
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { PackageCatalogEntry } from "@agent-desk/shared";
import { PackagePicker } from "../components/package-picker";

const planning: PackageCatalogEntry = {
  id: "planning", title: "기획", description: "spec → plan",
  cliRequirement: "claude",
  fields: [], stepTitles: ["Brainstorm", "Write plan"],
};

describe("PackagePicker", () => {
  it("카드를 렌더하고 클릭 시 onSelect 호출", () => {
    const onSelect = vi.fn();
    render(<PackagePicker packages={[planning]} sessionCli="claude" onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("button", { name: /기획/ }));
    expect(onSelect).toHaveBeenCalledWith("planning");
  });

  it("cli mismatch 면 disabled + tooltip", () => {
    render(<PackagePicker packages={[planning]} sessionCli="codex" onSelect={() => {}} />);
    const btn = screen.getByRole("button", { name: /기획/ });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute("title", expect.stringMatching(/claude/i));
  });

  it("패키지가 비면 안내 텍스트", () => {
    render(<PackagePicker packages={[]} sessionCli="claude" onSelect={() => {}} />);
    expect(screen.getByText(/no packages/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 실행 → FAIL**

- [ ] **Step 3: 구현**

```tsx
"use client";
import type { PackageCatalogEntry } from "@agent-desk/shared";

export function PackagePicker(props: {
  packages: PackageCatalogEntry[];
  sessionCli: string;
  onSelect: (id: string) => void;
}) {
  if (props.packages.length === 0) {
    return <div className="p-4 text-[11px] opacity-60">No packages available.</div>;
  }
  return (
    <ul className="flex flex-col gap-2 border border-[var(--hill-rule)] bg-[var(--background)] p-4">
      {props.packages.map((p) => {
        const cliOk = p.cliRequirement === "any" || p.cliRequirement === props.sessionCli;
        return (
          <li key={p.id}>
            <button
              type="button"
              disabled={!cliOk}
              title={!cliOk ? `${p.cliRequirement} CLI 필요` : undefined}
              aria-label={p.title}
              className="w-full text-left p-3 border border-[var(--hill-rule)] hover:bg-[var(--hill-bg-2)] disabled:opacity-40 disabled:cursor-not-allowed"
              onClick={() => props.onSelect(p.id)}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-semibold">{p.title}</span>
                <span className="text-[10px] uppercase tracking-[0.2em] opacity-50">
                  {p.stepTitles.join(" → ")}
                </span>
              </div>
              <div className="mt-1 text-[11px] opacity-60">{p.description}</div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
```

- [ ] **Step 4: 실행 → PASS**

### Task 3.4: WorkPackageModal (2-step)

**Files:**
- Create: `apps/web/components/work-package-modal.tsx`
- Create: `apps/web/tests/work-package-modal.test.tsx`

- [ ] **Step 1: 테스트**

```typescript
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { PackageCatalogEntry } from "@agent-desk/shared";
import { WorkPackageModal } from "../components/work-package-modal";

const planning: PackageCatalogEntry = {
  id: "planning", title: "기획", description: "test",
  cliRequirement: "claude",
  fields: [{ name: "topic", label: "Topic", kind: "text", required: true, maxLength: 100 }],
  stepTitles: ["Brainstorm", "Write plan"],
};

describe("WorkPackageModal", () => {
  it("열리면 picker 부터 표시 (V1 패키지 1 개여도)", () => {
    render(<WorkPackageModal open packages={[planning]} sessionCli="claude"
      onStart={() => {}} onDismiss={() => {}} />);
    expect(screen.getByText(/기획/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Topic/i)).toBeNull();  // form 아직 안 보임
  });

  it("카드 클릭 → form 표시", async () => {
    render(<WorkPackageModal open packages={[planning]} sessionCli="claude"
      onStart={() => {}} onDismiss={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /기획/ }));
    await waitFor(() => expect(screen.getByLabelText(/Topic/i)).toBeInTheDocument());
  });

  it("form 의 Back → picker 로 복귀", async () => {
    render(<WorkPackageModal open packages={[planning]} sessionCli="claude"
      onStart={() => {}} onDismiss={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /기획/ }));
    await waitFor(() => screen.getByLabelText(/Topic/i));
    fireEvent.click(screen.getByRole("button", { name: /Back/i }));
    await waitFor(() => expect(screen.queryByLabelText(/Topic/i)).toBeNull());
    expect(screen.getByText(/기획/)).toBeInTheDocument();
  });

  it("Start 시 onStart({packageId, inputs}) 호출", async () => {
    const onStart = vi.fn();
    render(<WorkPackageModal open packages={[planning]} sessionCli="claude"
      onStart={onStart} onDismiss={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /기획/ }));
    await waitFor(() => screen.getByLabelText(/Topic/i));
    fireEvent.change(screen.getByLabelText(/Topic/i), { target: { value: "T" } });
    fireEvent.submit(screen.getByRole("form"));
    await waitFor(() => expect(onStart).toHaveBeenCalledWith({
      packageId: "planning", inputs: { topic: "T" },
    }));
  });

  it("open=false 면 렌더 안 함", () => {
    const { container } = render(<WorkPackageModal open={false} packages={[planning]}
      sessionCli="claude" onStart={() => {}} onDismiss={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });
});
```

- [ ] **Step 2: 실행 → FAIL**

- [ ] **Step 3: 구현**

```tsx
"use client";
import { useEffect, useState } from "react";
import type { PackageCatalogEntry, StartWorkPackageRequest } from "@agent-desk/shared";
import { PackagePicker } from "./package-picker";
import { PackageStartForm } from "./package-start-form";

export function WorkPackageModal(props: {
  open: boolean;
  packages: PackageCatalogEntry[];
  sessionCli: string;
  busy?: boolean;
  errorMessage?: string | null;
  onStart: (body: StartWorkPackageRequest) => void | Promise<void>;
  onDismiss: () => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => { if (!props.open) setSelectedId(null); }, [props.open]);
  useEffect(() => {
    if (!props.open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") props.onDismiss(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [props.open, props]);

  if (!props.open) return null;
  const selected = selectedId ? props.packages.find((p) => p.id === selectedId) ?? null : null;

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="work-package-title"
      className="absolute inset-0 z-20 flex items-center justify-center bg-[rgba(26,18,8,0.32)] backdrop-blur-sm"
    >
      <div className="flex w-full max-w-lg flex-col gap-3">
        <div className="flex items-baseline justify-between gap-2 px-1">
          <h2 id="work-package-title" className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[#1a1208]">
            Work package — {selected ? selected.title : "select"}
          </h2>
          {selected && <span className="text-[10px] uppercase tracking-[0.22em] opacity-40">{selected.id}</span>}
        </div>
        {!selected ? (
          <PackagePicker
            packages={props.packages}
            sessionCli={props.sessionCli}
            onSelect={setSelectedId}
          />
        ) : (
          <PackageStartForm
            fields={selected.fields}
            busy={props.busy} errorMessage={props.errorMessage}
            onBack={() => setSelectedId(null)}
            onDismiss={props.onDismiss}
            onSubmit={async (inputs) => {
              await props.onStart({ packageId: selected.id, inputs });
            }}
          />
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: 실행 → PASS**

### Task 3.5: ArtifactList

**Files:**
- Create: `apps/web/components/artifact-list.tsx`
- Create: `apps/web/tests/artifact-list.test.tsx`

- [ ] **Step 1: 테스트**

```typescript
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { WorkPackageArtifactDto } from "@agent-desk/shared";
import { ArtifactList } from "../components/artifact-list";

const a: WorkPackageArtifactDto = {
  id: 1, stepIndex: 1, filePath: "docs/superpowers/specs/foo.md",
  sha256: "a".repeat(64), size: 100, recordedAt: 1, lastSeenSha256: "a".repeat(64), lastSeenAt: 1,
  driftDetected: false,
};
const aDrift: WorkPackageArtifactDto = { ...a, id: 2, lastSeenSha256: "b".repeat(64), driftDetected: true };

describe("ArtifactList", () => {
  it("파일 경로를 표시한다", () => {
    render(<ArtifactList artifacts={[a]} />);
    expect(screen.getByText(/specs\/foo\.md/)).toBeInTheDocument();
  });

  it("drift 면 수정됨 배지", () => {
    render(<ArtifactList artifacts={[aDrift]} />);
    expect(screen.getByText(/수정됨/)).toBeInTheDocument();
  });

  it("비어있으면 안내 텍스트", () => {
    render(<ArtifactList artifacts={[]} />);
    expect(screen.getByText(/아직 산출물 없음|No artifacts/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 실행 → FAIL**

- [ ] **Step 3: 구현**

```tsx
"use client";
import type { WorkPackageArtifactDto } from "@agent-desk/shared";

export function ArtifactList(props: { artifacts: WorkPackageArtifactDto[] }) {
  if (props.artifacts.length === 0) {
    return <div className="text-[11px] opacity-50">아직 산출물 없음</div>;
  }
  return (
    <ul className="flex flex-col gap-1">
      {props.artifacts.map((a) => (
        <li key={a.id} className="flex items-center justify-between gap-2 text-[11px]">
          <span className="truncate font-mono">{a.filePath}</span>
          {a.driftDetected && (
            <span className="px-1.5 py-0.5 border border-[var(--hill-rule)] text-[9px] uppercase tracking-[0.15em] opacity-70">
              수정됨
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 4: 실행 → PASS**

### Task 3.6: ActivePackageCard

**Files:**
- Create: `apps/web/components/active-package-card.tsx`
- Create: `apps/web/tests/active-package-card.test.tsx`

- [ ] **Step 1: 테스트**

```typescript
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ActivePackageCard } from "../components/active-package-card";

const baseInstance = {
  id: 1, sessionId: 7, packageId: "planning",
  currentStep: 1, status: "active" as const, inputs: { topic: "T" },
  createdAt: Date.now() - 60_000, advancedAt: Date.now() - 60_000, completedAt: null,
};

describe("ActivePackageCard", () => {
  it("진행도와 step 표시", () => {
    render(<ActivePackageCard instance={baseInstance} stepTitles={["Brainstorm", "Write plan"]}
      packageTitle="기획" artifacts={[]} onAdvance={() => {}} onComplete={() => {}} />);
    expect(screen.getByText(/Step 1\/2/)).toBeInTheDocument();
    expect(screen.getByText(/Brainstorm/)).toBeInTheDocument();
  });

  it("Next step 클릭 시 onAdvance(currentStep)", () => {
    const onAdvance = vi.fn();
    render(<ActivePackageCard instance={baseInstance} stepTitles={["Brainstorm", "Write plan"]}
      packageTitle="기획" artifacts={[]} onAdvance={onAdvance} onComplete={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /Next step/i }));
    expect(onAdvance).toHaveBeenCalledWith(1);
  });

  it("마지막 step 에선 Next 비활성", () => {
    render(<ActivePackageCard instance={{ ...baseInstance, currentStep: 2 }}
      stepTitles={["Brainstorm", "Write plan"]} packageTitle="기획" artifacts={[]}
      onAdvance={() => {}} onComplete={() => {}} />);
    expect(screen.getByRole("button", { name: /Next step/i })).toBeDisabled();
  });

  it("Complete 호출", () => {
    const onComplete = vi.fn();
    render(<ActivePackageCard instance={baseInstance} stepTitles={["Brainstorm", "Write plan"]}
      packageTitle="기획" artifacts={[]} onAdvance={() => {}} onComplete={onComplete} />);
    fireEvent.click(screen.getByRole("button", { name: /Complete/i }));
    expect(onComplete).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 실행 → FAIL**

- [ ] **Step 3: 구현**

```tsx
"use client";
import type { WorkPackageArtifactDto, WorkPackageDto } from "@agent-desk/shared";
import { ArtifactList } from "./artifact-list";
import { btnGhost, btnPrimary } from "./ui/button-classes";

export function ActivePackageCard(props: {
  instance: WorkPackageDto;
  stepTitles: string[];
  packageTitle: string;
  artifacts: WorkPackageArtifactDto[];
  busy?: boolean;
  onAdvance: (expectedCurrentStep: number) => void | Promise<void>;
  onComplete: () => void | Promise<void>;
}) {
  const total = props.stepTitles.length;
  const current = props.instance.currentStep;
  const isLast = current >= total;
  const currentTitle = props.stepTitles[current - 1] ?? "";

  return (
    <section aria-label="Active work package"
      className="flex flex-col gap-2 border border-[var(--hill-rule)] bg-[var(--hill-bg-2)] p-3"
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.2em]">{props.packageTitle}</span>
        <span className="text-[10px] uppercase tracking-[0.2em] opacity-50">
          Step {current}/{total} · {currentTitle}
        </span>
      </div>
      <ArtifactList artifacts={props.artifacts} />
      <div className="flex items-center justify-end gap-2">
        <button type="button" className={btnGhost} onClick={() => props.onComplete()} disabled={props.busy}>
          Complete
        </button>
        <button type="button" className={btnPrimary} onClick={() => props.onAdvance(current)} disabled={props.busy || isLast}>
          Next step
        </button>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: 실행 → PASS**

### Task 3.7: terminal-tab 와이어

**Files:**
- Modify: `apps/web/components/tabs/terminal-tab.tsx` (또는 그 자식 — 호출처에 따라)

먼저 호출처 정확히 찾기:

```bash
grep -n "BriefingFormModal\|briefedAt" /workspaces/owngo/agent-desk/apps/web/components/tabs/terminal-tab.tsx
```

- [ ] **Step 1: state + fetch 추가**

terminal-tab (또는 그 자식 컴포넌트) 에:
- `const [packages, setPackages] = useState<PackageCatalogEntry[]>([]);`
- `const [activeWp, setActiveWp] = useState<WorkPackageDto | null>(null);`
- `const [artifacts, setArtifacts] = useState<WorkPackageArtifactDto[]>([]);`
- `const [modalOpen, setModalOpen] = useState(false);` (사용자가 명시적으로 dismiss 한 후엔 다시 열리지 않음)
- 첫 마운트: `gateway.packages.list()` 1 회
- 선택된 세션 변경 시: `gateway.workPackages.listForSession(sessionId)` → active 인스턴스 있으면 setActiveWp + artifacts 도 fetch
- modal trigger: 세션이 claude && activeWp == null && 사용자가 아직 dismiss 안 함 → `setModalOpen(true)`

- [ ] **Step 2: handler 구현**

- `handleStart(body)`: `gateway.workPackages.start(sessionId, body)` → setActiveWp(result.instance) → setModalOpen(false) → artifacts refetch
- `handleAdvance(expected)`: `gateway.workPackages.advance(activeWp.id, { expectedCurrentStep: expected })` → setActiveWp(result.instance) → artifacts refetch
- `handleComplete()`: `gateway.workPackages.complete(activeWp.id)` → setActiveWp(null) → modalOpen 재로직 (dismissed flag 유지)

- [ ] **Step 3: JSX 와이어**

기존 `<BriefingFormModal …/>` 자리에 `<WorkPackageModal …/>`. terminal-tab 의 적당한 위치 (session-list 옆/아래) 에 `{activeWp && <ActivePackageCard …/>}`.

- [ ] **Step 4: 회귀 + typecheck**

```bash
pnpm -F @agent-desk/web typecheck
pnpm -F @agent-desk/web test
```

Expected: PASS. 기존 terminal-tab 통합 테스트(있다면) 가 새 modal/card 와 호환되도록 fixture 갱신.

### Task 3.8: Phase 3 commit

- [ ] **Step 1: 커밋**

```bash
git -C /workspaces/owngo/agent-desk add apps/web

git -C /workspaces/owngo/agent-desk commit -m "$(cat <<'EOF'
feat(web): work-package modal (picker → form), ActiveCard + ArtifactList

- components/package-picker.tsx        : 카드 그리드. cli mismatch disabled. V1 패키지가 1 개여도 항상 노출
- components/package-start-form.tsx    : FieldSpec[] 렌더 + Back 버튼
- components/work-package-modal.tsx    : picker → form 2-step 컨테이너
- components/active-package-card.tsx   : Step N/M + Next/Complete + 산출물 슬롯
- components/artifact-list.tsx         : 산출물 링크 + drift 배지
- lib/gateway-client.ts                : packages.list, workPackages.{start,advance,complete,listForSession,listArtifacts}
- components/tabs/terminal-tab.tsx     : 트리거 룰 active==null 기반으로 갱신, modal/card 와이어

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 4 — Docs + 최종 검증

### Task 4.1: README

**Files:**
- Modify: `agent-desk/README.md`

- [ ] **Step 1: Features 한 줄 추가**

```markdown
- **Work packages** — 새 Claude 세션은 패키지(현재 "기획" 1 종)를 선택해 시작. brainstorming → writing-plans 단계가 UI 의 Next/Complete 로 진행되며 진행 상태는 DB 인스턴스로 기록됨. 진행 동안 워크스페이스의 `docs/superpowers/{specs,plans}/*.md` 변화를 sha256 으로 인덱싱.
```

기존 README 의 "brainstorming briefing 자동 주입" 문구는 work-package 흐름에 흡수되었음 — 해당 한 줄을 work-packages 설명으로 대체.

### Task 4.2: 전체 회귀

- [ ] **Step 1: 모두**

```bash
cd /workspaces/owngo/agent-desk && pnpm typecheck && pnpm test
```

Expected: 모든 패키지 PASS.

### Task 4.3: agent-desk 커밋 + owngo submodule bump

- [ ] **Step 1: README 커밋**

```bash
git -C /workspaces/owngo/agent-desk add README.md
git -C /workspaces/owngo/agent-desk commit -m "$(cat <<'EOF'
docs: README features 에 work packages 추가

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 2: owngo submodule pointer bump**

```bash
git -C /workspaces/owngo add agent-desk
git -C /workspaces/owngo commit -m "$(cat <<'EOF'
chore: agent-desk 서브모듈 갱신 — work packages V1 (planning)

agent-desk 에 work-package 개념 도입. picker 에서 명시 선택 → brainstorming
→ writing-plans 의 2-step 흐름. 게이트웨이가 step 전이 시점마다 워크스페이스의
docs/superpowers/{specs,plans} 를 스캔해 산출물 .md 의 sha256 인덱스를 보유 (drift 감지).
briefing-form-modal 및 brief endpoint 는 완전 삭제.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review

**Spec coverage:**
- §3.1 메타-스킬 경계 → V1 구현 안 함 (의도) ✓
- §3.2 정의 모듈 구조 → Task 1.1, 1.3, 1.4 ✓
- §3.3 폼 렌더링 → Task 3.2 ✓
- §3.4 planning 정의 → Task 1.3 ✓
- §3.5 briefing 제거 → Task 1.6, 1.9, 1.10 (모든 흔적) ✓
- §3.6 picker 상시 노출 → Task 3.3 + 3.4 (`packages.length === 1` 자동 skip 로직 없음) ✓
- §3.7 artifact discovery → Task 2.1, 2.2 (헬퍼) + 2.5/2.7/2.8 (핸들러 통합) ✓
- §4 API 5 endpoint → Task 2.4/2.5/2.7/2.8/2.9 ✓
- §5 DB 마이그레이션 (3 테이블 + DROP + enum) → Task 1.6, 1.11 ✓
- §6 동작 흐름 → Task 2.5/2.7/2.8 ✓
- §7 UI 새 컴포넌트 5 종 + 변경 → Phase 3 ✓
- §8 메타-스킬 placeholder → 변경 없음 ✓
- §9 테스트 전략 → Task 1.8, 2.x, 3.x ✓
- §10 V2+ → Plan 무관, spec 에 명기 ✓
- §11 마이그레이션/롤백 → Task 1.11 + spec ✓
- §12 보안 (scan path/symlink) → Task 2.1 의 lstat + isFile 가드 ✓

**Placeholder scan:** 모든 step 에 코드 또는 명령. "TBD" / "Similar to" 없음.

**Type consistency:**
- `currentStep` 1-based — 모든 위치 ✓
- `expectedCurrentStep` advance request body 키 — 클라이언트·서버 일치 ✓
- `cliRequirement: "claude" | "any"` — DTO + 정의 + picker 비교 일치 ✓
- `StepContext.packageInstanceId` -1 sentinel — types.ts (Task 1.1) + start (Task 2.5) 양쪽 명시 ✓
- artifact `driftDetected` — boolean (DTO) vs 0/1 (DB row), `artifactToDto` 가 변환 ✓
- `baselineJson` 컬럼명 — schema (Task 1.6) + 핸들러 (Task 2.5/2.7/2.8) 일치 ✓

이슈 없음.

---

## Execution Handoff

이 plan 은 **다음 세션** 에서 실행. 현재 세션은 spec + plan 작성만. 다음 세션 시작 시:

1. `superpowers:subagent-driven-development` (권장) 또는 `superpowers:executing-plans` 로 진입
2. Phase 1 → 2 → 3 → 4 순. Phase 끝마다 사용자 검토 + commit
3. 각 phase 안의 작은 task 들은 한 세션에 묶어 진행해도 좋음 (커밋만 phase 단위로 모음)
