# Work Package Progress Hooks — Design Spec

**Date:** 2026-05-27  
**Status:** Approved  
**Plan:** [plans/2026-05-27-work-package-progress-hooks.md](../plans/2026-05-27-work-package-progress-hooks.md)

---

## 1. 문제

V1 Work Packages는 사용자가 웹 UI의 "Next step" 버튼을 눌러야만 step이 전진한다. Claude Code 세션 안에서 실제로 무슨 일이 일어나는지(어떤 파일을 만들었는지, 어느 turn에서 무엇을 했는지)를 agent-desk가 전혀 모른다.

### 목표

1. Claude Code 훅을 통해 매 turn의 진행 상황을 DB에 자동 기록
2. step 완료 여부를 게이트웨이가 판단해 웹 UI에 실시간 알림 (WebSocket)
3. 사용자가 "다음 단계로" 오버레이를 확인 후 advance → 기존 흐름과 연결

---

## 2. 설계 결정

### 2.1 훅 역할 — 관찰(observe)만

훅은 진행 상황을 기록하고 step 완료를 감지하는 역할만 한다. step 전환(advance)은 웹 UI 오버레이를 통해 사용자가 확인 후 진행한다. 자동 전환 없음.

```
훅 감지 → WS push → 웹 오버레이 표시 → 사용자 클릭 → advance API
```

### 2.2 step 완료 감지 — PostToolUse 파일 경로 기반

텍스트 패턴 매칭(regex)은 사용하지 않는다. Claude Code가 `Write`/`Edit` 도구를 실행하면 `PostToolUse` 훅이 정확한 절대 파일 경로를 제공한다. 게이트웨이는 이 경로가 해당 step의 `completionArtifactDir` 안에 있는지만 확인한다.

**근거:**
- LLM 텍스트 표현에 의존하지 않아 regex 구멍이 없다
- 파일 생성이라는 관찰 가능한 사실에 기반
- 멀티세션 안전: 이벤트 드리븐이므로 세션 A의 파일 생성이 세션 B에 영향 없음

실증 확인: 현재 워크스페이스에서 테스트 완료. PostToolUse stdin 페이로드:
```json
{
  "hook_event_name": "PostToolUse",
  "tool_name": "Write",
  "tool_input": { "file_path": "/abs/path/to/docs/superpowers/specs/foo.md" },
  "tool_response": { "type": "create" },
  "session_id": "...",
  "cwd": "/workspace"
}
```

### 2.3 WS 채널 — 전용 `/sessions/:id/progress`

기존 `/sessions/:id/attach`(터미널)와 분리. 진행 이벤트 전용 WebSocket 엔드포인트 신설. 책임 분리.

### 2.4 훅 스크립트 — Node.js, OS 무관

bash + curl 대신 Node.js CJS 스크립트. Claude Code는 Node.js 위에서 동작하므로 항상 사용 가능. `chmod +x` 불필요. Windows/Mac/Linux 공통.

```
node .claude/hooks/wp-progress.js
```

표준 라이브러리만 사용 (`http`, `https`, `path`) — 외부 패키지 의존 없음.

### 2.5 훅 설치/제거

- **설치 시점:** 워크스페이스 생성 + 게이트웨이 startup
- **제거 시점:** 워크스페이스 삭제 — `ensureProgressHookRemoved` 호출
- 기존 `ensureSkillInstalled` / `ensureHarnessRemoved` 패턴과 동일

### 2.6 이벤트 테이블 통합

`work_package_progress`를 별도 테이블로 만들지 않고 기존 `work_package_events`에 통합. kind enum에 `hook-file` / `hook-turn` 두 종을 추가하고, 데이터는 기존 `payload_json`에 담는다.

**이유:** 두 테이블 모두 동일 엔티티의 append-only 이벤트 로그. 합치면 전체 타임라인을 단일 쿼리로 조회 가능하고, 새 컬럼 추가 없이 기존 패턴을 그대로 유지.

### 2.7 CLI 범위

V1: Claude Code만 지원. `cliRequirement: "claude"` 패키지에만 훅 설치.

---

## 3. 아키텍처

```
[Claude Code 세션]
  │
  │ PostToolUse(Write|Edit) — 파일 쓸 때마다
  ▼
.claude/hooks/wp-progress.js
  │  env: AGENT_DESK_SESSION_ID, AGENT_DESK_URL, AGENT_DESK_TOKEN
  │  stdin: { hook_event_name, tool_name, tool_input.file_path, cwd }
  │  항상 exit 0
  ▼
POST /sessions/:id/progress  { filePath: "/abs/path/foo.md" }
  │
  ▼
Gateway (progress route)
  ├─ 세션 조회
  ├─ active work_package 없으면 → { recorded: false } (무시)
  ├─ INSERT work_package_events (kind='hook-file', payload_json)
  ├─ file_path 가 workspacePath + step.completionArtifactDir 안에 있나?
  │     NO  → 200 { recorded: true, stepReady: false }
  │     YES → WS push + 200 { recorded: true, stepReady: true }
  │                │
  │                ▼
  │          /sessions/:id/progress WS
  │          { type: "step_ready", stepIndex, workPackageId, stepTitle }
  │                │
  │                ▼
  │          웹 UI 오버레이
  │          "📦 Brainstorm 완료 감지 — 다음 단계로?"
  │          [다음 단계로]  [지금은 괜찮아요]
  │                │
  │                ▼
  │          POST /work-packages/:id/advance  (기존 API)
  │
  ▼ (별도)
Stop hook — 매 turn 완료 후
  │  stdin: { hook_event_name: "Stop", last_assistant_message }
  ▼
POST /sessions/:id/progress  { lastMessage: "..." (500자) }
  │
  ▼
Gateway → INSERT work_package_events (kind='hook-turn', payload_json)
          → 완료 감지 없음 (기록 전용)
```

---

## 4. PackageDefinition 변경

```typescript
// packages/shared/src/packages/types.ts
export interface StepDefinition<I = unknown> {
  index: number;
  title: string;
  skillName: string;
  promptTemplate: (inputs: I, ctx: StepContext) => string;
  /** step 완료 신호로 사용할 artifact 디렉토리 (workspace 상대 경로, 끝에 / 포함) */
  completionArtifactDir: string;
}

// packages/shared/src/packages/definitions/planning.ts
steps: [
  {
    index: 1,
    title: "Brainstorm",
    skillName: "brainstorming",
    promptTemplate: (...) => ...,
    completionArtifactDir: "docs/superpowers/specs/",
  },
  {
    index: 2,
    title: "Write plan",
    skillName: "writing-plans",
    promptTemplate: () => "/writing-plans",
    completionArtifactDir: "docs/superpowers/plans/",
  },
]
```

---

## 5. DB 변경

### 5.1 `work_package_events` kind enum 확장

```typescript
// packages/shared/src/db/schema.ts
kind: text("kind", {
  enum: [
    // 기존 — 게이트웨이가 기록 (상태 전이)
    "started",
    "step-injected",
    "step-inject-failed",
    "advanced",
    "completed",
    "abandoned",
    // 신규 — 훅이 기록 (turn 진행)
    "hook-file",   // PostToolUse Write/Edit 감지
    "hook-turn",   // Stop 훅 turn 완료
  ],
}).notNull(),
```

### 5.2 payload_json 스키마 (신규 kind)

```jsonc
// hook-file
{
  "stepIndex": 1,
  "filePath": "docs/superpowers/specs/2026-05-27-foo-design.md",
  "markerMatched": true   // completionArtifactDir 안에 있으면 true
}

// hook-turn
{
  "stepIndex": 1,
  "lastMessage": "브레인스토밍을 진행하며 아이디어를...",  // 최대 500자
  "markerMatched": false
}
```

### 5.3 마이그레이션 (`0005_work_package_progress_hooks.sql`)

```sql
-- work_package_events 테이블 재생성으로 kind CHECK 확장
-- (SQLite는 CHECK constraint 수정을 지원하지 않으므로 rename → create → copy)
CREATE TABLE work_package_events_new (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  work_package_id  INTEGER NOT NULL REFERENCES work_packages(id),
  kind             TEXT NOT NULL CHECK(kind IN (
    'started','step-injected','step-inject-failed',
    'advanced','completed','abandoned',
    'hook-file','hook-turn'
  )),
  payload_json     TEXT,
  at               INTEGER NOT NULL
);
INSERT INTO work_package_events_new SELECT * FROM work_package_events;
DROP TABLE work_package_events;
ALTER TABLE work_package_events_new RENAME TO work_package_events;
CREATE INDEX work_package_events_wp_idx ON work_package_events(work_package_id);
```

---

## 6. API

### 6.1 신규 — `POST /sessions/:id/progress`

```
Request (훅에서 호출):
  Authorization: Bearer <token>
  Body: { filePath?: string } | { lastMessage?: string }

처리:
  1. 세션 조회 (없거나 dead면 200 recorded:false)
  2. active work_package 조회 (없으면 200 recorded:false)
  3. definition = PACKAGES[wp.packageId]
  4. step = definition.steps[wp.currentStep - 1]
  5. INSERT work_package_events (kind='hook-file'|'hook-turn', payload_json)

  filePath 있을 때 추가:
  6. absDir = path.join(workspace.path, step.completionArtifactDir)
  7. path.normalize(filePath).startsWith(path.normalize(absDir)) ?
       → marker_matched=true, WS push, stepReady=true
       → marker_matched=false, stepReady=false

Response:
  200 { recorded: true, stepReady: boolean }
  200 { recorded: false }   -- active wp 없을 때
```

### 6.2 신규 — WS `/sessions/:id/progress`

```
연결: ws://host/sessions/:id/progress?token=<token>

서버 → 클라이언트 이벤트:
  { type: "step_ready", workPackageId: number,
    stepIndex: number, stepTitle: string }

연결 수명: 세션 패널 마운트~언마운트
인메모리 구독자 맵: Map<sessionId, Set<WebSocket>>
```

---

## 7. 훅 스크립트 (`wp-progress.js`)

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

---

## 8. 훅 설치/제거 (`apps/gateway/src/skills/install.ts` 확장)

```typescript
const HOOK_SCRIPT_SRC = path.join(
  import.meta.dirname, "../hooks/wp-progress.js"
);

const HOOK_ENTRY_MARKER = "wp-progress";  // settings.json 중복 방지용 식별자

export async function ensureProgressHookInstalled(
  workspacePath: string
): Promise<void> {
  const hooksDir  = path.join(workspacePath, ".claude", "hooks");
  const hookDst   = path.join(hooksDir, "wp-progress.js");
  const settingsP = path.join(workspacePath, ".claude", "settings.json");

  await fs.mkdir(hooksDir, { recursive: true });
  await fs.copyFile(HOOK_SCRIPT_SRC, hookDst);
  // chmod +x 없음 — node로 직접 실행
  await mergeHookEntries(settingsP);
}

export async function ensureProgressHookRemoved(
  workspacePath: string
): Promise<void> {
  const hookDst   = path.join(workspacePath, ".claude", "hooks", "wp-progress.js");
  const settingsP = path.join(workspacePath, ".claude", "settings.json");

  await fs.rm(hookDst, { force: true });
  await removeHookEntries(settingsP);
}

// mergeHookEntries: settings.json의 hooks.PostToolUse + hooks.Stop에
// wp-progress.js 항목을 idempotent하게 추가
// removeHookEntries: 해당 항목만 제거 (다른 훅 보존)
```

설치 후 워크스페이스 `.claude/settings.json`:
```json
{
  "hooks": {
    "PostToolUse": [{
      "matcher": "Write|Edit",
      "hooks": [{ "type": "command", "command": "node .claude/hooks/wp-progress.js" }]
    }],
    "Stop": [{
      "hooks": [{ "type": "command", "command": "node .claude/hooks/wp-progress.js" }]
    }]
  }
}
```

---

## 9. WS 서버 (`apps/gateway/src/ws/progress-server.ts`)

```typescript
// 인메모리 구독자 맵 (재시작 시 초기화 — 재연결로 복구)
const subs = new Map<number, Set<WebSocket>>();

export function broadcastStepReady(opts: {
  sessionId: number;
  workPackageId: number;
  stepIndex: number;
  stepTitle: string;
}): void {
  const clients = subs.get(opts.sessionId);
  if (!clients?.size) return;
  const msg = JSON.stringify({ type: "step_ready", ...opts });
  for (const ws of clients) {
    if (ws.readyState === ws.OPEN) ws.send(msg);
  }
}
```

URL 패턴: `/sessions/:id/progress` (기존 `/sessions/:id/attach`와 upgrade handler 분기)

---

## 10. 웹 UI 변경

### 10.1 신규 컴포넌트

**`apps/web/components/step-ready-overlay.tsx`**
```
┌──────────────────────────────────────────────────┐
│  📦 Brainstorm 완료 감지                          │
│  다음 단계(Write plan)로 넘어갈까요?              │
│  [다음 단계로]                  [지금은 괜찮아요] │
└──────────────────────────────────────────────────┘
```
- 터미널 패널 위 절대 위치 오버레이 (backdrop 없음 — 터미널 계속 보임)
- `[다음 단계로]` → 기존 `POST /work-packages/:id/advance`
- `[지금은 괜찮아요]` → dismiss. 같은 stepIndex 재표시 안 함 (in-memory flag)
- 마지막 step이면 `[다음 단계로]` 대신 `[완료로 처리]` → advance 없이 complete API

### 10.2 변경

**`apps/web/hooks/use-progress-socket.ts`** (신규 custom hook)
- `/sessions/:id/progress` WS 연결 관리
- `step_ready` 수신 시 콜백 호출

**`apps/web/components/tabs/terminal-tab.tsx`**
- `useProgressSocket` 마운트
- `step_ready` 수신 → `StepReadyOverlay` 표시

**`apps/web/lib/gateway-client.ts`**
- `sessions.reportProgress` 메서드 추가 (훅이 직접 호출하므로 웹에서는 불필요하나 타입 공유용)

---

## 11. env 주입

게이트웨이가 세션 시작 시 tmux 환경에 추가 (기존 `sessionEnv` 패턴):

```typescript
// apps/gateway/src/routes/sessions.ts
if (cliEntry.name === "claude") {
  sessionEnv.AGENT_DESK_SESSION_ID = String(inserted[0].id);
  sessionEnv.AGENT_DESK_URL        = opts.gatewayUrl;  // "http://127.0.0.1:<port>"
  sessionEnv.AGENT_DESK_TOKEN      = opts.token;
}
```

`opts.gatewayUrl`은 `createServer` 가 서버 bind 후 `http://${opts.bind}:${addr.port}` 로 조립해 sessionRoutes에 전달. `opts.token`은 기존과 동일.

---

## 12. 테스트 전략

| 영역 | 종류 | 위치 |
|------|------|------|
| `ensureProgressHookInstalled` — 신규 설치, idempotent, 기존 설정 보존 | 단위 | `gateway/tests/progress-hook-install.test.ts` |
| `ensureProgressHookRemoved` — 스크립트 삭제, settings 항목만 제거 | 단위 | 동상 |
| `POST /sessions/:id/progress` — filePath 감지, stepReady true/false | 통합 | `gateway/tests/progress.test.ts` |
| active wp 없을 때 recorded:false | 통합 | 동상 |
| WS `step_ready` broadcast — mock ws, broadcastStepReady | 단위 | `gateway/tests/progress-server.test.ts` |
| `work_package_events` kind enum에 hook-file/hook-turn 포함 | 단위 | `shared/tests/schema.test.ts` |
| `StepDefinition.completionArtifactDir` planning 값 검증 | 단위 | `shared/tests/packages.test.ts` |
| `use-progress-socket` — WS connect/disconnect/message | 컴포넌트 | `web/tests/use-progress-socket.test.ts` |
| `StepReadyOverlay` — 렌더, 클릭, dismiss | 컴포넌트 | `web/tests/step-ready-overlay.test.tsx` |

---

## 13. 파일 목록

**신규:**
- `apps/gateway/src/hooks/wp-progress.js` — 배포용 훅 스크립트 원본
- `apps/gateway/src/routes/progress.ts` — `POST /sessions/:id/progress`
- `apps/gateway/src/ws/progress-server.ts` — WS 채널 + broadcast
- `apps/gateway/drizzle/0005_work_package_progress_hooks.sql`
- `apps/gateway/tests/progress.test.ts`
- `apps/gateway/tests/progress-hook-install.test.ts`
- `apps/gateway/tests/progress-server.test.ts`
- `apps/web/hooks/use-progress-socket.ts`
- `apps/web/components/step-ready-overlay.tsx`
- `apps/web/tests/use-progress-socket.test.ts`
- `apps/web/tests/step-ready-overlay.test.tsx`

**변경:**
- `packages/shared/src/packages/types.ts` — `completionArtifactDir` 추가
- `packages/shared/src/packages/definitions/planning.ts` — 각 step에 값 추가
- `packages/shared/src/db/schema.ts` — `work_package_events.kind` enum 확장
- `packages/shared/src/api/work-package.ts` — progress DTO 추가
- `packages/shared/tests/packages.test.ts` — completionArtifactDir 테스트 추가
- `apps/gateway/src/skills/install.ts` — `ensureProgressHookInstalled/Removed` 추가
- `apps/gateway/src/routes/sessions.ts` — `sessionEnv` 에 3개 env 추가
- `apps/gateway/src/routes/workspaces.ts` — 워크스페이스 삭제 시 `ensureProgressHookRemoved` 호출
- `apps/gateway/src/server.ts` — progress 라우트 마운트, WS 핸들러 등록
- `apps/web/lib/gateway-client.ts` — progress WS URL helper
- `apps/web/components/tabs/terminal-tab.tsx` — `useProgressSocket` + `StepReadyOverlay` 연결

---

## 14. 범위 밖 (V2+)

- **Codex 훅:** `apply_patch` diff 파싱으로 file_path 추출 + `.codex/hooks.json` 등록
- **Gemini 훅:** `AfterTool` + `.gemini/settings.json` 등록 (구조는 Claude Code와 유사)
- **Stop hook 기반 완료 감지:** Bash 도구로 파일을 생성하는 경우 PostToolUse가 발동하지 않음. V2에서 Stop hook의 `last_assistant_message`에서 structured marker 추출 방안 검토
- **오버레이 중복 방지 영속화:** 현재는 in-memory flag. 페이지 새로고침 후 재표시 방지는 sessionStorage 활용 검토
- **step 완료 재감지:** 이미 `step_ready`를 dismiss한 후 다시 같은 step에서 새 파일이 생기면 재알림 여부 정책 결정
