# agent-desk Work Packages — Design Spec

**Date:** 2026-05-27
**Status:** Draft (V1 슬라이스 합의용)
**Plan:** [plans/2026-05-27-work-packages-v1.md](../plans/2026-05-27-work-packages-v1.md)

---

## 1. 문제

agent-desk 는 사용자가 워크스페이스의 CLI 세션에서 **atomic 스킬**(예: `/brainstorming`, `/writing-plans`, `/systematic-debugging`)을 직접 호출하도록 한다. 사용자가 "어떤 스킬을 어떤 순서로 써야 한다"를 매번 기억해야 한다는 부담이 있다.

새 세션을 만들면 `briefing-form-modal` 이 떠 `/brainstorming Topic: ...` 한 줄을 주입해 첫 단계만 자동화하지만, 그 뒤의 단계(스펙 작성 → 플랜 작성 → 구현)는 사용자가 직접 이어가야 한다. 다단계 흐름을 **"업무 단위"** 로 묶어 시작·진행·종료를 일관되게 처리할 필요가 있다.

### 목표

업무 중심의 **work package** 를 정의·실행 단위로 도입한다. 각 패키지는:

1. 여러 atomic 스킬을 정해진 순서로 묶는다 (= 메타-스킬 패턴)
2. 시작 시점에 입력 폼을 제시한다 (Zod schema 기반)
3. 인스턴스의 진행 상태를 DB 에 기록한다 (정의는 코드, 인스턴스는 DB)

V1 슬라이스는 단 1 개의 패키지 — **"기획(planning)"** — 을 구현해 패턴을 검증한다. 훅 기반 자동 진행, PPT 파싱, 다중 CLI 지원은 후속 슬라이스로 분리한다.

## 2. 기존 컨텍스트 (재사용 가능한 자산)

| 자산 | 위치 | 재사용 방식 |
|---|---|---|
| JIT 스킬 install | `apps/gateway/src/skills/install.ts` (`ensureSkillInstalled`) | 각 step 의 의존 스킬을 inject 직전에 symlink |
| 프롬프트 주입 + 안정성 대기 | `apps/gateway/src/tmux/inject.ts` (`injectPrompt`) | step prompt 주입의 단일 진입점 |
| Zod 기반 요청 검증 | `brainstormingBriefRequest` (`packages/shared/src/api/session.ts`) | 패키지 시작 input 검증의 본 |
| 폼 렌더링 패턴 | `apps/web/components/briefing-form-modal.tsx` | hand-roll 필드 컴포넌트 패턴 그대로 |
| Workspace opt-in 패턴 | `workspaces.harnessEnabled` + `harness-integration-design.md` | 패키지 사용 가능 여부 자체는 워크스페이스가 아닌 **CLI 타입**(claude) 으로 결정 — 다름. 참고만. |
| Audit event 패턴 | `session_events` 테이블 | `work_package_events` 가 동일 모양 |

## 3. 설계 결정

### 3.1 메타-스킬 (A) vs 게이트웨이 오케스트레이션 (B) — 경계

**원칙:** 메타-스킬 우선 (A). 게이트웨이 (B) 는 *hard transition* 만 책임진다.

**Hard transition** 의 정의 — LLM 자체 보고를 신뢰할 수 없고 외부에서 관찰·강제해야 하는 상태 변화:

1. **시작 입력 영속화** — LLM 이 어떤 응답을 하기 전에 시작 폼의 입력이 DB 에 기록되어야 한다 (감사·복구 가능성).
2. **Step 전환 시 DB + tmux 동기화** — currentStep 증가와 다음 step prompt 의 send-keys 는 atomic 해야 한다. 둘 중 하나만 일어나면 "패키지는 step 2 인데 화면엔 step 1 프롬프트가 남아있는" 불일치 발생.
3. **종료 상태 기록** — 사용자가 명시적으로 종료한 시각·이유는 DB 가 단일 진실 원천.

**V1 의 결론:**
- 게이트웨이가 hard transition 3 종을 모두 처리한다.
- V1 의 "planning" 패키지는 step 이 2 개뿐이고 분기·재시도 로직이 없어, **메타-스킬 SKILL.md 를 V1 에서는 도입하지 않는다**. 게이트웨이가 정의 모듈의 `step.promptTemplate(inputs)` 를 직접 평가해 prompt 를 만든다.
- V2 진입 조건: 패키지가 (i) 조건 분기, (ii) step 내부의 비결정적 인터랙션(예: "필요하면 디버깅 skill 진입"), (iii) LLM 이 step 간 컨텍스트를 응축해서 전달해야 하는 핸드오프 — 중 하나라도 가지면 메타-스킬 SKILL.md 를 vendor 한다.

### 3.2 정의 모듈 구조

```
packages/shared/src/packages/
├── types.ts                # PackageDefinition, StepDefinition, FieldSpec
├── definitions/
│   └── planning.ts         # V1 의 유일한 정의
└── index.ts                # PACKAGES 레지스트리
```

타입 골격:

```typescript
export interface FieldSpec {
  name: string;            // schema key 와 일치
  label: string;
  hint?: string;
  kind: "text" | "textarea";  // V1 은 두 종류만
  required?: boolean;
  maxLength?: number;
  placeholder?: string;
  rows?: number;           // textarea 전용
}

export interface StartForm<T extends z.ZodTypeAny = z.ZodTypeAny> {
  schema: T;               // gateway 검증
  fields: FieldSpec[];     // web 렌더 hint
}

export interface StepDefinition<I = unknown> {
  index: number;           // 1-based
  title: string;           // "Brainstorm", "Write plan"
  skillName: string;       // JIT install 대상 (e.g., "brainstorming")
  promptTemplate: (inputs: I, ctx: StepContext) => string;  // 주입 문자열
}

export interface PackageDefinition<I = unknown> {
  id: string;              // "planning"
  title: string;           // "기획"
  description: string;     // 사용자에게 보여줄 한 줄
  cliRequirement: "claude" | "any";  // V1: 전부 "claude"
  startForm: StartForm;
  steps: StepDefinition<I>[];
}

export interface StepContext {
  workspacePath: string;
  /** -1 일 때 = 시작 시점(row 가 아직 없음). advance 시점은 실제 id. V2 에서 row 가 선삽입되면 항상 양수로 강제. */
  packageInstanceId: number;
}

export const PACKAGES: Record<string, PackageDefinition> = { planning };
```

`PackageDefinition` 은 **순수 데이터 + 순수 함수** 만 포함 → 정의 모듈은 web/gateway 양쪽에서 import 가능.

### 3.3 폼 렌더링 — hand-roll

`FieldSpec[]` 를 받아 input/textarea 를 차례로 렌더하는 단일 컴포넌트 (`PackageStartForm`). 이미 `briefing-form-modal.tsx` 가 동일 패턴(useId + Field + fieldControl + maxLength)을 채택하고 있고, V1 의 필드 종류가 2 개뿐이라 schema-driven 렌더러(zod-to-json-schema + rjsf) 는 과한 추상이다.

V2 에서 select/radio/file 등이 필요해지면 `FieldSpec.kind` 에 추가하고 `PackageStartForm` 에 케이스 한 줄씩 늘리는 식으로 확장. JSON-schema-form 채택 여부는 그때 재평가.

### 3.4 V1 슬라이스 — "planning" 패키지

```typescript
// packages/shared/src/packages/definitions/planning.ts
export const planning: PackageDefinition<PlanningInputs> = {
  id: "planning",
  title: "기획",
  description: "아이디어를 brainstorming → spec → plan 으로 정리합니다.",
  cliRequirement: "claude",
  startForm: {
    schema: planningInputs,   // 기존 brainstormingBriefRequest 와 동형
    fields: [
      { name: "topic", label: "What are we planning?", kind: "text", required: true, maxLength: 500 },
      { name: "context", label: "Context", kind: "textarea", maxLength: 2000, rows: 3 },
      { name: "constraints", label: "Constraints", kind: "textarea", maxLength: 2000, rows: 2 },
      { name: "goals", label: "Success criteria", kind: "textarea", maxLength: 2000, rows: 2 },
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

`formatBrainstormingPrompt` 는 기존 `routes/sessions.ts` 의 동일 함수를 `packages/shared` 로 이동해 재사용한다 (gateway 와 패키지 정의 양쪽에서 import).

**Step 2 의 prompt 가 단순 `/writing-plans` 인 이유:** brainstorming 종료 시점에 LLM 은 이미 스펙 파일 경로를 컨텍스트에 가지고 있다. `/writing-plans` 스킬 자체가 사용자에게 어느 spec 인지 묻거나 자동 탐색하므로, 추가 input 없이 진입 가능. (V2 에서 step input form 을 추가하면 더 풍성한 컨텍스트 전달 가능.)

### 3.5 기존 briefing 메커니즘 제거

work-package 가 같은 역할을 수행하므로 briefing 관련 코드·DB 흔적을 모두 삭제한다. 단일 진실 원천은 `work_packages` 의 active 인스턴스 유무.

| 자산 | 처리 |
|---|---|
| `apps/web/components/briefing-form-modal.tsx` | **삭제**. `work-package-modal.tsx` 가 자리 차지 |
| `apps/gateway/src/routes/sessions.ts` 의 `POST /:id/brief` 핸들러 | **삭제** (라우트 + 헬퍼 `formatBrainstormingPrompt` 의 gateway 사본은 shared 로 이전 후 gateway 사본 제거) |
| `apps/gateway/tests/sessions.test.ts` 의 `/brief` describe 블록 | **삭제** |
| `packages/shared/src/api/session.ts` 의 `brainstormingBriefRequest`, `BrainstormingBriefRequest` 타입 | **삭제** (planning 패키지의 `planningInputs` 가 대체) |
| `sessions.briefedAt` 컬럼 + DTO 필드 | **DROP COLUMN** 마이그레이션. terminal-tab 의 `briefedAt == null` trigger 룰은 `active work-package == null` 로 교체 |
| `session_events.kind` enum 의 `briefed`, `brief-failed` | **enum 에서 제거** (CHECK 갱신). 기존 row 는 보존 (SQLite CHECK 는 신규 row 만 강제) |

start 단계의 inject 실패는 work_packages row 도 안 만들고 audit 도 남기지 않는다 (사용자가 modal 에서 즉시 재시도). 별도 `session_events.kind` 추가 없음.

### 3.6 패키지 선택 단계는 항상 노출

V1 에 패키지가 1 종 (planning) 이라도 modal 의 picker step 을 자동 skip 하지 않는다. 사용자는 명시적으로 패키지 카드를 클릭한 다음 폼을 본다. 이유:

- 패키지가 늘어나도 UI 변동 0
- 사용자가 "지금 무슨 작업을 시작한다" 는 의식적 선택을 한 뒤 폼 입력
- picker 의 빈 슬롯이 "곧 더 추가될 패키지" 의 자연스러운 자리표시

새 흐름:

```
새 Claude 세션 클릭
└─ active work-package 없음
   └─ work-package-modal 표시 (Step A: picker)
      ├─ [ 기획 (planning) ] ← 클릭
      │   ↓
      │   Step B: 시작 폼 (FieldSpec[] 렌더)
      │   ├─ Start work package → POST .../work-packages
      │   └─ Back → picker 로 복귀
      └─ Skip (modal 닫음, work_package 생성 안 함)
```

세션 패널 사이드에 활성 패키지 카드 추가:

```
┌ Active package ─────────────────┐
│ 기획 · Step 1/2 (Brainstorm)    │
│ Started 2 min ago               │
│ Artifacts:                      │
│   · specs/2026-05-27-foo.md     │
│ [ Next step ]   [ Complete ]    │
└─────────────────────────────────┘
```

`Next step` 은 마지막 step 일 때 비활성. `Complete` 는 임의 step 에서 누를 수 있음 (사용자가 일찍 마치고 싶을 때). Artifact 항목은 §3.7 의 디스커버리 결과.

### 3.7 Artifact discovery & drift 추적

work package 의 산출물 .md 본문은 워크스페이스 fs 의 `<ws>/docs/superpowers/{specs,plans}/` 에 그대로 둔다 (superpowers 표준 경로). agent-desk 는 **참조·해시 인덱스만** DB 에 보유한다.

#### 디스커버리 방식 — 옵션 C (gateway inline)

게이트웨이가 work-package 의 상태 전이 시점마다 워크스페이스 fs 를 직접 스캔한다. Hook 도 AGENTS.md 주입도 사용하지 않는다 (이유는 §10 비교 참조). 모든 CLI (claude/codex/gemini) 에서 동일 동작을 보장.

```
trigger 시점                          동작
─────────────────────────────────    ─────────────────────────────────────────
[A] POST /sessions/:id/work-packages   inject 직전: scanArtifactDirs() → baseline 저장 (work_packages 에 inputs 와 함께)
    (start)                            inject 직후: scan 다시 → diff → 신규 파일은 work_package_artifacts INSERT

[B] POST /work-packages/:id/advance    scan → 이전 baseline 과 diff
                                       · 신규: INSERT (step_index = 현재 currentStep)
                                       · 기존 파일 sha 변화: UPDATE last_seen_sha256, drift_detected=1
                                       · baseline 을 갱신해 다음 advance/complete 가 이어서 비교

[C] POST /work-packages/:id/complete   동일하게 한 번 더 scan + diff. baseline 은 더 갱신하지 않음 (인스턴스 닫힘)
```

`scanArtifactDirs(workspacePath)` 는 `<ws>/docs/superpowers/specs/` 와 `<ws>/docs/superpowers/plans/` 두 디렉토리만 본다 (V1). 재귀 X, hidden 파일 무시, symlink 따라가지 않음, `.md` 만. 각 파일의 `{ relPath, sha256, size, mtimeMs }` 를 반환.

#### `work_package_artifacts` 테이블 의미

| 컬럼 | 의미 |
|---|---|
| `work_package_id` | 어느 인스턴스 |
| `step_index` | 어느 step 에서 처음 관측됨 |
| `file_path` | 워크스페이스 상대 경로 (`docs/superpowers/specs/2026-05-27-foo-design.md`) |
| `sha256`, `size` | **첫 관측 시점** 의 해시·크기 (불변 baseline) |
| `recorded_at` | 첫 관측 timestamp |
| `last_seen_sha256`, `last_seen_at` | **가장 최근 관측** (drift 비교용) |
| `drift_detected` | last_seen_sha256 ≠ sha256 이면 1. UI 의 "수정됨" 배지 |

같은 file_path 가 두 번 INSERT 되지 않도록 `(work_package_id, file_path)` UNIQUE.

#### 비용 / 한계

- sha256 한 파일당 < 5ms (.md 는 작음). step 전환 시점에만 호출 → 사용자 인지 지연 무시 수준
- baseline 은 work_packages 의 `baseline_json` text 컬럼에 `{path: sha256}` 맵으로 저장 (별도 테이블 안 만듦)
- 파일 삭제는 V1 에서 별도 처리 안 함 (drift_detected 만 갱신 안 됨, deleted 표시 X). V2 에서 `deleted_at` 컬럼 추가 검토
- 외부 도구가 같은 파일을 새로 만든 경우도 동일하게 잡힘 — 정상. work package 가 만든 산출물이라는 의미가 아니라 "이 인스턴스 동안 그 디렉토리에 들어온 파일" 이라는 약한 의미

## 4. API 변경

### 신규 — work packages

`POST /sessions/:id/work-packages`

```json
// Request
{ "packageId": "planning", "inputs": { "topic": "...", "context": "...", "constraints": "...", "goals": "..." } }

// 200 Response
{
  "instance": {
    "id": 1, "sessionId": 42, "packageId": "planning",
    "currentStep": 1, "status": "active",
    "inputs": { /* validated */ },
    "createdAt": 1748390000000,
    "advancedAt": 1748390000000,
    "completedAt": null
  },
  "step": { "index": 1, "title": "Brainstorm" },
  "inject": { "injected": true },
  "install": { "status": "installed", "linkPath": "...", "sourcePath": "..." }
}

// 4xx
// 400 invalid_request | unknown_package | unknown_session
// 409 session_dead | session_cli_mismatch | already_has_active_package
```

`POST /work-packages/:id/advance`

```json
// Request
{ "expectedCurrentStep": 1 }     // optimistic concurrency token

// 200 Response — 동일 envelope
// 409 expected_step_mismatch | already_completed | no_next_step
```

`POST /work-packages/:id/complete`

```json
// Request
{ "outcome": "success" | "abandoned" }   // optional, default "success"
// 200 Response — { instance } (inject 없음)
```

`GET /sessions/:id/work-packages`

```json
{ "instances": [ /* 최신순. V1 에선 0 또는 1 개 */ ] }
```

`GET /packages`

```json
{
  "packages": [
    { "id": "planning", "title": "기획", "description": "...",
      "cliRequirement": "claude", "startForm": { "fields": [...] },
      "stepTitles": ["Brainstorm", "Write plan"] }
  ]
}
```

`startForm.schema` 는 직렬화하지 않는다 (web 은 fields 만 사용). Gateway 가 schema 로 검증.

`GET /work-packages/:id/artifacts`

```json
{
  "artifacts": [
    {
      "id": 12,
      "stepIndex": 1,
      "filePath": "docs/superpowers/specs/2026-05-27-foo-design.md",
      "sha256": "abc123...",
      "size": 4821,
      "recordedAt": 1748390000000,
      "lastSeenSha256": "abc123...",
      "lastSeenAt": 1748390000000,
      "driftDetected": false
    }
  ]
}
```

### 제거되는 endpoint

- `POST /sessions/:id/brief` — 라우트·핸들러·테스트 모두 삭제. work package start 가 대체.

## 5. DB 마이그레이션

```sql
-- 0004_work_packages.sql
CREATE TABLE work_packages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL REFERENCES sessions(id),
  package_id TEXT NOT NULL,
  current_step INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL,           -- 'active' | 'completed' | 'abandoned'
  inputs_json TEXT NOT NULL,
  baseline_json TEXT NOT NULL,    -- {path: sha256} map; 다음 step 비교 기준
  created_at INTEGER NOT NULL,
  advanced_at INTEGER NOT NULL,
  completed_at INTEGER
);
CREATE INDEX work_packages_session_idx ON work_packages(session_id);

CREATE TABLE work_package_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  work_package_id INTEGER NOT NULL REFERENCES work_packages(id),
  kind TEXT NOT NULL,             -- 'started' | 'step-injected' | 'step-inject-failed' | 'advanced' | 'completed' | 'abandoned'
  payload_json TEXT,
  at INTEGER NOT NULL
);
CREATE INDEX work_package_events_wp_idx ON work_package_events(work_package_id);

CREATE TABLE work_package_artifacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  work_package_id INTEGER NOT NULL REFERENCES work_packages(id),
  step_index INTEGER NOT NULL,
  file_path TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  size INTEGER NOT NULL,
  recorded_at INTEGER NOT NULL,
  last_seen_sha256 TEXT NOT NULL,
  last_seen_at INTEGER NOT NULL,
  drift_detected INTEGER NOT NULL DEFAULT 0,
  UNIQUE(work_package_id, file_path)
);
CREATE INDEX work_package_artifacts_wp_idx ON work_package_artifacts(work_package_id);

-- briefing 제거
ALTER TABLE sessions DROP COLUMN briefed_at;
-- (drizzle-kit 가 session_events.kind CHECK 를 재생성하면서 'briefed' / 'brief-failed' 가 enum 에서 빠짐)
```

`current_step` 의미: 1-based step index. 0 은 의미 없음(생성과 동시에 1 로 설정).

**V1 invariant:** 한 세션에 active 상태 인스턴스는 0 또는 1 개. enforce 는 application-level (POST `/sessions/:id/work-packages` 가 active 인스턴스 존재 시 `409 already_has_active_package`). DB unique index 는 V2 에서 추가 (concurrency 가 실제 문제가 될 때).

**SQLite DROP COLUMN 가용성:** better-sqlite3 가 번들하는 SQLite 가 3.35+ (DROP COLUMN 지원). agent-desk 의 deps 가 이미 그 이상 — 별도 처리 불필요.

## 6. 동작 흐름

### 6.1 시작 (Step 1 주입)

순서가 중요: **inject 가 성공한 다음에야** `work_packages` row 를 만든다. inject 실패 시 row 가 없어야 사용자가 modal 을 다시 띄워 재시도 가능 (`already_has_active_package` 와 상충하지 않음). inject 실패는 audit 도 남기지 않는다 (silent 502).

```
POST /sessions/:id/work-packages { packageId: "planning", inputs }
└─ session 조회 (active + cli=="claude" 검증)
└─ active work_package 존재 검사 (409 already_has_active_package)
└─ definition = PACKAGES[packageId] (없으면 400 unknown_package)
└─ definition.startForm.schema.safeParse(inputs) (실패 시 400 invalid_inputs)
└─ baseline = scanArtifactDirs(workspacePath)  // {path: sha256} map
└─ ensureSkillInstalled({ workspacePath, skillName: definition.steps[0].skillName })
└─ prompt = definition.steps[0].promptTemplate(inputs, ctx={workspacePath, packageInstanceId: -1})
└─ injectPrompt({ tmux, name: session.tmuxName, prompt })
   ├─ failed → 502 반환 (DB 미작성, audit 없음)
   └─ injected →
      └─ INSERT work_packages (currentStep=1, status='active', inputs_json, baseline_json=JSON(baseline), created_at=now, advanced_at=now)
      └─ INSERT work_package_events (kind='started', payload={packageId, install})
      └─ INSERT work_package_events (kind='step-injected', payload={step:1, install})
      └─ UPDATE sessions.lastActivityAt=now
      └─ 200 반환
```

### 6.2 다음 step

```
POST /work-packages/:id/advance { expectedCurrentStep }
└─ row 조회 (status='active' 검증)
└─ row.currentStep == expectedCurrentStep 검증 (409 expected_step_mismatch)
└─ nextStep = definition.steps[currentStep]  // currentStep 은 1-based, steps 는 0-based array → index 가 currentStep
└─ nextStep 없으면 409 no_next_step (대신 complete 호출 유도)
└─ reconcileArtifacts(row, currentStep)  // 이전 baseline vs 현재 fs diff → INSERT 신규 / UPDATE drift, baseline 갱신
└─ ensureSkillInstalled (nextStep.skillName)
└─ prompt = nextStep.promptTemplate(inputs, ctx={workspacePath, packageInstanceId: row.id})
└─ injectPrompt(...)
└─ success → UPDATE currentStep=nextStep.index, advanced_at=now, baseline_json=JSON(new baseline); INSERT event 'advanced' + 'step-injected'
└─ fail → INSERT event 'step-inject-failed', currentStep·baseline 미변경, 502 (사용자가 같은 advance 호출 재시도 가능)
```

`reconcileArtifacts(row, stepIndex)` 는 §3.7 의 알고리즘 실행 + `step_index=stepIndex` 로 신규 row 기록. 새 baseline = scanArtifactDirs 의 현재 결과.

### 6.3 종료

```
POST /work-packages/:id/complete { outcome }
└─ row 조회 (status='active' 검증; 이미 완료면 409 already_completed)
└─ reconcileArtifacts(row, row.currentStep)  // 마지막 step 의 산출물도 잡음
└─ UPDATE status=outcome=='abandoned'?'abandoned':'completed', completed_at=now
└─ INSERT event 'completed'|'abandoned'
└─ 200 { instance }
```

종료 시 tmux 주입은 없다. baseline 도 더 갱신하지 않음 (인스턴스 닫힘).

## 7. UI 변경

### 7.1 새 컴포넌트

- `apps/web/components/work-package-modal.tsx` — picker (Step A) + 시작 폼 (Step B) 컨테이너
- `apps/web/components/package-picker.tsx` — `PackageCatalogEntry[]` 카드 그리드. 클릭 시 부모로 `id` 전달
- `apps/web/components/package-start-form.tsx` — `FieldSpec[]` → 렌더링하는 reusable form (Back 버튼 포함)
- `apps/web/components/active-package-card.tsx` — 세션 패널 사이드의 활성 인스턴스 카드 + Next/Complete
- `apps/web/components/artifact-list.tsx` — `WorkPackageArtifactDto[]` 를 link 리스트로. drift 면 "수정됨" 배지

### 7.2 변경

- `apps/web/components/tabs/terminal-tab.tsx` (또는 그 자식) — 활성 패키지 인스턴스 fetch + 카드 렌더
- `apps/web/lib/gateway-client.ts` — `workPackages.{start,advance,complete,listForSession,listArtifacts}`, `packages.list` 추가
- `apps/web/components/briefing-form-modal.tsx` + 관련 테스트 — **완전 삭제**. 호출처에서 work-package-modal 로 교체

### 7.3 modal 트리거 룰

- 세션의 cli == "claude"
- `gateway.workPackages.listForSession(sessionId)` 응답에 status='active' 인스턴스가 없음
- 사용자가 그 세션의 터미널 패널을 첫 포커스

세 조건이 모두 만족하면 modal `open=true`. modal 의 Skip 은 단순 close — 아무것도 만들지 않고 사용자는 자유로운 슬래시 입력으로 진행 가능. 닫힌 modal 은 같은 세션에서 사용자가 다시 명시적으로 열기 전엔 안 뜸 (`localStorage` 또는 in-memory dismissed flag 로 추적).

### 7.4 modal 의 2-step 구조

```
modal open
└─ Step A: Picker
   ├─ packages.list 응답을 카드 그리드로
   ├─ 각 카드: title, description, stepTitles preview
   ├─ cliRequirement 가 현재 세션 cli 와 불일치하면 disabled + tooltip
   └─ 카드 클릭 → 선택된 id 보관 → Step B
└─ Step B: Start form
   ├─ 선택된 패키지의 FieldSpec[] 렌더
   ├─ Back → Step A 로 복귀 (입력 초기화)
   ├─ Skip → modal close
   └─ Start work package → POST → modal close
```

V1 의 picker 에는 카드가 1 개 (planning). 그래도 picker 를 보여준다 — 미래에 패키지가 추가되어도 동일 컴포넌트가 그대로.

## 8. 메타-스킬 디렉토리 — V1 에서의 위치

V1 은 SKILL.md 를 도입하지 않으므로 vendor 디렉토리 변경 없음. V2 의 placeholder 만 spec 에 명기:

```
agent-desk/packages/work-packages/skills/<package-id>/SKILL.md   # V2
```

`packages/work-packages` 는 V1 에서는 존재하지 않는다. V2 진입 시 신설 + gateway 의 JIT install 이 superpowers / harness 와 동일 패턴으로 symlink.

## 9. 테스트 전략

| 영역 | 종류 | 위치 |
|---|---|---|
| PackageDefinition planning schema | 단위 | `packages/shared/tests/packages.test.ts` (신규) |
| `POST /sessions/:id/work-packages` happy | 통합 | `apps/gateway/tests/work-packages.test.ts` (신규) |
| 409: cli ≠ claude, already_has_active, session_dead | 통합 | 동상 |
| `POST /work-packages/:id/advance` happy + concurrency mismatch | 통합 | 동상 |
| no_next_step on last step | 통합 | 동상 |
| `POST /work-packages/:id/complete` (success/abandoned) | 통합 | 동상 |
| Inject 실패 시 work_package row 미작성, audit 없음 | 통합 | 동상 |
| `GET /packages` shape | 통합 | 동상 |
| Artifact discovery — start 시점 baseline, advance 시점 신규 detect | 통합 (임시 디렉토리 + fs.writeFile mock 데이터) | 동상 |
| Artifact discovery — drift: 같은 파일 재 hashing, drift_detected 갱신 | 통합 | 동상 |
| `GET /work-packages/:id/artifacts` shape | 통합 | 동상 |
| `package-start-form` rendering for text + textarea | 컴포넌트 | `apps/web/tests/package-start-form.test.tsx` (신규) |
| `package-picker` 카드 그리드 + cli mismatch disabled | 컴포넌트 | `apps/web/tests/package-picker.test.tsx` (신규) |
| `work-package-modal` 2-step (picker → form, Back, Skip) | 컴포넌트 | `apps/web/tests/work-package-modal.test.tsx` (신규) |
| `active-package-card` Next/Complete + artifact 슬롯 | 컴포넌트 | `apps/web/tests/active-package-card.test.tsx` (신규) |
| `artifact-list` drift 배지 | 컴포넌트 | `apps/web/tests/artifact-list.test.tsx` (신규) |

## 10. 범위 밖 (V2+)

- **메타-스킬 SKILL.md** — V2 진입 조건은 §3.1. planning 패키지를 SKILL.md 로 리팩터링하는 자체 작업으로 분리.
- **자동 진행 / fs watcher** — V1 의 inline diff 대신 background watcher (chokidar 등) 로 실시간 artifact detect. V2.
- **AGENTS.md / CLAUDE.md 자동 주입** — 워크스페이스 등록 시 agent-desk 가 LLM narrative 지시문을 .md 로 append. "LLM 행동 가이드" 가 필요해질 때 V2.
- **Claude Code hook (`.claude/settings.json`)** — `PostToolUse`/`Stop` 훅으로 외부 강제 (예: spec 작성 전 다음 명령 차단). Claude Code 전용·디버깅 비용. 강제 차단이 필요해지면 V3.
- **wiki tab 다중 root** — `routes/wiki.ts` 의 `wikiRoot` 를 다중 root 로 확장해 `<ws>/docs/superpowers/` 를 wiki tab tree 에 노출. 별도 spec 으로 V2.
- **추가 패키지** — "design", "develop", "verify" 등. 각자 별도 brainstorming + spec 사이클.
- **PPT/외부 자료 import** — start form 에 파일 업로드. V3.
- **다중 CLI 지원** — codex/gemini 용 패키지 (스킬 호환성 한정). V3.
- **세션당 다중 활성 패키지** — V1 invariant 해제. concurrency 가 실제 문제 될 때.
- **Artifact 삭제 처리** — 파일이 사라진 경우 `deleted_at` 마킹. V2.
- **Step 별 추가 form** — Step 2 진입 시 작은 form 으로 spec 경로 등 입력. V2.

## 11. 마이그레이션 / 롤백

- **앞으로 (forward)** — drizzle-kit `0004_work_packages.sql` 생성. 세 신규 테이블 + `sessions.briefed_at` DROP COLUMN + `session_events.kind` CHECK 갱신. 기존 워크스페이스/세션 그대로 사용 가능 (briefedAt 데이터는 의미가 work-package active 인스턴스 유무로 이전됨 — 사용자 입장에선 "새 세션 첫 클릭 시 modal 다시 한 번 뜸").
- **롤백** — `DROP TABLE work_package_artifacts; DROP TABLE work_package_events; DROP TABLE work_packages; ALTER TABLE sessions ADD briefed_at INTEGER;` + 코드 revert. briefedAt 값은 NULL 로 초기화 (1 회성 안내 한 번 더 뜨는 수준의 영향).
- **데이터 손실** — 롤백 시 work_packages 인스턴스·artifact 인덱스 모두 소실. 본문 .md 는 워크스페이스 fs 에 그대로 남음. 진행 중이던 사용자는 직접 슬래시로 이어서 작업 가능 (LLM 컨텍스트는 tmux pane 에 남아있음).

## 12. 보안 고려사항

- `inputs_json` 은 사용자 직접 입력 — Zod schema 가 길이 cap 강제. SQL 은 prepared statement (drizzle 표준).
- prompt template 의 결과 문자열은 `inject.ts` 의 `sendKeys` 로만 전달; `routes/sessions.ts` 기존 `shellEscape` 패턴 재사용 X (sendKeys 는 shell 이 아닌 tmux 명령). 줄바꿈은 ` · ` 로 치환 (기존 `formatBrainstormingPrompt` 동일).
- `packageId` 는 정의 레지스트리에 있는 키만 허용 (string lookup → 정의 없으면 400). path traversal 불가.
- harness 와 마찬가지로 게이트웨이는 127.0.0.1 바인딩 + bearer token 인증을 이미 강제하므로 새 endpoint 도 동일 보호.
- `scanArtifactDirs(workspacePath)` 는 워크스페이스 절대경로 + `docs/superpowers/{specs,plans}` 만 트래버스. `fs.readdir` 후 각 entry 가 정규 파일인지 `fs.lstat` 으로 확인하고 symlink·디렉토리는 skip — fs traversal escape 방지. file_path 는 항상 워크스페이스-상대 경로로 정규화.
