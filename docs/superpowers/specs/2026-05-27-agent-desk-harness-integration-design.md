# agent-desk × RevFactory/harness 통합 — Design Spec

**Date:** 2026-05-27
**Status:** Approved (brainstorming 합의 완료)
**Plan:** [plans/2026-05-27-agent-desk-harness-integration.md](../plans/2026-05-27-agent-desk-harness-integration.md)

---

## 1. 문제

agent-desk는 현재 [obra/superpowers](https://github.com/obra/superpowers) 스킬을 vendored 서브모듈로 묶어 워크스페이스 생성/게이트웨이 기동 시 모든 워크스페이스의 `.claude/skills/`로 일괄 symlink 한다. superpowers는 SKILL.md 표준만 사용하므로 claude/codex/gemini 세 CLI 모두에서 portable 하다.

[RevFactory/harness](https://github.com/RevFactory/harness)는 도메인 설명을 받아 멀티-에이전트 팀(`.claude/agents/*`)과 스킬을 자동 생성하는 메타-스킬이다. 그러나 harness 본문은 Claude Code의 Agent Teams API(`TeamCreate`, `SendMessage`, `TaskCreate`, `Agent` w/ `model: "opus"`)에 강결합되어 있어 codex/gemini 세션에서는 동작하지 않으며, 활성화에 추가 조건이 필요하다.

## 2. 외부 요구사항 (검증된 사실)

1. **Claude Max 구독**: Agent Teams는 Max 플랜 전용 실험 기능
2. **환경변수**: `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` 가 Claude Code 세션 시작 시 설정되어야 함
3. **CLI**: Claude Code 전용. codex/gemini 세션에 install 해도 본문 실행 불가

## 3. 설계 결정

### 3.1 활성화 모델 — 워크스페이스 단위 opt-in

| 옵션 | 채택 | 이유 |
|---|---|---|
| 모든 워크스페이스 자동 install | ✗ | codex/gemini 세션에서 슬래시는 보이지만 호출 시 실패 → 사용자 혼란 |
| CLI 타입별 자동 분기 | ✗ | 워크스페이스가 한 CLI에 고정되지 않음 (멀티-CLI 데스크) |
| **워크스페이스 생성 시 체크박스로 opt-in** | ✓ | 사용자 의도가 명확. codex/gemini 워크스페이스 오염 방지 |

`workspaces.harnessEnabled` 컬럼이 진실의 근원(source of truth)이며, 이 값에 따라:
- harness 스킬 symlink 여부
- claude 세션 기동 시 `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` 주입 여부

### 3.2 Vendor 구조

```
agent-desk/vendor/
├── superpowers/                  # 기존 submodule
│   └── skills/<14개 스킬>/
└── harness/                      # 신규 submodule
    └── skills/harness/           # 단일 스킬
```

`vendor/harness/`는 `.gitmodules`에 별도 entry로 추가. `.claude-plugin/plugin.json` 매니페스트는 agent-desk가 플러그인 시스템을 우회해 직접 symlink 하므로 무시.

### 3.3 Installer 분리

기존 `ensureAllSkillsInstalled`는 `vendor/superpowers/skills/`만 본다. 다중 vendor 디렉토리 지원으로 일반화하기보다 **harness 전용 함수**를 추가한다.

이유:
- harness는 단일 스킬이라 디렉토리 스캔 불필요
- "조건부 install" 의미가 함수명에 드러남 (`ensureHarnessInstalled`)
- 기존 superpowers 경로 변경 없음 → 회귀 위험 최소

```typescript
// 신규
export function ensureHarnessInstalled(opts: {
  workspacePath: string;
  vendorHarnessSkillDir?: string;  // default: vendor/harness/skills/harness
}): Promise<EnsureSkillResult>
```

내부적으로는 기존 `ensureSkillInstalled` 호출 (skillName="harness", vendorSkillsDir=vendor/harness/skills). 기존 상태 머신(`installed`/`already_linked`/`exists_external`/`missing_source`/`error`) 그대로 재사용.

### 3.4 Env 주입 메커니즘

`tmux/commands.ts:newSession`은 현재 `env -u <debug-keys> <command>` 로 디버그 변수만 제거한다. `NewSessionInput.env?: Record<string, string>` 옵션을 추가해 셸-quoted `KEY=VAL` 페어를 같은 `env` prefix에 끼워 넣는다.

```bash
# Before
env -u NODE_OPTIONS ... claude ...

# After (harness 워크스페이스 + claude CLI)
env -u NODE_OPTIONS ... CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1 claude ...
```

값에 셸 메타문자가 들어오면 `shellEscape` 적용. 키는 영숫자+언더스코어만 허용.

### 3.5 세션 라우트의 결정 로직

```
session 생성 요청 도착
└─ cli == "claude" ?
   ├─ no → 기존 그대로 (env 없음)
   └─ yes
      └─ workspace.harnessEnabled ?
         ├─ no → 기존 그대로
         └─ yes → env에 CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1 추가
```

codex/gemini 워크스페이스에서 `harnessEnabled=1`인 경우는 발생할 수 있으나(사용자가 의도적으로 켰을 수도, 추후 CLI 추가 가능성), env는 *cli=claude일 때만* 주입한다. harness symlink는 모든 세션에서 보이지만 다른 CLI에서는 무력화됨 — 이건 사용자가 명시적으로 켠 결과이므로 수용.

### 3.6 UI

`workspace-form.tsx`에 체크박스 추가:

```
[ ] harness 활성화 (Claude Code 전용)
    ↳ Claude Max 구독 + Agent Teams 실험 기능 필요.
    ↳ codex / gemini 세션에서는 동작하지 않습니다.
```

기본값 unchecked. 워크스페이스 생성 후 토글 UI는 V1 범위 밖 (DB 컬럼은 이미 있으므로 PATCH 엔드포인트만 추가하면 됨 — 향후 작업).

## 4. API 변경

### `POST /workspaces` 요청

```diff
 {
   "name": "my-project",
-  "path": "/workspaces/my-project"
+  "path": "/workspaces/my-project",
+  "harnessEnabled": false    // optional, default false
 }
```

### `WorkspaceDto` 응답

```diff
 {
   "id": 1,
   "name": "my-project",
   "path": "/workspaces/my-project",
   "createdAt": 1764000000000,
-  "deletedAt": null
+  "deletedAt": null,
+  "harnessEnabled": false
 }
```

### `POST /sessions`

요청 스키마 변경 없음. 내부 동작만 변경:
- 워크스페이스 조회 시 `harnessEnabled` 함께 조회
- `cli=="claude" && harnessEnabled` → tmux `newSession`에 `env: { CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: "1" }` 전달

## 5. DB 마이그레이션

```sql
ALTER TABLE workspaces ADD harness_enabled INTEGER NOT NULL DEFAULT 0;
```

기존 워크스페이스는 모두 `harness_enabled=0` 으로 초기화 → 무 동작 변화. drizzle-kit으로 마이그레이션 생성 (다음 번호 `0003_*.sql`).

## 6. 테스트 전략

| 영역 | 테스트 종류 | 위치 |
|---|---|---|
| Installer (harness 변형) | 단위 — 5가지 상태 머신 재검증 | `apps/gateway/tests/skills-install.test.ts` |
| Workspace 생성 + harness=true | 통합 — POST 후 harness symlink 존재 확인 | `apps/gateway/tests/workspaces.test.ts` |
| Workspace 생성 + harness=false | 통합 — POST 후 harness symlink 없음 | `apps/gateway/tests/workspaces.test.ts` |
| Tmux env injection | 단위 — env 옵션이 명령에 반영 | `apps/gateway/tests/tmux-commands.test.ts` |
| Session create + harness ws + claude | 통합 — newSession 호출에 env 포함 | `apps/gateway/tests/sessions.test.ts` |
| Session create + harness ws + codex | 통합 — newSession 호출에 env 없음 | `apps/gateway/tests/sessions.test.ts` |
| Web UI | 컴포넌트 — checkbox state, payload 포함 | `apps/web/tests/workspace-form.test.tsx` (신규) |

## 7. 범위 밖 (Out of Scope)

- 생성 후 harness on/off 토글 UI (DB 컬럼은 이미 지원, PATCH endpoint 향후 추가)
- harness 자체 설정 (Agent Teams 패턴 선택 등) — harness 스킬 본문이 대화로 처리
- Claude Max 구독 자동 감지 — 안내만 표시, 검증은 Claude CLI 측 책임
- gemini/codex 환경에서도 동작하도록 harness 본문 수정 — RevFactory upstream 작업

## 8. 마이그레이션 / 롤백

- 마이그레이션: drizzle-kit이 idempotent ALTER 생성. 기본값 0 → 기존 동작 보존
- 롤백: `harness_enabled` 컬럼 drop 마이그레이션 + 코드 revert. 데이터 손실 없음 (컬럼만 추가됨)
- vendor 제거: submodule deinit + `.gitmodules` 엔트리 제거 + 코드 revert
