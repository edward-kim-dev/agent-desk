# agent-desk × harness Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** RevFactory/harness 스킬을 agent-desk에 워크스페이스-단위 opt-in 으로 통합한다.

**Architecture:** vendor 서브모듈로 추가 → `workspaces.harnessEnabled` 컬럼이 진실의 근원. 활성화된 워크스페이스에만 `vendor/harness/skills/harness`를 `.claude/skills/`로 symlink 하고, claude CLI 세션 기동 시 `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` 환경변수를 주입한다. 기존 superpowers 자동 install 경로는 변경하지 않는다.

**Tech Stack:** TypeScript, Hono, drizzle-orm + better-sqlite3, vitest, React/Next.js, Zod, tmux

**Spec:** [specs/2026-05-27-agent-desk-harness-integration-design.md](../specs/2026-05-27-agent-desk-harness-integration-design.md)

---

## File Structure

**신규 파일:**
- `agent-desk/vendor/harness/` — submodule (전체 디렉토리)
- `apps/gateway/drizzle/0003_*.sql` — drizzle-kit 생성 마이그레이션
- `apps/gateway/drizzle/meta/0003_snapshot.json` — drizzle-kit 생성 스냅샷
- `apps/web/tests/workspace-form.test.tsx` — UI 테스트 (없을 경우)

**수정:**
- `.gitmodules` (agent-desk 루트) — vendor/harness submodule entry
- `packages/shared/src/db/schema.ts` — workspaces 테이블에 harnessEnabled 컬럼
- `packages/shared/src/api/workspace.ts` — Zod 요청/DTO 스키마 확장
- `apps/gateway/drizzle/meta/_journal.json` — drizzle-kit 자동 갱신
- `apps/gateway/src/skills/install.ts` — `ensureHarnessInstalled` 신규 함수
- `apps/gateway/src/tmux/commands.ts` — `NewSessionInput.env` 옵션 추가
- `apps/gateway/src/routes/workspaces.ts` — harness flag 처리, DTO 매퍼
- `apps/gateway/src/routes/sessions.ts` — claude+harness 조건에서 env 주입
- `apps/gateway/src/server.ts` — startup 시 harness 워크스페이스에 추가 install
- `apps/gateway/tests/skills-install.test.ts` — harness installer 케이스
- `apps/gateway/tests/tmux-commands.test.ts` — env injection 케이스
- `apps/gateway/tests/workspaces.test.ts` — harness flag 통합 테스트
- `apps/gateway/tests/sessions.test.ts` — claude+harness env 통합 테스트
- `apps/web/components/workspace-form.tsx` — harness 체크박스 + 안내

---

## Task 1: vendor/harness 서브모듈 추가

**Files:**
- Modify: `agent-desk/.gitmodules`
- Create: `agent-desk/vendor/harness/` (submodule)

- [ ] **Step 1: agent-desk 디렉토리로 이동해 submodule 추가**

```bash
cd /workspaces/owngo/agent-desk
git submodule add https://github.com/RevFactory/harness.git vendor/harness
```

Expected stdout: `Cloning into '.../vendor/harness'...` 완료 후 .gitmodules에 entry 추가됨.

- [ ] **Step 2: harness submodule 내용 확인 (sanity)**

```bash
ls /workspaces/owngo/agent-desk/vendor/harness/skills/harness/SKILL.md
```

Expected: 파일 존재. (없으면 submodule init 실패 — `git submodule update --init`)

- [ ] **Step 3: .gitmodules 내용 검증**

```bash
cat /workspaces/owngo/agent-desk/.gitmodules
```

Expected output:
```
[submodule "vendor/superpowers"]
	path = vendor/superpowers
	url = https://github.com/obra/superpowers.git
[submodule "vendor/harness"]
	path = vendor/harness
	url = https://github.com/RevFactory/harness.git
```

- [ ] **Step 4: Commit**

```bash
cd /workspaces/owngo/agent-desk
git add .gitmodules vendor/harness
git commit -m "chore(agent-desk): vendor RevFactory/harness 서브모듈 추가"
```

---

## Task 2: DB 스키마 — workspaces.harnessEnabled 컬럼

**Files:**
- Modify: `packages/shared/src/db/schema.ts:1-9`
- Create: `apps/gateway/drizzle/0003_*.sql` (drizzle-kit 자동 생성)
- Modify: `apps/gateway/drizzle/meta/_journal.json` (drizzle-kit 자동 갱신)

- [ ] **Step 1: 실패하는 테스트 작성 — 새 컬럼이 기본값으로 들어가는지 확인**

`apps/gateway/tests/workspaces.test.ts` 파일 끝에 추가 (기존 describe 블록 안에 추가하거나, 새 describe `harness flag`):

```typescript
it("워크스페이스 생성 시 harnessEnabled 기본값은 0(false)", async () => {
  const res = await app.request("/workspaces", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ name: "ws-no-harness", path: testWsPath() }),
  });
  expect(res.status).toBe(201);
  const ws = await res.json();
  expect(ws.harnessEnabled).toBe(false);
});
```

(`testWsPath()`, `authHeaders()`, `app` 헬퍼는 파일 상단 패턴 따름 — 기존 테스트 참고)

- [ ] **Step 2: 테스트 실행 — 실패 확인**

```bash
cd /workspaces/owngo/agent-desk
pnpm --filter @agent-desk/gateway test workspaces -- -t "harnessEnabled 기본값"
```

Expected: FAIL (`harnessEnabled` 필드 undefined)

- [ ] **Step 3: shared schema 에 컬럼 추가**

`packages/shared/src/db/schema.ts` workspaces 정의를 다음으로 교체:

```typescript
export const workspaces = sqliteTable("workspaces", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  path: text("path").notNull().unique(),
  name: text("name").notNull(),
  createdAt: integer("created_at").notNull(),
  deletedAt: integer("deleted_at"),
  harnessEnabled: integer("harness_enabled").notNull().default(0),
});
```

- [ ] **Step 4: drizzle-kit 마이그레이션 생성**

```bash
cd /workspaces/owngo/agent-desk
pnpm --filter @agent-desk/gateway exec drizzle-kit generate
```

Expected stdout: `0003_<random_name>.sql` 생성 알림. `apps/gateway/drizzle/0003_*.sql` 와 `meta/0003_snapshot.json` 생성, `meta/_journal.json` 항목 추가.

- [ ] **Step 5: 생성된 SQL 검증**

```bash
cat /workspaces/owngo/agent-desk/apps/gateway/drizzle/0003_*.sql
```

Expected 내용 (정확한 문장은 drizzle-kit 출력에 따라 다를 수 있으나 핵심은):
```sql
ALTER TABLE `workspaces` ADD `harness_enabled` integer DEFAULT 0 NOT NULL;
```

(drizzle-kit이 다른 형식으로 생성하면 그대로 둠. 작동만 검증)

- [ ] **Step 6: 테스트 실행 — 통과 확인**

```bash
cd /workspaces/owngo/agent-desk
pnpm --filter @agent-desk/gateway test workspaces -- -t "harnessEnabled 기본값"
```

Expected: 여전히 FAIL — DB 컬럼은 추가됐지만 라우트가 응답 DTO에 노출하지 않음. (다음 태스크에서 해결)

- [ ] **Step 7: Commit**

```bash
cd /workspaces/owngo/agent-desk
git add packages/shared/src/db/schema.ts apps/gateway/drizzle/
git commit -m "feat(agent-desk): workspaces 테이블에 harness_enabled 컬럼 추가"
```

---

## Task 3: Zod 스키마 + DTO 매퍼

**Files:**
- Modify: `packages/shared/src/api/workspace.ts`
- Modify: `apps/gateway/src/routes/workspaces.ts:1-100` (DTO 매퍼 추가, 응답 변환)

- [ ] **Step 1: workspace.ts Zod 스키마 갱신**

`packages/shared/src/api/workspace.ts` 전체를 다음으로 교체:

```typescript
import { z } from "zod";

export const createWorkspaceRequest = z.object({
  name: z.string().min(1).max(120),
  path: z.string().startsWith("/"),
  harnessEnabled: z.boolean().optional().default(false),
});
export type CreateWorkspaceRequest = z.infer<typeof createWorkspaceRequest>;

export const workspaceDto = z.object({
  id: z.number().int(),
  name: z.string(),
  path: z.string(),
  createdAt: z.number().int(),
  deletedAt: z.number().int().nullable(),
  harnessEnabled: z.boolean(),
});
export type WorkspaceDto = z.infer<typeof workspaceDto>;
```

- [ ] **Step 2: shared 패키지 빌드 검증**

```bash
cd /workspaces/owngo/agent-desk
pnpm --filter @agent-desk/shared build
```

Expected: TypeScript 오류 없이 dist 갱신.

- [ ] **Step 3: workspaces.ts 에 toWorkspaceDto 매퍼 추가**

`apps/gateway/src/routes/workspaces.ts` 상단(import 다음, `export function workspaceRoutes` 직전)에 추가:

```typescript
type WorkspaceRow = typeof workspaces.$inferSelect;

function toWorkspaceDto(w: WorkspaceRow) {
  return {
    id: w.id,
    name: w.name,
    path: w.path,
    createdAt: w.createdAt,
    deletedAt: w.deletedAt,
    harnessEnabled: w.harnessEnabled === 1,
  };
}
```

- [ ] **Step 4: 모든 응답 지점에서 매퍼 사용**

`apps/gateway/src/routes/workspaces.ts` 안에서 워크스페이스 row를 반환하는 곳들을 변환:

- `r.get("/")` 의 `return c.json({ workspaces: rows });` →
  ```typescript
  return c.json({ workspaces: rows.map(toWorkspaceDto) });
  ```
- `r.post("/")` 의 `return c.json(inserted[0], 201);` →
  ```typescript
  return c.json(toWorkspaceDto(inserted[0]), 201);
  ```
- `r.post("/:id/restore")` 의 `return c.json(restored[0]);` →
  ```typescript
  return c.json(toWorkspaceDto(restored[0]));
  ```
- `r.post("/:id/restore")` 의 `if (ws.deletedAt == null) return c.json(ws);` →
  ```typescript
  if (ws.deletedAt == null) return c.json(toWorkspaceDto(ws));
  ```

- [ ] **Step 5: POST 요청 핸들러에서 harnessEnabled 처리**

`r.post("/")` 안에서 db.insert 부분 수정. 기존:

```typescript
const inserted = db
  .insert(workspaces)
  .values({
    name: parsed.data.name,
    path: parsed.data.path,
    createdAt: Date.now(),
  })
  .returning()
  .all();
```

다음으로 교체:

```typescript
const inserted = db
  .insert(workspaces)
  .values({
    name: parsed.data.name,
    path: parsed.data.path,
    createdAt: Date.now(),
    harnessEnabled: parsed.data.harnessEnabled ? 1 : 0,
  })
  .returning()
  .all();
```

- [ ] **Step 6: 테스트 재실행 — Step 2의 테스트가 통과**

```bash
cd /workspaces/owngo/agent-desk
pnpm --filter @agent-desk/gateway test workspaces -- -t "harnessEnabled 기본값"
```

Expected: PASS

- [ ] **Step 7: 실패하는 테스트 추가 — harnessEnabled=true 케이스**

`apps/gateway/tests/workspaces.test.ts` 에 추가:

```typescript
it("harnessEnabled=true 로 워크스페이스 생성 시 DTO 에 true 반영", async () => {
  const res = await app.request("/workspaces", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      name: "ws-with-harness",
      path: testWsPath(),
      harnessEnabled: true,
    }),
  });
  expect(res.status).toBe(201);
  const ws = await res.json();
  expect(ws.harnessEnabled).toBe(true);
});
```

- [ ] **Step 8: 테스트 실행 — 통과 확인**

```bash
cd /workspaces/owngo/agent-desk
pnpm --filter @agent-desk/gateway test workspaces
```

Expected: 모든 workspaces 테스트 PASS.

- [ ] **Step 9: Commit**

```bash
cd /workspaces/owngo/agent-desk
git add packages/shared/src/api/workspace.ts apps/gateway/src/routes/workspaces.ts apps/gateway/tests/workspaces.test.ts
git commit -m "feat(agent-desk): workspace DTO 에 harnessEnabled 필드 노출"
```

---

## Task 4: ensureHarnessInstalled 함수 + 테스트

**Files:**
- Modify: `apps/gateway/src/skills/install.ts` (함수 추가)
- Modify: `apps/gateway/tests/skills-install.test.ts` (테스트 추가)

- [ ] **Step 1: 실패하는 테스트 작성**

`apps/gateway/tests/skills-install.test.ts` 파일 끝에 추가:

```typescript
import { ensureHarnessInstalled } from "../src/skills/install";

describe("ensureHarnessInstalled", () => {
  let vendorHarnessDir: string;

  beforeEach(async () => {
    // vendor/harness/skills/harness 구조 모사
    vendorHarnessDir = path.join(root, "vendor-harness", "skills", "harness");
    await fs.mkdir(vendorHarnessDir, { recursive: true });
    await fs.writeFile(
      path.join(vendorHarnessDir, "SKILL.md"),
      "---\nname: harness\n---\nhi\n",
    );
  });

  it("vendor/harness/skills/harness 를 워크스페이스 .claude/skills/harness 로 symlink", async () => {
    const r = await ensureHarnessInstalled({
      workspacePath,
      vendorHarnessSkillDir: vendorHarnessDir,
    });
    expect(r.status).toBe("installed");

    const linkPath = path.join(workspacePath, ".claude", "skills", "harness");
    const stat = await fs.lstat(linkPath);
    expect(stat.isSymbolicLink()).toBe(true);
    const content = await fs.readFile(
      path.join(linkPath, "SKILL.md"),
      "utf8",
    );
    expect(content).toContain("name: harness");
  });

  it("vendor 디렉토리가 없으면 missing_source", async () => {
    const r = await ensureHarnessInstalled({
      workspacePath,
      vendorHarnessSkillDir: path.join(root, "no-such-harness"),
    });
    expect(r.status).toBe("missing_source");
  });
});
```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

```bash
cd /workspaces/owngo/agent-desk
pnpm --filter @agent-desk/gateway test skills-install
```

Expected: `ensureHarnessInstalled is not a function` 또는 import 에러로 FAIL.

- [ ] **Step 3: install.ts 에 함수 추가**

`apps/gateway/src/skills/install.ts` 파일 끝에 추가:

```typescript
function defaultVendorHarnessSkillDir(): string {
  const env = process.env.AGENT_DESK_HARNESS_SKILL_DIR;
  if (env) return env;
  const here = fileURLToPath(import.meta.url);
  const gatewayDir = path.resolve(path.dirname(here), "..", "..");
  const agentDeskRoot = path.resolve(gatewayDir, "..", "..");
  return path.join(agentDeskRoot, "vendor", "harness", "skills", "harness");
}

export interface EnsureHarnessOptions {
  workspacePath: string;
  /** Absolute path to vendor/harness/skills/harness (the skill directory itself). */
  vendorHarnessSkillDir?: string;
}

/**
 * Harness 단일 스킬을 워크스페이스의 .claude/skills/harness 로 symlink.
 * 일반 `ensureSkillInstalled` 와 동일한 상태 머신을 사용하지만 vendor 디렉토리
 * 모양이 다르다 (vendor/harness/skills/harness 가 곧 스킬 디렉토리).
 */
export async function ensureHarnessInstalled(
  opts: EnsureHarnessOptions,
): Promise<EnsureSkillResult> {
  const skillDir = opts.vendorHarnessSkillDir ?? defaultVendorHarnessSkillDir();
  // ensureSkillInstalled 는 vendorSkillsDir/<name> 형태로 결합하므로,
  // skillDir 의 부모를 vendorSkillsDir 로 넘기고 name 은 "harness".
  const parentDir = path.dirname(skillDir);
  const skillName = path.basename(skillDir);
  return ensureSkillInstalled({
    workspacePath: opts.workspacePath,
    skillName,
    vendorSkillsDir: parentDir,
  });
}
```

- [ ] **Step 4: 테스트 실행 — 통과 확인**

```bash
cd /workspaces/owngo/agent-desk
pnpm --filter @agent-desk/gateway test skills-install
```

Expected: 모든 케이스 PASS.

- [ ] **Step 5: Commit**

```bash
cd /workspaces/owngo/agent-desk
git add apps/gateway/src/skills/install.ts apps/gateway/tests/skills-install.test.ts
git commit -m "feat(agent-desk): ensureHarnessInstalled — harness 단일 스킬 symlink"
```

---

## Task 5: 워크스페이스 생성 시 harness 조건부 install

**Files:**
- Modify: `apps/gateway/src/routes/workspaces.ts:1-80`

- [ ] **Step 1: 실패하는 테스트 작성**

`apps/gateway/tests/workspaces.test.ts` 에 추가:

```typescript
it("harnessEnabled=true 로 생성하면 .claude/skills/harness symlink 가 생긴다", async () => {
  // ensureHarnessFn 을 fake 로 주입할 수 있도록 server option 확장 후 검증.
  // 또는 실파일 시스템 fixture 로 검증 — 기존 ensureAllSkills 테스트 패턴 따름.
  const fakeHarness = vi.fn(async () => ({
    status: "installed" as const,
    linkPath: "/fake/.claude/skills/harness",
    sourcePath: "/fake/vendor/harness/skills/harness",
  }));
  const localApp = await createTestApp({ ensureHarnessFn: fakeHarness });

  const res = await localApp.request("/workspaces", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      name: "harness-ws",
      path: testWsPath(),
      harnessEnabled: true,
    }),
  });
  expect(res.status).toBe(201);
  expect(fakeHarness).toHaveBeenCalledOnce();
  expect(fakeHarness).toHaveBeenCalledWith(
    expect.objectContaining({ workspacePath: expect.stringContaining("/") }),
  );
});

it("harnessEnabled=false (기본) 면 harness installer 가 호출되지 않는다", async () => {
  const fakeHarness = vi.fn();
  const localApp = await createTestApp({ ensureHarnessFn: fakeHarness });

  await localApp.request("/workspaces", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ name: "plain-ws", path: testWsPath() }),
  });
  expect(fakeHarness).not.toHaveBeenCalled();
});
```

(`createTestApp` 헬퍼는 기존 테스트에서 사용 중인 패턴 — 신규 옵션 `ensureHarnessFn` 노출 필요)

- [ ] **Step 2: 테스트 실행 — 실패 확인**

```bash
cd /workspaces/owngo/agent-desk
pnpm --filter @agent-desk/gateway test workspaces -- -t "harness"
```

Expected: FAIL — `ensureHarnessFn` 옵션이 존재하지 않거나, install 호출이 일어나지 않음.

- [ ] **Step 3: workspaceRoutes 옵션에 ensureHarnessFn 추가**

`apps/gateway/src/routes/workspaces.ts` 상단 import:

```typescript
import {
  ensureAllSkillsInstalled,
  ensureHarnessInstalled,
} from "../skills/install";
```

`workspaceRoutes` 옵션 타입:

```typescript
export function workspaceRoutes(opts: {
  db: DbHandle["db"];
  tmux: TmuxClient;
  ensureAllSkillsFn?: typeof ensureAllSkillsInstalled;
  ensureHarnessFn?: typeof ensureHarnessInstalled;
}): Hono {
  const { db, tmux } = opts;
  const ensureAllSkills = opts.ensureAllSkillsFn ?? ensureAllSkillsInstalled;
  const ensureHarness = opts.ensureHarnessFn ?? ensureHarnessInstalled;
  // ...
}
```

- [ ] **Step 4: POST 핸들러에서 harnessEnabled 면 호출**

`r.post("/")` 안의 `await ensureAllSkills(...)` 호출 직후에 추가:

```typescript
if (parsed.data.harnessEnabled) {
  try {
    await ensureHarness({ workspacePath: inserted[0].path });
  } catch (err) {
    console.warn("[workspaces] harness install failed:", err);
  }
}
```

- [ ] **Step 5: server.ts 에서 옵션 전달**

`apps/gateway/src/server.ts` 의 `workspaceRoutes(...)` 호출 인자에 추가:

```typescript
api.route(
  "/workspaces",
  workspaceRoutes({
    db: opts.db.db,
    tmux,
    ensureAllSkillsFn: ensureAllSkills,
    ensureHarnessFn: opts.ensureHarnessFn,
  }),
);
```

`CreateServerOptions` 에 옵션 타입 추가:

```typescript
import {
  ensureAllSkillsInstalled,
  ensureHarnessInstalled,
  type ensureSkillInstalled,
} from "./skills/install";

// CreateServerOptions 인터페이스 내부에 추가:
ensureHarnessFn?: typeof ensureHarnessInstalled;
```

- [ ] **Step 6: 테스트 실행**

```bash
cd /workspaces/owngo/agent-desk
pnpm --filter @agent-desk/gateway test workspaces
```

Expected: 모든 케이스 PASS.

- [ ] **Step 7: Commit**

```bash
cd /workspaces/owngo/agent-desk
git add apps/gateway/src/routes/workspaces.ts apps/gateway/src/server.ts apps/gateway/tests/workspaces.test.ts
git commit -m "feat(agent-desk): harnessEnabled 워크스페이스 생성 시 harness 스킬 자동 install"
```

---

## Task 6: tmux newSession 에 env 옵션 추가

**Files:**
- Modify: `apps/gateway/src/tmux/commands.ts:30-90`
- Modify: `apps/gateway/tests/tmux-commands.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`apps/gateway/tests/tmux-commands.test.ts` 에 새 케이스 추가 (기존 newSession 테스트 옆):

```typescript
it("newSession 의 env 옵션이 명령에 KEY=VAL 형태로 주입된다", async () => {
  const calls: Array<{ cmd: string; args: string[] }> = [];
  const exec: ExecLike = async (cmd, args) => {
    calls.push({ cmd, args });
    return { stdout: "", stderr: "" };
  };
  const client = createTmuxClient({ exec });
  await client.newSession({
    name: "test-sess",
    cwd: "/tmp",
    command: "claude --foo",
    env: { CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: "1" },
  });
  const newSessCall = calls.find((c) =>
    c.args.includes("new-session"),
  );
  expect(newSessCall).toBeDefined();
  // 마지막 인자(wrapped command)에 env KEY=VAL 이 들어 있어야 한다.
  const wrapped = newSessCall!.args[newSessCall!.args.length - 1];
  expect(wrapped).toContain("CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1");
});

it("env 옵션이 없으면 환경변수 prefix 가 추가되지 않는다", async () => {
  const calls: Array<{ cmd: string; args: string[] }> = [];
  const exec: ExecLike = async (cmd, args) => {
    calls.push({ cmd, args });
    return { stdout: "", stderr: "" };
  };
  const client = createTmuxClient({ exec });
  await client.newSession({
    name: "test-sess",
    cwd: "/tmp",
    command: "claude --foo",
  });
  const newSessCall = calls.find((c) =>
    c.args.includes("new-session"),
  );
  const wrapped = newSessCall!.args[newSessCall!.args.length - 1];
  expect(wrapped).not.toMatch(/[A-Z_]+=/);
});
```

(`ExecLike` import 가 필요하면 파일 상단에 추가)

- [ ] **Step 2: 테스트 실행 — 실패 확인**

```bash
cd /workspaces/owngo/agent-desk
pnpm --filter @agent-desk/gateway test tmux-commands
```

Expected: FAIL — `env` 옵션이 타입에 없거나, 무시되어 wrapped 에 KEY=VAL 없음.

- [ ] **Step 3: NewSessionInput 타입 확장**

`apps/gateway/src/tmux/commands.ts` 의 `NewSessionInput`:

```typescript
export interface NewSessionInput {
  name: string;
  cwd: string;
  command: string;
  /** Extra env vars to prepend to the wrapped command (KEY=VAL form). */
  env?: Record<string, string>;
}
```

- [ ] **Step 4: 헬퍼 함수 추가 + newSession 구현 수정**

`apps/gateway/src/tmux/commands.ts` 상단(`envWithoutDebug` 정의 근처)에 추가:

```typescript
function shellQuoteValue(v: string): string {
  if (/^[A-Za-z0-9_.\/=:+-]+$/.test(v)) return v;
  return `'${v.replace(/'/g, `'\\''`)}'`;
}

function envPrefix(env: Record<string, string> | undefined): string {
  if (!env) return "";
  const pairs: string[] = [];
  for (const [k, v] of Object.entries(env)) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(k)) {
      throw new Error(`invalid env key: ${k}`);
    }
    pairs.push(`${k}=${shellQuoteValue(v)}`);
  }
  return pairs.length ? pairs.join(" ") + " " : "";
}
```

`newSession` 구현 안의 `wrapped` 라인 교체. 기존:

```typescript
const wrapped = `env ${unsetPrefix} ${input.command}; ec=$?; printf '\\n[CLI exited (%d). Press Ctrl-D to close the session.]\\n' "$ec"; exec "${'$'}{SHELL:-/bin/bash}"`;
```

새 코드:

```typescript
const setPrefix = envPrefix(input.env);
const wrapped = `env ${unsetPrefix} ${setPrefix}${input.command}; ec=$?; printf '\\n[CLI exited (%d). Press Ctrl-D to close the session.]\\n' "$ec"; exec "${'$'}{SHELL:-/bin/bash}"`;
```

- [ ] **Step 5: 테스트 실행**

```bash
cd /workspaces/owngo/agent-desk
pnpm --filter @agent-desk/gateway test tmux-commands
```

Expected: 모든 케이스 PASS.

- [ ] **Step 6: Commit**

```bash
cd /workspaces/owngo/agent-desk
git add apps/gateway/src/tmux/commands.ts apps/gateway/tests/tmux-commands.test.ts
git commit -m "feat(agent-desk): tmux newSession 에 env 옵션 추가"
```

---

## Task 7: session 생성 시 claude+harness 워크스페이스에 env 주입

**Files:**
- Modify: `apps/gateway/src/routes/sessions.ts:79-100`
- Modify: `apps/gateway/tests/sessions.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`apps/gateway/tests/sessions.test.ts` 에 추가 (mock tmux 사용 패턴은 기존 테스트 참조):

```typescript
it("harnessEnabled 워크스페이스에서 claude 세션 생성 시 AGENT_TEAMS env 가 newSession 에 전달된다", async () => {
  const newSessionCalls: Array<{ env?: Record<string, string> }> = [];
  const fakeTmux = makeFakeTmux({
    newSession: async (input) => {
      newSessionCalls.push({ env: input.env });
    },
  });
  const app = await createTestApp({ tmux: fakeTmux });

  // harness 활성 워크스페이스 생성
  const wsRes = await app.request("/workspaces", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      name: "ws-harness",
      path: testWsPath(),
      harnessEnabled: true,
    }),
  });
  const ws = await wsRes.json();

  // claude 세션 생성
  const sRes = await app.request("/sessions", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ workspaceId: ws.id, cli: "claude", args: [] }),
  });
  expect(sRes.status).toBe(201);
  expect(newSessionCalls[0].env).toMatchObject({
    CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: "1",
  });
});

it("harnessEnabled=false 워크스페이스의 claude 세션엔 env 가 주입되지 않는다", async () => {
  const newSessionCalls: Array<{ env?: Record<string, string> }> = [];
  const fakeTmux = makeFakeTmux({
    newSession: async (input) => {
      newSessionCalls.push({ env: input.env });
    },
  });
  const app = await createTestApp({ tmux: fakeTmux });

  const wsRes = await app.request("/workspaces", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ name: "ws-plain", path: testWsPath() }),
  });
  const ws = await wsRes.json();

  await app.request("/sessions", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ workspaceId: ws.id, cli: "claude", args: [] }),
  });
  expect(newSessionCalls[0].env).toBeUndefined();
});

it("harnessEnabled 워크스페이스라도 cli!=claude 면 env 주입 안 함", async () => {
  const newSessionCalls: Array<{ env?: Record<string, string> }> = [];
  const fakeTmux = makeFakeTmux({
    newSession: async (input) => {
      newSessionCalls.push({ env: input.env });
    },
  });
  const app = await createTestApp({ tmux: fakeTmux });

  const wsRes = await app.request("/workspaces", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      name: "ws-harness-codex",
      path: testWsPath(),
      harnessEnabled: true,
    }),
  });
  const ws = await wsRes.json();

  await app.request("/sessions", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ workspaceId: ws.id, cli: "codex", args: [] }),
  });
  expect(newSessionCalls[0].env).toBeUndefined();
});
```

(`makeFakeTmux` 헬퍼는 기존 테스트 헬퍼 — 없으면 인라인으로 TmuxClient 객체를 mock)

- [ ] **Step 2: 테스트 실행 — 실패 확인**

```bash
cd /workspaces/owngo/agent-desk
pnpm --filter @agent-desk/gateway test sessions -- -t "harness"
```

Expected: 첫 케이스 FAIL — `env` undefined.

- [ ] **Step 3: sessions.ts 의 POST 핸들러 수정**

`apps/gateway/src/routes/sessions.ts` 의 `r.post("/")` 안, `await opts.tmux.newSession(...)` 직전:

```typescript
const sessionEnv: Record<string, string> = {};
if (cliEntry.name === "claude" && ws.harnessEnabled === 1) {
  sessionEnv.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS = "1";
}

await opts.tmux.newSession({
  name: tmuxName,
  cwd: ws.path,
  command,
  env: Object.keys(sessionEnv).length > 0 ? sessionEnv : undefined,
});
```

- [ ] **Step 4: 테스트 실행**

```bash
cd /workspaces/owngo/agent-desk
pnpm --filter @agent-desk/gateway test sessions
```

Expected: 모든 케이스 PASS.

- [ ] **Step 5: Commit**

```bash
cd /workspaces/owngo/agent-desk
git add apps/gateway/src/routes/sessions.ts apps/gateway/tests/sessions.test.ts
git commit -m "feat(agent-desk): harness 워크스페이스 claude 세션에 AGENT_TEAMS env 주입"
```

---

## Task 8: Server startup 시 harness 워크스페이스에 추가 install

**Files:**
- Modify: `apps/gateway/src/server.ts:64-82`

- [ ] **Step 1: 실패하는 테스트 작성**

`apps/gateway/tests/server.test.ts` 에 추가 (또는 startup install 관련 기존 describe 안):

```typescript
it("기동 시 harnessEnabled 워크스페이스에는 harness 도 install 한다", async () => {
  // setup: db 에 harnessEnabled=1 워크스페이스 한 개, =0 한 개 미리 insert
  const dbHandle = await makeTestDb();
  dbHandle.db.insert(workspacesTable).values([
    {
      name: "h",
      path: "/tmp/h",
      createdAt: Date.now(),
      harnessEnabled: 1,
    },
    {
      name: "n",
      path: "/tmp/n",
      createdAt: Date.now(),
      harnessEnabled: 0,
    },
  ]).run();

  const allCalls: string[] = [];
  const harnessCalls: string[] = [];
  const fakeAll = vi.fn(async ({ workspacePath }) => {
    allCalls.push(workspacePath);
    return { results: [] };
  });
  const fakeHarness = vi.fn(async ({ workspacePath }) => {
    harnessCalls.push(workspacePath);
    return { status: "installed" as const, linkPath: "", sourcePath: "" };
  });

  const server = await createServer({
    db: dbHandle,
    token: "t",
    cli: [],
    bind: "127.0.0.1",
    port: 0,
    ensureAllSkillsFn: fakeAll,
    ensureHarnessFn: fakeHarness,
  });
  await new Promise((r) => setTimeout(r, 50)); // background dispatch flush
  await server.close();

  expect(allCalls.sort()).toEqual(["/tmp/h", "/tmp/n"]);
  expect(harnessCalls).toEqual(["/tmp/h"]);
});
```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

```bash
cd /workspaces/owngo/agent-desk
pnpm --filter @agent-desk/gateway test server -- -t "harness"
```

Expected: FAIL — `harnessCalls` 빈 배열.

- [ ] **Step 3: server.ts startup 로직 수정**

`apps/gateway/src/server.ts` 의 startup 블록 ( `if (opts.installSkillsOnStartup !== false)` 안의 IIFE) 전체를 다음으로 교체:

```typescript
if (opts.installSkillsOnStartup !== false) {
  const ensureHarness = opts.ensureHarnessFn ?? ensureHarnessInstalled;
  void (async () => {
    const rows = opts.db.db
      .select({
        path: workspacesTable.path,
        harnessEnabled: workspacesTable.harnessEnabled,
      })
      .from(workspacesTable)
      .where(isNull(workspacesTable.deletedAt))
      .all();
    for (const ws of rows) {
      try {
        await ensureAllSkills({ workspacePath: ws.path });
      } catch (err) {
        console.warn("[startup] skill install failed for", ws.path, err);
      }
      if (ws.harnessEnabled === 1) {
        try {
          await ensureHarness({ workspacePath: ws.path });
        } catch (err) {
          console.warn("[startup] harness install failed for", ws.path, err);
        }
      }
    }
  })();
}
```

- [ ] **Step 4: import 보강**

`apps/gateway/src/server.ts` import 블록을 수정:

```typescript
import {
  ensureAllSkillsInstalled,
  ensureHarnessInstalled,
  type ensureSkillInstalled,
} from "./skills/install";
```

- [ ] **Step 5: 테스트 실행**

```bash
cd /workspaces/owngo/agent-desk
pnpm --filter @agent-desk/gateway test server
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
cd /workspaces/owngo/agent-desk
git add apps/gateway/src/server.ts apps/gateway/tests/server.test.ts
git commit -m "feat(agent-desk): 기동 시 harnessEnabled 워크스페이스에 harness 자동 install"
```

---

## Task 9: WorkspaceForm UI — 체크박스 + 안내 문구

**Files:**
- Modify: `apps/web/components/workspace-form.tsx`
- Modify (or create): `apps/web/tests/workspace-form.test.tsx`

- [ ] **Step 1: 실패하는 컴포넌트 테스트 작성**

`apps/web/tests/workspace-form.test.tsx` 가 없으면 신규 생성. 있으면 케이스 추가:

```typescript
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { WorkspaceForm } from "@/components/workspace-form";

// gateway-client 모킹
vi.mock("@/lib/gateway-client", () => ({
  gateway: {
    workspaces: {
      create: vi.fn(async () => ({})),
    },
  },
}));

describe("WorkspaceForm — harness 옵션", () => {
  it("기본 상태에서 harness 체크박스는 unchecked", () => {
    render(<WorkspaceForm onCreated={() => {}} />);
    const cb = screen.getByLabelText(/harness/i) as HTMLInputElement;
    expect(cb.checked).toBe(false);
  });

  it("Claude Max 안내 문구가 보인다", () => {
    render(<WorkspaceForm onCreated={() => {}} />);
    expect(screen.getByText(/Claude Max/)).toBeInTheDocument();
  });

  it("체크박스 토글 시 create 페이로드에 harnessEnabled=true 포함", async () => {
    const { gateway } = await import("@/lib/gateway-client");
    render(<WorkspaceForm onCreated={() => {}} />);
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "ws" },
    });
    fireEvent.change(screen.getByLabelText("Path"), {
      target: { value: "/tmp/ws" },
    });
    fireEvent.click(screen.getByLabelText(/harness/i));
    fireEvent.click(screen.getByRole("button", { name: /Add workspace/i }));
    await new Promise((r) => setTimeout(r, 0));
    expect(gateway.workspaces.create).toHaveBeenCalledWith({
      name: "ws",
      path: "/tmp/ws",
      harnessEnabled: true,
    });
  });
});
```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

```bash
cd /workspaces/owngo/agent-desk
pnpm --filter @agent-desk/web test workspace-form
```

Expected: FAIL (체크박스/안내 문구 없음).

- [ ] **Step 3: workspace-form.tsx 컴포넌트 수정**

`apps/web/components/workspace-form.tsx` 전체를 다음으로 교체:

```typescript
"use client";
import { useId, useState } from "react";
import { gateway } from "@/lib/gateway-client";
import { Field, fieldControl } from "./ui/field";
import { btnPrimary } from "./ui/button-classes";

export interface SoftDeleteConflict {
  id: number;
  name: string;
}

export function WorkspaceForm(props: {
  onCreated: () => void;
  onConflict?: (hint: SoftDeleteConflict) => void;
}) {
  const nameId = useId();
  const pathId = useId();
  const harnessId = useId();
  const [name, setName] = useState("");
  const [path, setPath] = useState("");
  const [harnessEnabled, setHarnessEnabled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const canSubmit = name.trim() !== "" && path.trim().startsWith("/") && !busy;

  return (
    <form
      className="flex flex-col gap-4 border border-[var(--hill-rule)] p-5"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!canSubmit) return;
        setError(null);
        setBusy(true);
        try {
          await gateway.workspaces.create({
            name: name.trim(),
            path: path.trim(),
            harnessEnabled,
          });
          setName("");
          setPath("");
          setHarnessEnabled(false);
          props.onCreated();
        } catch (err) {
          const msg = (err as Error).message;
          const m = msg.match(/^409\s+(.*)$/);
          if (m && props.onConflict) {
            try {
              const body = JSON.parse(m[1]) as {
                error?: string;
                id?: number;
                name?: string;
              };
              if (
                body.error === "workspace_soft_deleted" &&
                typeof body.id === "number" &&
                typeof body.name === "string"
              ) {
                props.onConflict({ id: body.id, name: body.name });
                setBusy(false);
                return;
              }
            } catch {
              /* fall through */
            }
          }
          setError(msg);
        } finally {
          setBusy(false);
        }
      }}
    >
      <Field htmlFor={nameId} label="Name">
        <input
          id={nameId}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="my-project"
          className={fieldControl}
        />
      </Field>
      <Field
        htmlFor={pathId}
        label="Path"
        hint="반드시 절대 경로(`/` 시작). 디렉터리가 존재해야 wiki/세션이 동작합니다."
      >
        <input
          id={pathId}
          value={path}
          onChange={(e) => setPath(e.target.value)}
          placeholder="/workspaces/my-project"
          className={`${fieldControl} font-mono text-[12.5px]`}
        />
      </Field>
      <div className="flex flex-col gap-1">
        <label className="flex items-center gap-2 text-[13px]" htmlFor={harnessId}>
          <input
            id={harnessId}
            type="checkbox"
            checked={harnessEnabled}
            onChange={(e) => setHarnessEnabled(e.target.checked)}
          />
          <span>harness 활성화 (Claude Code 전용)</span>
        </label>
        <p className="ml-6 text-[12px] text-[var(--hill-muted)]">
          Claude Max 구독 + Agent Teams 실험 기능이 필요합니다.
          codex / gemini 세션에서는 동작하지 않습니다.
        </p>
      </div>
      <div className="flex items-center justify-end gap-2">
        {error && (
          <div role="alert" className="mr-auto text-[12px] text-red-700">
            {error}
          </div>
        )}
        <button type="submit" disabled={!canSubmit} className={btnPrimary}>
          {busy ? "…" : "Add workspace"}
        </button>
      </div>
    </form>
  );
}
```

- [ ] **Step 4: 테스트 실행**

```bash
cd /workspaces/owngo/agent-desk
pnpm --filter @agent-desk/web test workspace-form
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /workspaces/owngo/agent-desk
git add apps/web/components/workspace-form.tsx apps/web/tests/workspace-form.test.tsx
git commit -m "feat(web): WorkspaceForm 에 harness 활성화 체크박스 + Claude Max 안내 추가"
```

---

## Task 10: 전체 회귀 테스트 + 빌드 검증

**Files:** 없음 (검증만)

- [ ] **Step 1: 모든 gateway 테스트 실행**

```bash
cd /workspaces/owngo/agent-desk
pnpm --filter @agent-desk/gateway test
```

Expected: 전부 PASS.

- [ ] **Step 2: 모든 web 테스트 실행**

```bash
cd /workspaces/owngo/agent-desk
pnpm --filter @agent-desk/web test
```

Expected: 전부 PASS.

- [ ] **Step 3: shared 패키지 빌드**

```bash
cd /workspaces/owngo/agent-desk
pnpm --filter @agent-desk/shared build
```

Expected: 오류 없음.

- [ ] **Step 4: 전체 타입체크**

```bash
cd /workspaces/owngo/agent-desk
pnpm -r exec tsc --noEmit
```

Expected: 오류 없음.

- [ ] **Step 5: 추가 커밋 없음 — 검증만**

회귀 발견 시 해당 태스크로 돌아가 fix → commit. 통과하면 Task 11로.

---

## Task 11: 수동 스모크 테스트

**Files:** 없음 (실제 실행 검증)

- [ ] **Step 1: 게이트웨이 + 웹 기동**

```bash
cd /workspaces/owngo/agent-desk
pnpm dev
```

Expected: 게이트웨이 + 웹 UI 정상 기동 (기존 동작 유지).

- [ ] **Step 2: 브라우저에서 워크스페이스 생성**

웹 UI에서 "Add workspace" — name/path 입력, "harness 활성화" 체크박스 ON. Submit.

Expected:
- 응답 201
- DB 의 workspaces 에 `harness_enabled=1` row 추가
- `<workspace>/.claude/skills/harness/SKILL.md` 가 `vendor/harness/skills/harness/SKILL.md` 로 symlink

검증:
```bash
ls -la /<workspace path>/.claude/skills/harness
readlink /<workspace path>/.claude/skills/harness
```

- [ ] **Step 3: claude 세션 띄우고 env 확인**

웹 UI에서 해당 워크스페이스에 claude 세션 생성. 터미널 attach 후 첫 프롬프트에서:

```
> echo $CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS
```

Expected: `1` 출력. (claude CLI 가 이 env를 받고 시작됨)

- [ ] **Step 4: /harness 슬래시 동작 확인**

같은 claude 세션에서:

```
> /harness
```

Expected: harness 스킬이 로드되어 응답함 (Claude Max 구독 + Agent Teams 권한이 실제로 있어야 본문 동작 — 구독 없으면 Anthropic API 측에서 에러 메시지).

- [ ] **Step 5: 다른 워크스페이스에서는 env 없음 확인**

`harnessEnabled=false` 워크스페이스에서 claude 세션 → 같은 echo 명령:

Expected: 빈 줄 출력 (env 미설정).

- [ ] **Step 6: 검증 결과 기록 후 README 업데이트**

`agent-desk/README.md` 의 features 섹션에 한 줄 추가:

```markdown
- (Opt-in) RevFactory/harness 통합 — 워크스페이스 생성 시 활성화 시 multi-agent 팀 생성 스킬 자동 install + Claude Max env 주입
```

- [ ] **Step 7: 최종 Commit**

```bash
cd /workspaces/owngo/agent-desk
git add README.md
git commit -m "docs(agent-desk): harness 통합 기능 README 반영"
```

---

## Self-Review 노트

**Spec coverage check:**
- ✓ 3.1 워크스페이스 단위 opt-in → Task 3, 5, 9
- ✓ 3.2 vendor 구조 → Task 1
- ✓ 3.3 Installer 분리 → Task 4
- ✓ 3.4 Env 주입 메커니즘 → Task 6
- ✓ 3.5 세션 라우트 결정 로직 → Task 7
- ✓ 3.6 UI → Task 9
- ✓ 4 API 변경 → Task 3
- ✓ 5 DB 마이그레이션 → Task 2
- ✓ 6 테스트 전략 — 모든 영역 커버
- ✓ 8 마이그레이션/롤백 — 컬럼 default 0 보존

**미커버 / 향후 작업:**
- Spec §7 Out of Scope 항목들은 의도적으로 plan 에서 제외 (생성 후 토글 UI, Claude Max 자동 감지 등)

**Type consistency check:**
- `harnessEnabled` — DB integer (0/1), API/Zod boolean, UI checkbox boolean. 변환은 `toWorkspaceDto` 한 곳 (Task 3 Step 3) 과 `insert .values` 한 곳 (Task 3 Step 5). 세션 라우트는 raw DB row 비교 (`ws.harnessEnabled === 1`, Task 7 Step 3).
- `env` field — `Record<string, string>` 일관 사용 (Task 6, Task 7).
- `ensureHarnessFn` — `typeof ensureHarnessInstalled` 시그니처 일관 (Task 5, Task 8).

---

**Plan complete and saved to `agent-desk/docs/superpowers/plans/2026-05-27-agent-desk-harness-integration.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — `/subagent-driven-development`. 태스크별 fresh subagent 디스패치, 태스크 간 리뷰 체크포인트, 빠른 반복.

**2. Inline Execution** — `/executing-plans`. 현재 세션에서 batch 실행, 체크포인트 리뷰.

**어느 방식으로 진행할까요?**
