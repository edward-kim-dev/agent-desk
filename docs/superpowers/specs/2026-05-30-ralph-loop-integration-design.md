# Ralph Loop Integration — Design Spec

**Date:** 2026-05-30
**Status:** Approved
**Plan:** (TBD — writing-plans 단계에서 작성)

---

## 1. 문제

`anthropics/claude-code/plugins/ralph-wiggum`의 "Ralph Wiggum" 기법(동일 프롬프트를 세션이 종료하려고 할 때마다 재주입해 반복 정제)을 agent-desk 워크스페이스에서 옵션으로 활성화하고 싶다. 원본은 Claude Code 플러그인이지만, 우리는 이것을 **agent-desk가 vendoring하고 워크스페이스 단위로 install/remove하는 일급 구성요소**로 둔다. 기존 `harnessEnabled` 토글과 동일한 운영 모델을 따른다.

### 목표

1. 워크스페이스 생성/수정 시 `ralphLoopEnabled` 플래그로 켜고 끄게 한다.
2. 활성 워크스페이스에서 세션을 띄우면 `/ralph-loop`, `/cancel-ralph`, `/ralph-help` 슬래시 명령과 stop hook이 자동 설치되어 즉시 사용 가능하다.
3. **운영 위험을 사용자에게 분명히 노출한다** — 세션이 강제 반복되고, `/quit`이 무력화된다는 사실을 워크스페이스 폼에서 강한 시각적 경고로 알린다.
4. wp-progress Stop hook과 공존한다(둘 다 Stop 배열에 등록되어 순차 실행).

### 비목표 (YAGNI)

- **Codex/Gemini 지원**: Ralph의 핵심 메커니즘(Stop hook이 `{"decision":"block","reason":"<prompt>"}` JSON을 stdout으로 반환해 세션 재진입을 강제)은 Claude Code hook 컨트랙트 전용이다. Codex/Gemini에는 동등 메커니즘이 없으므로 명시적으로 비지원으로 둔다. 폼/SKILL 메타에 "Claude Code only"를 적시.
- **per-package / per-session 토글**: workspace 단위 토글 하나로 끝. 워크 패키지 정의에 `loopable` 필드를 추가하거나 세션 시작 시 별도 옵션을 두는 것은 범위 밖.
- **외부 루프 러너**: host 프로세스가 `codex`를 N번 재실행해 Ralph 효과를 흉내내는 cross-CLI 구현은 범위 밖.
- **Upstream auto-bump**: vendor 스냅샷은 수동 갱신. 자동 동기화 스크립트는 만들지 않는다.

---

## 2. Claude 전용성 / Codex 가능성 평가 (참고)

| 구성요소 | 종속성 | Codex 이식 가능? |
|---|---|---|
| 슬래시 명령 (`/ralph-loop`, `/cancel-ralph`, `/ralph-help`) | `${CLAUDE_PLUGIN_ROOT}`, `$ARGUMENTS`, `allowed-tools` frontmatter | 인터페이스는 SKILL.md 표준으로 portable. 명령 자체는 호출 가능 |
| `setup-ralph-loop.sh` (상태파일 생성) | 순수 bash. CLI 의존성 없음 | 그대로 동작 |
| **stop hook (`decision:block` 재주입)** | Claude Code hook 컨트랙트 전용 (transcript 경로 hook 입력 JSON으로 받음, stdout JSON으로 세션 종료 차단) | **불가능** — Codex hook 시스템에는 세션 종료를 가로채 같은 컨텍스트로 재시작시키는 동등 메커니즘 없음 |

결론: 슬래시 명령 표면은 portable하지만 **루프 자체는 Claude Code 전용**. 워크스페이스 플래그를 켠 채 codex/gemini 세션을 띄우면 `/ralph-loop`를 실행해도 stop hook이 발동하지 않아 한 번에 종료된다. 상태파일은 남으므로 `/cancel-ralph`로 정리 가능. 블로킹 에러 없이 우아하게 일회용으로 떨어지는 그림.

---

## 3. Vendor 스냅샷

업스트림(`https://raw.githubusercontent.com/anthropics/claude-code/main/plugins/ralph-wiggum/`)을 한 번 스냅샷해 다음 위치에 커밋한다.

```
agent-desk/vendor/ralph-wiggum/
├── commands/
│   ├── ralph-loop.md      # 원본 그대로, ${CLAUDE_PLUGIN_ROOT} 토큰 보존
│   ├── cancel-ralph.md    # 원본 그대로
│   └── help.md            # 원본 그대로 — install 시 ralph-help.md 로 rename
├── scripts/
│   └── setup-ralph-loop.sh
├── hooks/
│   └── stop-hook.sh
└── UPSTREAM.txt           # 출처 commit SHA + fetch 날짜 기록
```

`${CLAUDE_PLUGIN_ROOT}` 치환은 **install 시점에만** 수행한다 — vendor는 깨끗하게 유지해서 upstream bump를 (cherry-pick 또는 단순 재snapshot으로) 쉽게.

### 3.1 vendor 디렉토리가 superpowers/harness 와 분리되는 이유

- `vendor/superpowers/skills/<name>/`은 SKILL.md 모양(스킬 디렉토리)을 단순 symlink로 워크스페이스에 노출하는 패턴.
- `vendor/harness/skills/harness/`도 SKILL.md 단일 스킬 symlink 패턴.
- Ralph는 **commands + script + hook**으로 구성되며 SKILL.md 형태가 아니다. 설치 동작도 symlink가 아니라 (a) 파일 복사 + 경로 patch, (b) settings.json hook 등록을 함께 수행해야 한다.
- 따라서 vendor 위치를 superpowers/harness와 분리(`vendor/ralph-wiggum/`)하고, installer도 별도 함수로 둔다.

---

## 4. Installer

### 4.1 시그니처

`apps/gateway/src/skills/install.ts`에 다음 두 함수를 추가한다. 시그니처는 기존 `ensureProgressHookInstalled` / `ensureProgressHookRemoved`와 동형.

```ts
export async function ensureRalphLoopInstalled(workspacePath: string): Promise<void>
export async function ensureRalphLoopRemoved(workspacePath: string): Promise<void>
```

기본 vendor 경로는 `defaultVendorRalphDir()` 헬퍼로 결정한다 — `AGENT_DESK_RALPH_VENDOR_DIR` 환경변수로 override 가능 (테스트 친화성, harness/skills와 동일한 패턴).

### 4.2 `ensureRalphLoopInstalled` 동작

1. **commands 복사**:
   - `vendor/ralph-wiggum/commands/ralph-loop.md` → `<ws>/.claude/commands/ralph-loop.md`
     - 본문 내 `${CLAUDE_PLUGIN_ROOT}/scripts/setup-ralph-loop.sh` 문자열을 `<ws>/.claude/scripts/ralph-setup.sh` 절대경로로 치환
   - `vendor/ralph-wiggum/commands/cancel-ralph.md` → `<ws>/.claude/commands/cancel-ralph.md` (그대로 복사)
   - `vendor/ralph-wiggum/commands/help.md` → `<ws>/.claude/commands/ralph-help.md` (이름만 rename)
2. **scripts 복사 + chmod +x**:
   - `vendor/ralph-wiggum/scripts/setup-ralph-loop.sh` → `<ws>/.claude/scripts/ralph-setup.sh`
3. **hooks 복사 + chmod +x**:
   - `vendor/ralph-wiggum/hooks/stop-hook.sh` → `<ws>/.claude/hooks/ralph-stop-hook.sh`
4. **settings.json Stop 배열에 idempotent push**:
   - `command` 문자열이 `ralph-stop-hook.sh`로 끝나는 entry가 이미 있으면 no-op
   - 없으면 `{ hooks: [{ type: "command", command: "<ws>/.claude/hooks/ralph-stop-hook.sh" }] }` push
   - 기존 `ensureProgressHookInstalled`의 `isWpHookEntry` 패턴과 동형의 `isRalphHookEntry` 사용

### 4.3 `ensureRalphLoopRemoved` 동작

우리가 install한 5개 파일(`commands/ralph-loop.md`, `commands/cancel-ralph.md`, `commands/ralph-help.md`, `scripts/ralph-setup.sh`, `hooks/ralph-stop-hook.sh`)을 알려진 이름으로 unlink. 사용자가 동일 경로에 직접 작성한 파일을 덮어쓸 가능성은 harness ON/OFF UX와 동일한 수준의 트레이드오프로 수용. (해시 매니페스트는 만들지 않음 — YAGNI)

settings.json에서 `isRalphHookEntry`로 식별되는 Stop entry 제거. 다른 Stop entry(wp-progress 등)는 보존.

### 4.4 멱등성

설치/제거 모두 멱등이어야 한다 — 이미 설치된 워크스페이스에 install을 두 번 호출해도 동일 상태, 미설치 워크스페이스에 remove를 호출해도 안전한 no-op.

---

## 5. 라우트 분기

`apps/gateway/src/routes/workspaces.ts`의 `POST /` + `PATCH /:id` 두 곳에 harness 분기 옆으로 한 블록 더 추가.

```ts
// POST / (생성)
if (parsed.data.ralphLoopEnabled) {
  try { await ensureRalphLoop({ workspacePath: inserted[0].path }); }
  catch (err) { console.warn("[workspaces] ralph-loop install failed:", err); }
}

// PATCH /:id (토글)
if (parsed.data.ralphLoopEnabled) {
  try { await ensureRalphLoop({ workspacePath: updated[0].path }); }
  catch (err) { console.warn("[workspaces] ralph-loop install on update failed:", err); }
} else {
  try { await ensureRalphLoopGone({ workspacePath: updated[0].path }); }
  catch (err) { console.warn("[workspaces] ralph-loop remove on update failed:", err); }
}
```

fail-soft: install 실패가 워크스페이스 생성/수정 자체를 막지 않는다. harness와 동일.

테스트 친화성을 위해 `workspaceRoutes` opts에 `ensureRalphLoopFn?: typeof ensureRalphLoopInstalled`, `ensureRalphLoopRemovedFn?: typeof ensureRalphLoopRemoved` 두 override를 추가.

---

## 6. 스키마 + DB

### 6.1 zod (`packages/shared/src/api/workspace.ts`)

```ts
export const createWorkspaceRequest = z.object({
  name: z.string().min(1).max(120),
  path: z.string().startsWith("/"),
  harnessEnabled: z.boolean().optional().default(false),
  ralphLoopEnabled: z.boolean().optional().default(false),    // 추가
});

export const updateWorkspaceRequest = z.object({
  harnessEnabled: z.boolean(),
  ralphLoopEnabled: z.boolean(),                              // 추가
});

export const workspaceDto = z.object({
  id: z.number().int(),
  name: z.string(),
  path: z.string(),
  createdAt: z.number().int(),
  deletedAt: z.number().int().nullable(),
  harnessEnabled: z.boolean(),
  ralphLoopEnabled: z.boolean(),                              // 추가
});
```

### 6.2 DB 마이그레이션 (drizzle)

`workspaces` 테이블에 `ralphLoopEnabled` 컬럼 추가:
```sql
ALTER TABLE workspaces ADD COLUMN ralph_loop_enabled INTEGER NOT NULL DEFAULT 0;
```
스키마 정의(`apps/gateway/src/db/schema.ts`)에 `ralphLoopEnabled: integer("ralph_loop_enabled").notNull().default(0)` 추가. 기존 행은 default `0`으로 자동 backfill.

### 6.3 `PATCH` DTO 호환성

기존 `PATCH /workspaces/:id`는 `{ harnessEnabled: boolean }`만 받는다. 이제 두 필드를 모두 요구하도록 zod 정의를 확장할 것이므로 — **PATCH 호출자(웹 UI)도 두 필드를 함께 보내도록 동시에 변경**해야 한다. 부분 patch를 허용하려면 두 필드 모두 `.optional()`로 만들어야 하지만, 현 UX(워크스페이스 설정 폼에서 한 번에 두 토글을 보고 저장)에서는 굳이 부분 patch 필요 없음. 둘 다 boolean 필수.

---

## 7. UI — 워크스페이스 폼

`apps/web/components/workspace-form.tsx`에 ralph-loop 체크박스와 강화된 경고박스를 추가한다.

### 7.1 시각적 위계

- 체크박스 라벨에 "(Claude Code 전용 · **위험**)" 명시 — 클릭 전에도 경고 시그널
- **체크되었을 때만** amber border + amber 배경의 경고박스를 펼침. 미체크 상태는 muted 회색 한 줄 헬프텍스트
- 경고박스에 담을 사실 3가지:
  1. 세션이 매 종료마다 자동 재진입 — Claude 종료 버튼·`/quit` 무력화
  2. 탈출 경로 두 가지: `/cancel-ralph` 호출 또는 `<promise>` 일치 출력
  3. `--max-iterations N` 없이 시작하면 **무한 루프 + 무제한 토큰 소비**
- codex/gemini 미지원은 기존 harness 경고와 같은 톤으로 한 줄 추가

### 7.2 마크업 (요약)

```tsx
<div className="flex flex-col gap-1">
  <label className="flex items-center gap-2 text-[13px]" htmlFor={ralphId}>
    <input id={ralphId} type="checkbox" checked={ralphLoopEnabled}
           onChange={(e) => setRalphLoopEnabled(e.target.checked)} />
    <span>ralph-loop 활성화 (Claude Code 전용 · 위험)</span>
  </label>
  {ralphLoopEnabled ? (
    <div role="alert"
         className="ml-6 border-l-2 border-amber-500 bg-amber-50 px-3 py-2 text-[12px] leading-relaxed">
      <p className="font-medium text-amber-900">⚠ 세션이 강제로 반복됩니다.</p>
      <p className="mt-1 text-amber-900">
        세션에서 <code>/ralph-loop &lt;프롬프트&gt;</code> 실행 시 매 종료마다 같은 프롬프트로 재진입하며,
        <strong> <code>/cancel-ralph</code> 호출 또는 <code>&lt;promise&gt;</code> 일치 출력 전까지 멈추지 않습니다.</strong>
        Claude 종료 버튼·<code>/quit</code>도 무력화됩니다.
      </p>
      <p className="mt-1 text-amber-900">
        <code>--max-iterations N</code> 없이 시작하면 <strong>무한 루프 + 무제한 토큰 소비</strong>입니다.
        codex / gemini 세션에서는 동작하지 않습니다.
      </p>
    </div>
  ) : (
    <p className="ml-6 text-[12px] text-[var(--hill-muted)]">
      세션에서 <code>/ralph-loop</code> 슬래시 명령을 사용 가능하게 만듭니다. 체크 시 위험 안내가 표시됩니다.
    </p>
  )}
</div>
```

### 7.3 gateway-client SDK

`apps/web/lib/gateway-client.ts`(또는 등가 위치)의 workspace create/patch 호출 타입에 `ralphLoopEnabled: boolean` 필드 추가. zod schema가 single source of truth이므로 자동으로 흐름.

### 7.4 settings 서브뷰

워크스페이스 목록 / 설정 서브뷰(`workspaces-subview.tsx`)에서 토글을 노출하는 경우도 동일한 경고 컴포넌트를 재사용. 경고 박스를 별도 컴포넌트(`<RalphWarningBox />`)로 추출하면 폼/서브뷰 두 곳에서 공유.

---

## 8. 공존성 — wp-progress Stop hook

wp-progress.js Stop hook과 ralph-stop-hook.sh는 **둘 다** settings.json `Stop` 배열에 별개 entry로 등록된다. Claude는 Stop 배열의 모든 entry를 순차 실행한다.

- wp-progress: progress 이벤트를 게이트웨이로 발사 후 정상 종료 (block 안 함)
- ralph-stop-hook.sh: `.claude/ralph-loop.local.md` 상태파일이 **있을 때만** `decision:block` JSON 반환. 상태파일이 없으면 즉시 no-op로 빠짐

따라서:
- 워크스페이스에 ralph-loop가 install되어 있어도, 사용자가 `/ralph-loop`를 실행하지 않으면 stop hook은 dormant (no-op). 일반 세션 종료에 영향 없음.
- `/ralph-loop` 실행 후에는 매 iteration마다 wp-progress가 진척 이벤트를 보고하는 **부수효과** = work-package 진행 추적에 자연스럽게 연동되는 보너스 UX.

---

## 9. 테스트

신규/수정 테스트:

- `apps/gateway/tests/skills/install.test.ts` (또는 신규 파일):
  - `ensureRalphLoopInstalled` 가 4개 파일 모두 복사·patch·chmod 하는지
  - `${CLAUDE_PLUGIN_ROOT}` 절대경로 치환 검증
  - Stop 배열에 idempotent push (두 번 호출해도 entry 1개)
  - wp-progress Stop entry가 이미 있을 때 ralph entry가 추가됨 (배열 길이 +1, wp 보존)
  - `ensureRalphLoopRemoved` 가 우리 파일만 지우고 wp-progress 등 다른 entry 보존
  - chmod +x 확인 (stat 모드 비트)
- `apps/gateway/tests/routes/workspaces.test.ts` (또는 등가):
  - POST `/workspaces` with `ralphLoopEnabled: true` → `ensureRalphLoopFn` 호출
  - PATCH `/workspaces/:id` 토글 ON → install 호출, OFF → remove 호출
  - install 실패가 워크스페이스 생성/수정 응답을 막지 않음 (fail-soft)
- `apps/web/tests/workspace-form.test.tsx`:
  - 체크박스 미체크: muted 한 줄 헬프텍스트만 노출
  - 체크 시: amber 경고박스 노출, 핵심 키워드 3개(`/cancel-ralph`, `<promise>`, `--max-iterations`) 모두 포함
  - submit payload에 `ralphLoopEnabled: true` 포함

---

## 10. 마이그레이션 / 롤아웃 노트

- 새 컬럼 default 0이므로 기존 워크스페이스는 자동으로 ralph-loop 비활성 상태가 된다.
- 게이트웨이 기동 시 `ensureAllSkillsInstalled` 가 모든 워크스페이스를 순회하는 기존 경로에는 ralph-loop를 **추가하지 않는다** — 명시적 opt-in만 install. (harness와 같은 정책)
- 사용자가 워크스페이스 폼에서 ralph-loop를 켰다가 끄면 우리 파일과 Stop entry는 깨끗이 제거된다. 사용자가 동일 이름 파일을 직접 작성한 경우 손상 가능성은 wp-progress install/remove와 동일한 수준의 트레이드오프로 수용.

---

## 11. 미해결 / 향후 검토

- **Upstream drift**: anthropics가 ralph-wiggum 플러그인 본문을 바꿀 경우 `vendor/ralph-wiggum/`을 수동 재snapshot해야 한다. `UPSTREAM.txt`에 commit SHA를 기록해 diff 비교를 쉽게.
- **세션 헤더 배지**: Ralph 활성 워크스페이스에서 세션을 띄울 때 "🔁 ralph-loop ready" 같은 한 줄 시각 표시를 두는 것을 후속 작은 PR로 검토 (현 범위에서는 제외).
- **per-package loop policy**: 워크 패키지 정의에 `loopable: true` 같은 필드를 두고 그런 패키지에서만 자동으로 `/ralph-loop`을 시작하는 그림은 별도 디자인.
