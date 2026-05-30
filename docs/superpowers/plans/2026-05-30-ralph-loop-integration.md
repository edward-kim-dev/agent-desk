# Ralph Loop 통합 — 구현 계획

> **에이전트 워커용:** 필수 서브 스킬 — superpowers:subagent-driven-development (권장) 또는 superpowers:executing-plans 을 사용해 Task 단위로 실행한다. 단계는 체크박스(`- [ ]`) 문법으로 추적한다.

**목표:** anthropics 의 ralph-wiggum 플러그인을 agent-desk 에 vendoring 하고, 워크스페이스 단위 opt-in 플래그(`ralphLoopEnabled`)로 노출한다. 강한 경고 UX 포함. 기존 `harnessEnabled` 패턴을 그대로 거울에 비춘다.

**아키텍처:** (1) upstream Ralph 파일을 `vendor/ralph-wiggum/` 에 스냅샷. (2) `ralphLoopEnabled` boolean 컬럼 + zod 필드 추가. (3) `ensureProgressHookInstalled` 패턴을 본떠 `ensureRalphLoopInstalled` / `ensureRalphLoopRemoved` 추가. (4) workspace POST/PATCH 라우트에 fail-soft 로 연결. (5) `RalphWarningBox` 컴포넌트 추출 → `workspace-form.tsx` 및 `workspaces-subview.tsx` 의 Edit 폼에 통합. Stop hook 은 wp-progress 와 공존(순차 실행).

**Tech Stack:** TypeScript, vitest, drizzle-orm (better-sqlite3), Hono, Next.js + Tailwind, React Testing Library.

**커밋 정책: 실행 중 커밋 금지.** 모든 커밋은 사용자가 전체 diff 를 검토한 뒤 한 번에 정리해서 수행한다. `agent-desk/CLAUDE.md` 의 "사용자 검토 후 한 번에 모듈 단위로 정리해서 commit" 원칙 그대로. Phase F 에서 변경을 커밋 그룹으로 정리만 하고 멈춘다.

---

## 파일 구조

**새 파일:**
- `agent-desk/vendor/ralph-wiggum/commands/ralph-loop.md` — upstream 스냅샷, 무수정
- `agent-desk/vendor/ralph-wiggum/commands/cancel-ralph.md` — upstream 스냅샷, 무수정
- `agent-desk/vendor/ralph-wiggum/commands/help.md` — upstream 스냅샷, 무수정
- `agent-desk/vendor/ralph-wiggum/scripts/setup-ralph-loop.sh` — upstream 스냅샷, 무수정
- `agent-desk/vendor/ralph-wiggum/hooks/stop-hook.sh` — upstream 스냅샷, 무수정
- `agent-desk/vendor/ralph-wiggum/UPSTREAM.txt` — 출처 SHA + fetch 일시
- `agent-desk/vendor/ralph-wiggum/bump.sh` — upstream 재동기화 스크립트 (호환성 검증 포함)
- `agent-desk/vendor/ralph-wiggum/README.md` — vendor 설명 + bump 절차 runbook
- `agent-desk/apps/gateway/tests/ralph-loop-install.test.ts` — installer 단위 테스트
- `agent-desk/apps/web/components/ralph-warning-box.tsx` — 공용 경고 컴포넌트

**수정 파일:**
- `agent-desk/packages/shared/src/api/workspace.ts` — zod 3개 스키마에 `ralphLoopEnabled` 추가
- `agent-desk/packages/shared/src/db/schema.ts` — `workspaces` 테이블에 `ralphLoopEnabled` 컬럼 추가
- `agent-desk/apps/gateway/drizzle/<auto>.sql` + `meta/_journal.json` + `meta/<auto>_snapshot.json` — drizzle-kit 자동 생성
- `agent-desk/apps/gateway/src/skills/install.ts` — 2개 함수 추가
- `agent-desk/apps/gateway/src/routes/workspaces.ts` — POST/PATCH 에 installer 연결
- `agent-desk/apps/gateway/src/server.ts` — `ensureRalphLoopFn` / `ensureRalphLoopRemovedFn` 주입 수신
- `agent-desk/apps/gateway/tests/workspaces.test.ts` — ralph install/remove 호출 검증
- `agent-desk/apps/web/components/workspace-form.tsx` — 체크박스 + RalphWarningBox
- `agent-desk/apps/web/components/tabs/settings/workspaces-subview.tsx` — Edit 폼 토글 + 뱃지
- `agent-desk/apps/web/lib/gateway-client.ts` — 타입은 zod 에서 자동 흐름(변경 불필요; 검증만)
- `agent-desk/apps/web/tests/workspace-form.test.tsx` — 신규 assertion
- `agent-desk/apps/web/tests/workspaces-subview.test.tsx` — 시그니처 확장
- `agent-desk/apps/web/tests/workspace-switcher.test.tsx` — fixture 보강
- `agent-desk/apps/web/tests/app-header.test.tsx` — fixture 보강

---

## Phase A — Vendor 스냅샷

### Task A1: upstream ralph-wiggum 을 vendor/ 에 스냅샷

**파일:**
- 생성: `agent-desk/vendor/ralph-wiggum/commands/ralph-loop.md`
- 생성: `agent-desk/vendor/ralph-wiggum/commands/cancel-ralph.md`
- 생성: `agent-desk/vendor/ralph-wiggum/commands/help.md`
- 생성: `agent-desk/vendor/ralph-wiggum/scripts/setup-ralph-loop.sh`
- 생성: `agent-desk/vendor/ralph-wiggum/hooks/stop-hook.sh`
- 생성: `agent-desk/vendor/ralph-wiggum/UPSTREAM.txt`

- [ ] **Step 1: vendor 디렉토리 생성**

```bash
mkdir -p agent-desk/vendor/ralph-wiggum/{commands,scripts,hooks}
```

- [ ] **Step 2: upstream 파일 내려받기 (현재 main)**

```bash
RAW="https://raw.githubusercontent.com/anthropics/claude-code/main/plugins/ralph-wiggum"
cd agent-desk/vendor/ralph-wiggum
curl -fsSL "$RAW/commands/ralph-loop.md"      -o commands/ralph-loop.md
curl -fsSL "$RAW/commands/cancel-ralph.md"    -o commands/cancel-ralph.md
curl -fsSL "$RAW/commands/help.md"            -o commands/help.md
curl -fsSL "$RAW/scripts/setup-ralph-loop.sh" -o scripts/setup-ralph-loop.sh
curl -fsSL "$RAW/hooks/stop-hook.sh"          -o hooks/stop-hook.sh
```

- [ ] **Step 3: 출처 기록**

GitHub API 로 upstream commit SHA 확보:
```bash
SHA=$(curl -fsSL "https://api.github.com/repos/anthropics/claude-code/commits/main?path=plugins/ralph-wiggum" | grep -m1 '"sha"' | sed -E 's/.*"sha": *"([^"]+)".*/\1/')
FETCHED=$(date -u +%Y-%m-%dT%H:%M:%SZ)
```

`agent-desk/vendor/ralph-wiggum/UPSTREAM.txt` 작성:
```
source: anthropics/claude-code:plugins/ralph-wiggum
commit: <위에서 얻은 SHA>
fetched: <위에서 얻은 FETCHED>
notes: Vendor snapshot. ${CLAUDE_PLUGIN_ROOT} 토큰은 보존되며, install 시점에
워크스페이스의 절대경로로 patch 된다. 이 스냅샷은 upstream 기준 read-only —
in-place 수정 금지. Bump 하려면 vendor/ralph-wiggum/bump.sh 를 실행 (Task A2 참조).
```

- [ ] **Step 4: 파일 개수 + 존재 확인**

실행:
```bash
find agent-desk/vendor/ralph-wiggum -type f | sort
```

기대 출력 (6개):
```
agent-desk/vendor/ralph-wiggum/UPSTREAM.txt
agent-desk/vendor/ralph-wiggum/commands/cancel-ralph.md
agent-desk/vendor/ralph-wiggum/commands/help.md
agent-desk/vendor/ralph-wiggum/commands/ralph-loop.md
agent-desk/vendor/ralph-wiggum/hooks/stop-hook.sh
agent-desk/vendor/ralph-wiggum/scripts/setup-ralph-loop.sh
```

- [ ] **Step 5: `${CLAUDE_PLUGIN_ROOT}` 가 ralph-loop.md 에만 있는지 sanity check**

실행:
```bash
grep -l 'CLAUDE_PLUGIN_ROOT' agent-desk/vendor/ralph-wiggum/commands/*.md
```

기대: `.../commands/ralph-loop.md` 한 줄만 출력. `cancel-ralph.md` 나 `help.md` 가 함께 나오면 upstream 이 변형된 것 — 스펙 §4.2 patching 로직을 재검토.

---

### Task A2: upstream bump 스크립트 + runbook 작성

**파일:**
- 생성: `agent-desk/vendor/ralph-wiggum/bump.sh`
- 생성: `agent-desk/vendor/ralph-wiggum/README.md`

배경 — Task A1 의 최초 스냅샷은 한 번이지만 upstream 은 갱신된다. installer 의 `replaceAll("${CLAUDE_PLUGIN_ROOT}/scripts/setup-ralph-loop.sh", ...)` 는 upstream 의 정확한 prefix 문자열에 의존하므로 token 이 바뀌면 patch 가 silent fail 한다. bump 스크립트가 이 호환성을 매번 검증하고, README 가 사람이 해야 할 후속 단계를 안내한다.

- [ ] **Step 1: `vendor/ralph-wiggum/bump.sh` 작성**

`agent-desk/vendor/ralph-wiggum/bump.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
# upstream ralph-wiggum 을 재동기화하고 UPSTREAM.txt 를 갱신.
# 어디서 실행해도 OK — VENDOR_DIR 는 스크립트 위치 기준으로 해석.

VENDOR_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RAW="https://raw.githubusercontent.com/anthropics/claude-code/main/plugins/ralph-wiggum"
API="https://api.github.com/repos/anthropics/claude-code/commits/main?path=plugins/ralph-wiggum"
PATCH_TOKEN='${CLAUDE_PLUGIN_ROOT}/scripts/setup-ralph-loop.sh'

echo "[1/4] upstream 파일 내려받기…"
curl -fsSL "$RAW/commands/ralph-loop.md"      -o "$VENDOR_DIR/commands/ralph-loop.md"
curl -fsSL "$RAW/commands/cancel-ralph.md"    -o "$VENDOR_DIR/commands/cancel-ralph.md"
curl -fsSL "$RAW/commands/help.md"            -o "$VENDOR_DIR/commands/help.md"
curl -fsSL "$RAW/scripts/setup-ralph-loop.sh" -o "$VENDOR_DIR/scripts/setup-ralph-loop.sh"
curl -fsSL "$RAW/hooks/stop-hook.sh"          -o "$VENDOR_DIR/hooks/stop-hook.sh"

echo "[2/4] upstream commit SHA 확보…"
SHA=$(curl -fsSL "$API" | grep -m1 '"sha"' | sed -E 's/.*"sha": *"([^"]+)".*/\1/')
FETCHED=$(date -u +%Y-%m-%dT%H:%M:%SZ)
if [[ -z "$SHA" ]]; then
  echo "✗ SHA 추출 실패. UPSTREAM.txt 미갱신." >&2
  exit 1
fi
cat > "$VENDOR_DIR/UPSTREAM.txt" <<EOF
source: anthropics/claude-code:plugins/ralph-wiggum
commit: $SHA
fetched: $FETCHED
notes: Vendor snapshot. \${CLAUDE_PLUGIN_ROOT} 토큰은 보존되며, install 시점에
워크스페이스의 절대경로로 patch 된다. 이 스냅샷은 upstream 기준 read-only —
in-place 수정 금지. Bump 하려면 vendor/ralph-wiggum/bump.sh 를 재실행한다.
EOF
echo "    SHA=$SHA"
echo "    fetched=$FETCHED"

echo "[3/4] patch 토큰 호환성 검증…"
if ! grep -qF "$PATCH_TOKEN" "$VENDOR_DIR/commands/ralph-loop.md"; then
  echo "✗ 호환성 깨짐: ralph-loop.md 에 '$PATCH_TOKEN' 가 없음." >&2
  echo "  installer 의 replaceAll() 매칭 문자열이 더 이상 적용되지 않습니다." >&2
  echo "  upstream 이 token 구조를 바꿨는지 확인하고, apps/gateway/src/skills/install.ts 의" >&2
  echo "  ensureRalphLoopInstalled patch 로직을 함께 갱신해야 합니다." >&2
  exit 2
fi
for f in cancel-ralph.md help.md; do
  if grep -qF 'CLAUDE_PLUGIN_ROOT' "$VENDOR_DIR/commands/$f"; then
    echo "⚠ 주의: commands/$f 에 새로 \${CLAUDE_PLUGIN_ROOT} 가 등장." >&2
    echo "  installer 가 이 파일은 patch 하지 않으므로 추가 검토 필요." >&2
  fi
done

echo "[4/4] 다음 단계 안내"
echo
echo "  1. git diff vendor/ralph-wiggum/ 로 변경 검토"
echo "  2. pnpm --filter @agent-desk/gateway test -- ralph-loop-install"
echo "  3. 변경이 OK 면 vendor (+ 필요시 installer) 한 커밋으로 정리 (CLAUDE.md 정책)"
echo
echo "✅ bump 완료."
```

- [ ] **Step 2: 실행권한 부여**

```bash
chmod +x agent-desk/vendor/ralph-wiggum/bump.sh
```

- [ ] **Step 3: `vendor/ralph-wiggum/README.md` 작성**

`agent-desk/vendor/ralph-wiggum/README.md`:

```md
# vendor/ralph-wiggum

anthropics/claude-code 의 `plugins/ralph-wiggum` 을 agent-desk 가 vendoring 한 스냅샷.

설치는 `apps/gateway/src/skills/install.ts` 의 `ensureRalphLoopInstalled` /
`ensureRalphLoopRemoved` 가 다룬다. 워크스페이스의 `ralphLoopEnabled` 플래그가
켜질 때만 install.

## Upstream Bump

upstream 변경을 들여오려면:

\`\`\`bash
bash agent-desk/vendor/ralph-wiggum/bump.sh
\`\`\`

이 스크립트가 하는 일:
1. 5개 파일을 upstream main 에서 재다운로드 (덮어쓰기)
2. UPSTREAM.txt 의 commit SHA + fetched 일시 갱신
3. `${CLAUDE_PLUGIN_ROOT}/scripts/setup-ralph-loop.sh` 토큰이 ralph-loop.md 에
   그대로 있는지 검증 — 없으면 exit 2 (installer patch 로직이 silent fail 할 위험)
4. cancel-ralph.md / help.md 에 새로 `${CLAUDE_PLUGIN_ROOT}` 가 등장했는지 경고

스크립트 실행 후 사람이 해야 할 일:
1. `git diff vendor/ralph-wiggum/` 로 변경 검토
2. `pnpm --filter @agent-desk/gateway test -- ralph-loop-install` 재실행
3. 호환성 깨졌으면 (스크립트가 exit 2) `apps/gateway/src/skills/install.ts` 의
   `ensureRalphLoopInstalled` patch 로직 동반 수정
4. 변경 OK 면 vendor (+ 필요시 installer) 한 커밋으로 정리 (CLAUDE.md 모듈 커밋 정책)

## 알려진 fragility

- **installer 의 `replaceAll("${CLAUDE_PLUGIN_ROOT}/scripts/setup-ralph-loop.sh", ...)`
  매칭 문자열이 upstream 의 exact prefix 에 의존.** upstream 이 토큰 형태를 바꾸면
  patch 가 silent fail — `bump.sh` 가 검출해 exit 2.
- `cancel-ralph.md` / `help.md` 에는 현재 `${CLAUDE_PLUGIN_ROOT}` 가 없음. upstream 이
  추가하면 `bump.sh` 가 경고만 띄움 (자동 처리 안 함). 그 경우 installer 의 patch
  대상에 추가 필요.
- `stop-hook.sh` 의 상태파일 경로 `.claude/ralph-loop.local.md` 가 바뀌면
  `/cancel-ralph` 명령도 함께 깨짐. diff 검토 시 확인.
```

- [ ] **Step 4: bump.sh 가 dry-run 으로 실패 없이 도는지 확인**

실행 (실제로 upstream 변경이 없다면 vendor 디렉토리는 결과적으로 동일해야 함):
```bash
bash agent-desk/vendor/ralph-wiggum/bump.sh
```

기대 출력 (마지막 줄):
```
✅ bump 완료.
```

종료 코드 0. 그 뒤 `git diff agent-desk/vendor/ralph-wiggum/` 가 비어 있거나 `UPSTREAM.txt` 의 `fetched:` 줄만 갱신되어야 함 (스냅샷 직후라면 SHA 도 동일).

- [ ] **Step 5: `${CLAUDE_PLUGIN_ROOT}` 토큰 누락 시 fail-fast 동작 확인 (수동 시나리오)**

테스트만의 임시 검증 — 실제 vendor 를 망가뜨리지 말 것:
```bash
# 임시로 ralph-loop.md 의 토큰을 가린 사본을 만들어 검증
cp agent-desk/vendor/ralph-wiggum/commands/ralph-loop.md /tmp/ralph-loop.backup
sed -i 's/${CLAUDE_PLUGIN_ROOT}/XXX_REMOVED/g' agent-desk/vendor/ralph-wiggum/commands/ralph-loop.md
bash agent-desk/vendor/ralph-wiggum/bump.sh; echo "exit=$?"
# 복구
cp /tmp/ralph-loop.backup agent-desk/vendor/ralph-wiggum/commands/ralph-loop.md
```

기대: bump.sh 가 step 3 에서 "호환성 깨짐" 메시지를 stderr 로 출력하고 `exit=2`. (이 단계는 검증 후 즉시 vendor 를 복구한다 — 절대로 망가진 채 commit 하지 말 것.)

> 주: Step 5 는 일회성 sanity check. 실제 구현 단계에서 한 번 돌려 fail-loud 가드가 동작함을 확인하면 충분. 자동화 테스트로 정착시키지 않는 이유 — 스크립트는 upstream 네트워크 호출 + vendor 파일 쓰기 의존이라 단위 테스트와 결이 다름.

---

## Phase B — Shared 스키마

### Task B1: zod 스키마에 `ralphLoopEnabled` 추가

**파일:**
- 수정: `agent-desk/packages/shared/src/api/workspace.ts`

- [ ] **Step 1: 3개 zod 스키마에 필드 추가**

`agent-desk/packages/shared/src/api/workspace.ts` 최종 형태:

```ts
import { z } from "zod";

export const createWorkspaceRequest = z.object({
  name: z.string().min(1).max(120),
  path: z.string().startsWith("/"),
  harnessEnabled: z.boolean().optional().default(false),
  ralphLoopEnabled: z.boolean().optional().default(false),
});
export type CreateWorkspaceRequest = z.infer<typeof createWorkspaceRequest>;

export const updateWorkspaceRequest = z.object({
  harnessEnabled: z.boolean(),
  ralphLoopEnabled: z.boolean(),
});
export type UpdateWorkspaceRequest = z.infer<typeof updateWorkspaceRequest>;

export const workspaceDto = z.object({
  id: z.number().int(),
  name: z.string(),
  path: z.string(),
  createdAt: z.number().int(),
  deletedAt: z.number().int().nullable(),
  harnessEnabled: z.boolean(),
  ralphLoopEnabled: z.boolean(),
});
export type WorkspaceDto = z.infer<typeof workspaceDto>;
```

- [ ] **Step 2: typecheck**

실행:
```bash
pnpm --filter @agent-desk/shared typecheck
```

기대: PASS. 변경이 gateway/web 으로 cascade 되어 이후 Task 전까지 그쪽 typecheck 는 깨질 수 있음 — 정상. 캐스트로 가리지 말 것.

---

### Task B2: `workspaces` 테이블에 DB 컬럼 추가

**파일:**
- 수정: `agent-desk/packages/shared/src/db/schema.ts`

- [ ] **Step 1: 현재 workspaces 테이블 정의 확인**

`agent-desk/packages/shared/src/db/schema.ts` 를 열고 `workspaces` 블록을 찾는다. 현재 `harnessEnabled: integer("harness_enabled").notNull().default(0),` 줄로 끝남.

- [ ] **Step 2: 컬럼 추가**

`sqliteTable("workspaces", { ... })` 블록 안, `harnessEnabled` 줄 바로 뒤에 삽입:

```ts
  ralphLoopEnabled: integer("ralph_loop_enabled").notNull().default(0),
```

- [ ] **Step 3: shared 패키지 typecheck**

실행:
```bash
pnpm --filter @agent-desk/shared typecheck
```

기대: PASS.

---

### Task B3: drizzle 마이그레이션 생성

**파일:**
- 생성: `agent-desk/apps/gateway/drizzle/000X_*.sql` (drizzle-kit 자동 명명)
- 수정: `agent-desk/apps/gateway/drizzle/meta/_journal.json`
- 생성: `agent-desk/apps/gateway/drizzle/meta/000X_snapshot.json`

- [ ] **Step 1: drizzle-kit generate 실행**

`agent-desk/apps/gateway/` 에서:
```bash
pnpm --filter @agent-desk/gateway db:generate
```

기대: drizzle-kit 이 새 `000X_<랜덤이름>.sql` 과 대응 snapshot 을 출력. 마이그레이션 본문 예:
```sql
ALTER TABLE `workspaces` ADD `ralph_loop_enabled` integer DEFAULT 0 NOT NULL;
```

- [ ] **Step 2: 마이그레이션 내용 검증**

실행:
```bash
ls agent-desk/apps/gateway/drizzle/*.sql | tail -1
```

새로 생성된 파일을 `cat` 으로 확인. **`ALTER TABLE workspaces ADD ralph_loop_enabled` 한 줄만** 있어야 함. 다른 컬럼이 함께 잡혔다면 schema.ts 에 의도치 않은 drift 가 있는 것.

- [ ] **Step 3: 마이그레이션 적용 검증을 위해 gateway 테스트 실행**

실행:
```bash
pnpm --filter @agent-desk/gateway test
```

기대: 대부분의 테스트는 아직 fixture 미보강으로 실패하지만, **"table workspaces has no column named ralph_loop_enabled" 또는 마이그레이션 에러는 없어야 함.** "no column" SQL 에러가 보이면 마이그레이션이 적용되지 않은 것 — 진행 중단하고 조사.

---

## Phase C — Gateway Installer (TDD)

### Task C1: `ensureRalphLoopInstalled` 기본 동작 — 실패 테스트 작성

**파일:**
- 생성: `agent-desk/apps/gateway/tests/ralph-loop-install.test.ts`

- [ ] **Step 1: 실패 테스트 파일 작성**

`agent-desk/apps/gateway/tests/ralph-loop-install.test.ts`:

```ts
import {
  mkdtempSync,
  rmSync,
  existsSync,
  readFileSync,
  statSync,
  mkdirSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ensureRalphLoopInstalled,
  ensureRalphLoopRemoved,
} from "../src/skills/install";

let tmp: string;
let vendorRoot: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "ad-ralph-"));
  vendorRoot = mkdtempSync(join(tmpdir(), "ad-ralph-vendor-"));
  // 5개 파일을 가진 가짜 vendor 디렉토리
  mkdirSync(join(vendorRoot, "commands"), { recursive: true });
  mkdirSync(join(vendorRoot, "scripts"), { recursive: true });
  mkdirSync(join(vendorRoot, "hooks"), { recursive: true });
  writeFileSync(
    join(vendorRoot, "commands", "ralph-loop.md"),
    "---\ndescription: x\n---\nrun ${CLAUDE_PLUGIN_ROOT}/scripts/setup-ralph-loop.sh $ARGUMENTS\n",
  );
  writeFileSync(
    join(vendorRoot, "commands", "cancel-ralph.md"),
    "---\ndescription: x\n---\ncancel body\n",
  );
  writeFileSync(
    join(vendorRoot, "commands", "help.md"),
    "---\ndescription: x\n---\nhelp body\n",
  );
  writeFileSync(
    join(vendorRoot, "scripts", "setup-ralph-loop.sh"),
    "#!/usr/bin/env bash\necho setup\n",
  );
  writeFileSync(
    join(vendorRoot, "hooks", "stop-hook.sh"),
    "#!/usr/bin/env bash\necho hook\n",
  );
});

afterEach(() => {
  if (tmp) rmSync(tmp, { recursive: true, force: true });
  if (vendorRoot) rmSync(vendorRoot, { recursive: true, force: true });
});

describe("ensureRalphLoopInstalled", () => {
  it("5개 파일을 .claude/{commands,scripts,hooks}/ 로 복사", async () => {
    await ensureRalphLoopInstalled({ workspacePath: tmp, vendorDir: vendorRoot });

    expect(existsSync(join(tmp, ".claude/commands/ralph-loop.md"))).toBe(true);
    expect(existsSync(join(tmp, ".claude/commands/cancel-ralph.md"))).toBe(true);
    expect(existsSync(join(tmp, ".claude/commands/ralph-help.md"))).toBe(true); // help.md → ralph-help.md
    expect(existsSync(join(tmp, ".claude/scripts/ralph-setup.sh"))).toBe(true);
    expect(existsSync(join(tmp, ".claude/hooks/ralph-stop-hook.sh"))).toBe(true);
  });

  it("ralph-loop.md 의 ${CLAUDE_PLUGIN_ROOT} 토큰을 절대경로로 patch", async () => {
    await ensureRalphLoopInstalled({ workspacePath: tmp, vendorDir: vendorRoot });

    const body = readFileSync(join(tmp, ".claude/commands/ralph-loop.md"), "utf8");
    expect(body).not.toContain("${CLAUDE_PLUGIN_ROOT}");
    expect(body).toContain(join(tmp, ".claude/scripts/ralph-setup.sh"));
  });

  it("scripts/.sh 와 hooks/.sh 에 실행권한", async () => {
    await ensureRalphLoopInstalled({ workspacePath: tmp, vendorDir: vendorRoot });

    const scriptMode = statSync(join(tmp, ".claude/scripts/ralph-setup.sh")).mode;
    const hookMode = statSync(join(tmp, ".claude/hooks/ralph-stop-hook.sh")).mode;
    expect(scriptMode & 0o111).not.toBe(0); // 실행 비트 (owner+group+other)
    expect(hookMode & 0o111).not.toBe(0);
  });

  it("settings.json Stop 배열에 ralph-stop-hook.sh entry 추가", async () => {
    await ensureRalphLoopInstalled({ workspacePath: tmp, vendorDir: vendorRoot });

    const settings = JSON.parse(
      readFileSync(join(tmp, ".claude/settings.json"), "utf8"),
    );
    const stop = settings.hooks?.Stop ?? [];
    expect(
      stop.some((h: { hooks: { command: string }[] }) =>
        h.hooks?.some((hh) => hh.command?.endsWith("ralph-stop-hook.sh")),
      ),
    ).toBe(true);
  });

  it("idempotent — 두 번 호출해도 Stop entry 중복 없음", async () => {
    await ensureRalphLoopInstalled({ workspacePath: tmp, vendorDir: vendorRoot });
    await ensureRalphLoopInstalled({ workspacePath: tmp, vendorDir: vendorRoot });

    const settings = JSON.parse(
      readFileSync(join(tmp, ".claude/settings.json"), "utf8"),
    );
    const stop = settings.hooks?.Stop ?? [];
    const ralphEntries = stop.filter((h: { hooks: { command: string }[] }) =>
      h.hooks?.some((hh) => hh.command?.endsWith("ralph-stop-hook.sh")),
    );
    expect(ralphEntries).toHaveLength(1);
  });

  it("기존 wp-progress Stop entry 보존", async () => {
    mkdirSync(join(tmp, ".claude"), { recursive: true });
    writeFileSync(
      join(tmp, ".claude/settings.json"),
      JSON.stringify({
        hooks: {
          Stop: [
            { hooks: [{ type: "command", command: "node .claude/hooks/wp-progress.js" }] },
          ],
        },
      }),
    );
    await ensureRalphLoopInstalled({ workspacePath: tmp, vendorDir: vendorRoot });

    const settings = JSON.parse(
      readFileSync(join(tmp, ".claude/settings.json"), "utf8"),
    );
    const stop = settings.hooks?.Stop ?? [];
    expect(stop).toHaveLength(2);
    expect(
      stop.some((h: { hooks: { command: string }[] }) =>
        h.hooks?.some((hh) => hh.command?.includes("wp-progress.js")),
      ),
    ).toBe(true);
  });
});

describe("ensureRalphLoopRemoved", () => {
  it("우리가 install 한 5개 파일 삭제", async () => {
    await ensureRalphLoopInstalled({ workspacePath: tmp, vendorDir: vendorRoot });
    await ensureRalphLoopRemoved({ workspacePath: tmp });

    expect(existsSync(join(tmp, ".claude/commands/ralph-loop.md"))).toBe(false);
    expect(existsSync(join(tmp, ".claude/commands/cancel-ralph.md"))).toBe(false);
    expect(existsSync(join(tmp, ".claude/commands/ralph-help.md"))).toBe(false);
    expect(existsSync(join(tmp, ".claude/scripts/ralph-setup.sh"))).toBe(false);
    expect(existsSync(join(tmp, ".claude/hooks/ralph-stop-hook.sh"))).toBe(false);
  });

  it("settings.json 에서 ralph Stop entry 제거, wp-progress 보존", async () => {
    mkdirSync(join(tmp, ".claude"), { recursive: true });
    writeFileSync(
      join(tmp, ".claude/settings.json"),
      JSON.stringify({
        hooks: {
          Stop: [
            { hooks: [{ type: "command", command: "node .claude/hooks/wp-progress.js" }] },
          ],
        },
      }),
    );
    await ensureRalphLoopInstalled({ workspacePath: tmp, vendorDir: vendorRoot });
    await ensureRalphLoopRemoved({ workspacePath: tmp });

    const settings = JSON.parse(
      readFileSync(join(tmp, ".claude/settings.json"), "utf8"),
    );
    const stop = settings.hooks?.Stop ?? [];
    expect(stop).toHaveLength(1);
    expect(
      stop.every((h: { hooks: { command: string }[] }) =>
        !h.hooks?.some((hh) => hh.command?.endsWith("ralph-stop-hook.sh")),
      ),
    ).toBe(true);
    expect(
      stop.some((h: { hooks: { command: string }[] }) =>
        h.hooks?.some((hh) => hh.command?.includes("wp-progress.js")),
      ),
    ).toBe(true);
  });

  it("미설치 워크스페이스에서 호출해도 안전한 no-op", async () => {
    await expect(ensureRalphLoopRemoved({ workspacePath: tmp })).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: 실패 확인**

실행:
```bash
pnpm --filter @agent-desk/gateway test -- ralph-loop-install
```

기대: FAIL — `../src/skills/install` 에서 `ensureRalphLoopInstalled` export 못 찾는다는 에러.

---

### Task C2: `ensureRalphLoopInstalled` 와 `ensureRalphLoopRemoved` 구현

**파일:**
- 수정: `agent-desk/apps/gateway/src/skills/install.ts`

- [ ] **Step 1: 파일 상단에 vendor-dir 헬퍼 추가**

`install.ts` 의 기존 `defaultVendorHarnessSkillDir()` 함수 근처에 추가:

```ts
function defaultVendorRalphDir(): string {
  const env = process.env.AGENT_DESK_RALPH_VENDOR_DIR;
  if (env) return env;
  const here = fileURLToPath(import.meta.url);
  const gatewayDir = path.resolve(path.dirname(here), "..", "..");
  const agentDeskRoot = path.resolve(gatewayDir, "..", "..");
  return path.join(agentDeskRoot, "vendor", "ralph-wiggum");
}
```

- [ ] **Step 2: hook entry 식별자 추가 (`isWpHookEntry` 미러)**

"Progress hook install/remove" 섹션의 `isWpHookEntry` 근처에 추가:

```ts
function isRalphStopHookEntry(h: HookEntry): boolean {
  return h.hooks?.some((hh) => hh.command?.endsWith("ralph-stop-hook.sh")) ?? false;
}
```

- [ ] **Step 3: `ensureRalphLoopInstalled` 구현**

`install.ts` 끝부분에 추가:

```ts
// ---------------------------------------------------------------------------
// Ralph Loop install/remove
// ---------------------------------------------------------------------------

export interface EnsureRalphLoopOptions {
  workspacePath: string;
  /** vendor/ralph-wiggum 절대경로 (commands/scripts/hooks 를 포함하는 디렉토리). */
  vendorDir?: string;
}

/**
 * vendor 의 ralph-wiggum 파일을 워크스페이스로 복사하고 settings.json 에
 * stop hook 을 등록한다. 멱등.
 *
 * 결과 구조:
 *   <ws>/.claude/commands/ralph-loop.md      (${CLAUDE_PLUGIN_ROOT} patched)
 *   <ws>/.claude/commands/cancel-ralph.md
 *   <ws>/.claude/commands/ralph-help.md      (help.md 에서 rename)
 *   <ws>/.claude/scripts/ralph-setup.sh      (chmod +x)
 *   <ws>/.claude/hooks/ralph-stop-hook.sh    (chmod +x)
 *   <ws>/.claude/settings.json: hooks.Stop += { hooks: [{ type, command }] }
 */
export async function ensureRalphLoopInstalled(
  opts: EnsureRalphLoopOptions,
): Promise<void> {
  const vendorDir = opts.vendorDir ?? defaultVendorRalphDir();
  const wsClaude = path.join(opts.workspacePath, ".claude");
  const cmdDir = path.join(wsClaude, "commands");
  const scriptDir = path.join(wsClaude, "scripts");
  const hookDir = path.join(wsClaude, "hooks");
  await fs.mkdir(cmdDir, { recursive: true });
  await fs.mkdir(scriptDir, { recursive: true });
  await fs.mkdir(hookDir, { recursive: true });

  // 1. cancel-ralph.md — 그대로 복사
  await fs.copyFile(
    path.join(vendorDir, "commands", "cancel-ralph.md"),
    path.join(cmdDir, "cancel-ralph.md"),
  );

  // 2. help.md → ralph-help.md (rename)
  await fs.copyFile(
    path.join(vendorDir, "commands", "help.md"),
    path.join(cmdDir, "ralph-help.md"),
  );

  // 3. ralph-loop.md — 복사 + ${CLAUDE_PLUGIN_ROOT} patch
  const ralphSetupAbs = path.join(scriptDir, "ralph-setup.sh");
  const raw = await fs.readFile(
    path.join(vendorDir, "commands", "ralph-loop.md"),
    "utf8",
  );
  const patched = raw.replaceAll(
    "${CLAUDE_PLUGIN_ROOT}/scripts/setup-ralph-loop.sh",
    ralphSetupAbs,
  );
  await fs.writeFile(path.join(cmdDir, "ralph-loop.md"), patched);

  // 4. setup-ralph-loop.sh → ralph-setup.sh + chmod +x
  await fs.copyFile(
    path.join(vendorDir, "scripts", "setup-ralph-loop.sh"),
    ralphSetupAbs,
  );
  await fs.chmod(ralphSetupAbs, 0o755);

  // 5. stop-hook.sh → ralph-stop-hook.sh + chmod +x
  const ralphHookAbs = path.join(hookDir, "ralph-stop-hook.sh");
  await fs.copyFile(path.join(vendorDir, "hooks", "stop-hook.sh"), ralphHookAbs);
  await fs.chmod(ralphHookAbs, 0o755);

  // 6. settings.json Stop 배열에 idempotent 등록
  const settingsPath = path.join(wsClaude, "settings.json");
  let settings: Record<string, unknown> = {};
  try {
    const raw = await fs.readFile(settingsPath, "utf8");
    try {
      settings = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      settings = {};
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
  if (typeof settings.hooks !== "object" || settings.hooks === null) {
    settings.hooks = {};
  }
  const hooks = settings.hooks as Record<string, HookEntry[]>;
  if (!Array.isArray(hooks.Stop)) hooks.Stop = [];
  if (!hooks.Stop.some(isRalphStopHookEntry)) {
    hooks.Stop.push({
      hooks: [{ type: "command", command: ralphHookAbs }],
    });
  }
  await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2));
}

/**
 * `ensureRalphLoopInstalled` 이 둔 파일을 제거하고 stop hook 등록 해제.
 * 이미 없을 때 호출해도 안전.
 */
export async function ensureRalphLoopRemoved(opts: {
  workspacePath: string;
}): Promise<void> {
  const wsClaude = path.join(opts.workspacePath, ".claude");
  const toDelete = [
    path.join(wsClaude, "commands", "ralph-loop.md"),
    path.join(wsClaude, "commands", "cancel-ralph.md"),
    path.join(wsClaude, "commands", "ralph-help.md"),
    path.join(wsClaude, "scripts", "ralph-setup.sh"),
    path.join(wsClaude, "hooks", "ralph-stop-hook.sh"),
  ];
  for (const p of toDelete) {
    await fs.rm(p, { force: true });
  }

  const settingsPath = path.join(wsClaude, "settings.json");
  let settings: Record<string, unknown>;
  try {
    const raw = await fs.readFile(settingsPath, "utf8");
    settings = JSON.parse(raw) as Record<string, unknown>;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
    throw err;
  }
  if (typeof settings.hooks !== "object" || settings.hooks === null) return;
  const hooks = settings.hooks as Record<string, HookEntry[]>;
  if (Array.isArray(hooks.Stop)) {
    hooks.Stop = hooks.Stop.filter((h) => !isRalphStopHookEntry(h));
  }
  await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2));
}
```

- [ ] **Step 4: installer 테스트 실행**

실행:
```bash
pnpm --filter @agent-desk/gateway test -- ralph-loop-install
```

기대: `ralph-loop-install.test.ts` 의 9개 테스트 모두 PASS.

- [ ] **Step 5: gateway 전체 스위트 실행**

실행:
```bash
pnpm --filter @agent-desk/gateway test
```

기대: `ralph-loop-install.test.ts` PASS. `workspaces.test.ts` 는 아직 확장하지 않았으므로 실패 가능 — 정상. Phase D 에서 처리.

---

## Phase D — Gateway 라우트

### Task D1: server.ts 에 ralph-loop fn 주입 수신부 추가

**파일:**
- 수정: `agent-desk/apps/gateway/src/server.ts`

- [ ] **Step 1: 기존 harness fn 주입부 찾기**

`apps/gateway/src/server.ts` 에서 `ensureHarnessFn` 검색. `workspaceRoutes` 로 override 를 패스하는 구조.

- [ ] **Step 2: harness 주입 패턴을 그대로 ralph 에 적용**

`./skills/install` import 확장:

```ts
import {
  ensureAllSkillsInstalled,
  ensureHarnessInstalled,
  ensureHarnessRemoved,
  ensureProgressHookInstalled,
  ensureProgressHookRemoved,
  ensureRalphLoopInstalled,
  ensureRalphLoopRemoved,
  type ensureSkillInstalled,
} from "./skills/install";
```

`CreateServerOptions` 타입에 `ensureHarnessFn` 옆으로 두 필드 추가:

```ts
  ensureRalphLoopFn?: typeof ensureRalphLoopInstalled;
  ensureRalphLoopRemovedFn?: typeof ensureRalphLoopRemoved;
```

`workspaceRoutes({...})` 호출에 두 필드 패스. (server.ts 가 `workspaceRoutes` 를 직접 호출하지 않으면 wiring 지점을 찾아 `ensureHarnessFn` 옆에 추가.)

- [ ] **Step 3: typecheck**

실행:
```bash
pnpm --filter @agent-desk/gateway typecheck
```

기대: PASS (이번 변경으로 새로 생기는 타입 에러만 고침; 기존 실패는 그대로 둔다).

---

### Task D2: 실패 테스트 — POST /workspaces with ralphLoopEnabled 시 installer 호출

**파일:**
- 수정: `agent-desk/apps/gateway/tests/workspaces.test.ts`

- [ ] **Step 1: 기존 harness 관련 테스트 케이스 위치 확인**

`apps/gateway/tests/workspaces.test.ts` 에서 상단의 `ensureAllSkillsFn` 선언과 `harnessEnabled: true` 가 들어간 POST 테스트 검색.

- [ ] **Step 2: ralph-loop fn mock 을 그 옆에 추가**

상단의 `ensureAllSkillsFn` 옆:

```ts
const ensureRalphLoopFn = vi.fn(async () => {});
const ensureRalphLoopRemovedFn = vi.fn(async () => {});
```

`beforeAll` 의 `createServer` 호출에 패스:

```ts
    ensureRalphLoopFn,
    ensureRalphLoopRemovedFn,
```

- [ ] **Step 3: POST 실패 테스트 추가**

"POST with harnessEnabled=true triggers harness install" 의 등가 테스트 뒤에 추가:

```ts
  it("POST 시 ralphLoopEnabled=true 면 ensureRalphLoopFn 호출", async () => {
    ensureRalphLoopFn.mockClear();
    const res = await fetch(`${url}/workspaces`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        name: "ralph-ws",
        path: "/tmp/ad-test-ralph",
        ralphLoopEnabled: true,
      }),
    });
    expect(res.status).toBe(201);
    expect(ensureRalphLoopFn).toHaveBeenCalledWith({
      workspacePath: "/tmp/ad-test-ralph",
    });
  });

  it("POST 시 ralphLoopEnabled 생략하면 ensureRalphLoopFn 호출 안 함", async () => {
    ensureRalphLoopFn.mockClear();
    const res = await fetch(`${url}/workspaces`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        name: "ralph-off-ws",
        path: "/tmp/ad-test-ralph-off",
      }),
    });
    expect(res.status).toBe(201);
    expect(ensureRalphLoopFn).not.toHaveBeenCalled();
  });
```

- [ ] **Step 4: 실행, 실패 확인**

실행:
```bash
pnpm --filter @agent-desk/gateway test -- workspaces
```

기대: 새 두 테스트 FAIL — `ensureRalphLoopFn` 이 라우트 핸들러에 아직 연결되지 않음.

---

### Task D3: POST /workspaces 라우트에 installer 연결

**파일:**
- 수정: `agent-desk/apps/gateway/src/routes/workspaces.ts`

- [ ] **Step 1: import 와 opts 확장**

`apps/gateway/src/routes/workspaces.ts` 의 import 확장:

```ts
import {
  ensureAllSkillsInstalled,
  ensureHarnessInstalled,
  ensureHarnessRemoved,
  ensureProgressHookInstalled,
  ensureProgressHookRemoved,
  ensureRalphLoopInstalled,
  ensureRalphLoopRemoved,
} from "../skills/install";
```

`workspaceRoutes` opts 인터페이스 확장:

```ts
  /** ralph-loop installer override (테스트용). */
  ensureRalphLoopFn?: typeof ensureRalphLoopInstalled;
  /** ralph-loop remover override (테스트용). */
  ensureRalphLoopRemovedFn?: typeof ensureRalphLoopRemoved;
```

함수 본체에서, 다른 `const ensureX = opts.ensureXFn ?? ensureX;` 와 함께:

```ts
  const ensureRalph = opts.ensureRalphLoopFn ?? ensureRalphLoopInstalled;
  const ensureRalphGone =
    opts.ensureRalphLoopRemovedFn ?? ensureRalphLoopRemoved;
```

- [ ] **Step 2: `toWorkspaceDto` 에 `ralphLoopEnabled` 노출**

`toWorkspaceDto` 수정:

```ts
function toWorkspaceDto(w: WorkspaceRow) {
  return {
    id: w.id,
    name: w.name,
    path: w.path,
    createdAt: w.createdAt,
    deletedAt: w.deletedAt,
    harnessEnabled: w.harnessEnabled === 1,
    ralphLoopEnabled: w.ralphLoopEnabled === 1,
  };
}
```

- [ ] **Step 3: POST 핸들러에 ralph install 분기 삽입**

`.values({ ... })` insert 에 `ralphLoopEnabled` 추가:

```ts
    const inserted = db
      .insert(workspaces)
      .values({
        name: parsed.data.name,
        path: parsed.data.path,
        createdAt: Date.now(),
        harnessEnabled: parsed.data.harnessEnabled ? 1 : 0,
        ralphLoopEnabled: parsed.data.ralphLoopEnabled ? 1 : 0,
      })
      .returning()
      .all();
```

기존 harness install 블록 뒤에 추가:

```ts
    if (parsed.data.ralphLoopEnabled) {
      try {
        await ensureRalph({ workspacePath: inserted[0].path });
      } catch (err) {
        console.warn("[workspaces] ralph-loop install failed:", err);
      }
    }
```

- [ ] **Step 4: 실행, 새 두 POST 테스트 통과 확인**

실행:
```bash
pnpm --filter @agent-desk/gateway test -- workspaces
```

기대: 두 POST ralph 테스트 PASS. 기존 harness 테스트도 여전히 PASS.

---

### Task D4: 실패 테스트 — PATCH 토글

**파일:**
- 수정: `agent-desk/apps/gateway/tests/workspaces.test.ts`

- [ ] **Step 1: PATCH 테스트 케이스 추가**

기존 PATCH harness 테스트 근처에 추가:

```ts
  it("PATCH ralphLoopEnabled=true 시 ensureRalphLoopFn 호출", async () => {
    ensureRalphLoopFn.mockClear();
    // 위에서 만든 "ralph-ws" 를 재사용 (격리 이슈가 있으면 인라인으로 새로 생성)
    const list = await listActive();
    const target = list.find((w) => w.name === "ralph-ws") ?? list[0];
    const res = await fetch(`${url}/workspaces/${target.id}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ harnessEnabled: false, ralphLoopEnabled: true }),
    });
    expect(res.status).toBe(200);
    expect(ensureRalphLoopFn).toHaveBeenCalledWith({
      workspacePath: target.path,
    });
  });

  it("PATCH ralphLoopEnabled=false 시 ensureRalphLoopRemovedFn 호출", async () => {
    ensureRalphLoopRemovedFn.mockClear();
    const list = await listActive();
    const target = list.find((w) => w.name === "ralph-ws") ?? list[0];
    const res = await fetch(`${url}/workspaces/${target.id}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ harnessEnabled: false, ralphLoopEnabled: false }),
    });
    expect(res.status).toBe(200);
    expect(ensureRalphLoopRemovedFn).toHaveBeenCalledWith({
      workspacePath: target.path,
    });
  });
```

- [ ] **Step 2: 실행, 실패 확인**

실행:
```bash
pnpm --filter @agent-desk/gateway test -- workspaces
```

기대: 새 두 PATCH 테스트 FAIL.

---

### Task D5: PATCH /workspaces/:id 라우트에 installer 연결

**파일:**
- 수정: `agent-desk/apps/gateway/src/routes/workspaces.ts`

- [ ] **Step 1: PATCH body 처리 확장**

PATCH 핸들러는 이미 `updateWorkspaceRequest.safeParse(...)` 를 사용. Task B1 에서 zod 가 확장되었으므로 `parsed.data` 에 `ralphLoopEnabled: boolean` 이 들어옴. `.set({...})` 수정:

```ts
    const updated = db
      .update(workspaces)
      .set({
        harnessEnabled: parsed.data.harnessEnabled ? 1 : 0,
        ralphLoopEnabled: parsed.data.ralphLoopEnabled ? 1 : 0,
      })
      .where(eq(workspaces.id, id))
      .returning()
      .all();
```

- [ ] **Step 2: ralph install/remove 분기 추가**

PATCH 의 기존 harness install/remove 블록 뒤에 추가:

```ts
    if (parsed.data.ralphLoopEnabled) {
      try {
        await ensureRalph({ workspacePath: updated[0].path });
      } catch (err) {
        console.warn("[workspaces] ralph-loop install on update failed:", err);
      }
    } else {
      try {
        await ensureRalphGone({ workspacePath: updated[0].path });
      } catch (err) {
        console.warn("[workspaces] ralph-loop remove on update failed:", err);
      }
    }
```

- [ ] **Step 3: gateway 전체 스위트 실행**

실행:
```bash
pnpm --filter @agent-desk/gateway test
```

기대: 모든 gateway 테스트 PASS — 새 ralph 4개(POST 2 + PATCH 2) 포함.

- [ ] **Step 4: typecheck**

실행:
```bash
pnpm --filter @agent-desk/gateway typecheck
```

기대: PASS.

---

## Phase E — Web UI

### Task E1: `RalphWarningBox` 컴포넌트 작성

**파일:**
- 생성: `agent-desk/apps/web/components/ralph-warning-box.tsx`

- [ ] **Step 1: 컴포넌트 작성**

`agent-desk/apps/web/components/ralph-warning-box.tsx`:

```tsx
export function RalphWarningBox(props: { active: boolean }) {
  if (!props.active) {
    return (
      <p className="ml-6 text-[12px] text-[var(--hill-muted)]">
        세션에서 <code>/ralph-loop</code> 슬래시 명령을 사용 가능하게 만듭니다.
        체크 시 위험 안내가 표시됩니다.
      </p>
    );
  }
  return (
    <div
      role="alert"
      className="ml-6 border-l-2 border-amber-500 bg-amber-50 px-3 py-2 text-[12px] leading-relaxed"
    >
      <p className="font-medium text-amber-900">⚠ 세션이 강제로 반복됩니다.</p>
      <p className="mt-1 text-amber-900">
        세션에서 <code className="font-mono">/ralph-loop &lt;프롬프트&gt;</code> 실행 시 매
        종료마다 같은 프롬프트로 재진입하며,{" "}
        <strong>
          <code className="font-mono">/cancel-ralph</code> 호출 또는{" "}
          <code className="font-mono">&lt;promise&gt;</code> 일치 출력 전까지 멈추지
          않습니다.
        </strong>{" "}
        Claude 종료 버튼·<code className="font-mono">/quit</code>도 무력화됩니다.
      </p>
      <p className="mt-1 text-amber-900">
        <code className="font-mono">--max-iterations N</code> 없이 시작하면{" "}
        <strong>무한 루프 + 무제한 토큰 소비</strong>입니다. codex / gemini
        세션에서는 동작하지 않습니다.
      </p>
    </div>
  );
}
```

- [ ] **Step 2: web 패키지 typecheck**

실행:
```bash
pnpm --filter @agent-desk/web typecheck
```

기대: PASS.

---

### Task E2: `workspace-form.tsx` 실패 테스트 작성

**파일:**
- 수정: `agent-desk/apps/web/tests/workspace-form.test.tsx`

- [ ] **Step 1: ralph 테스트 블록 추가**

`workspace-form.test.tsx` 의 기존 `describe` 블록 뒤에 추가:

```tsx
describe("WorkspaceForm — ralph-loop 옵션", () => {
  it("기본 상태에서 ralph 체크박스는 unchecked, muted 헬프텍스트만 노출", () => {
    render(<WorkspaceForm onCreated={() => {}} />);
    const cb = screen.getByLabelText(/ralph-loop/i) as HTMLInputElement;
    expect(cb.checked).toBe(false);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("체크 시 amber 경고박스 노출 — 키워드 3개 포함", () => {
    render(<WorkspaceForm onCreated={() => {}} />);
    fireEvent.click(screen.getByLabelText(/ralph-loop/i));
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("/cancel-ralph");
    expect(alert.textContent).toContain("<promise>");
    expect(alert.textContent).toContain("--max-iterations");
  });

  it("ralph 체크 시 create 페이로드에 ralphLoopEnabled=true 포함", async () => {
    const { gateway } = await import("@/lib/gateway-client");
    (gateway.workspaces.create as ReturnType<typeof vi.fn>).mockClear();
    render(<WorkspaceForm onCreated={() => {}} />);
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "rl-ws" },
    });
    fireEvent.change(screen.getByLabelText("Path"), {
      target: { value: "/tmp/rl" },
    });
    fireEvent.click(screen.getByLabelText(/ralph-loop/i));
    fireEvent.click(screen.getByRole("button", { name: /Add workspace/i }));
    await new Promise((r) => setTimeout(r, 0));
    expect(gateway.workspaces.create).toHaveBeenCalledWith({
      name: "rl-ws",
      path: "/tmp/rl",
      harnessEnabled: false,
      ralphLoopEnabled: true,
    });
  });
});
```

기존 "harnessEnabled=true 포함" 테스트의 기대값도 양쪽 필드를 함께 보내도록 확장. 이 부분:

```tsx
    expect(gateway.workspaces.create).toHaveBeenCalledWith({
      name: "ws",
      path: "/tmp/ws",
      harnessEnabled: true,
    });
```

다음으로 변경:

```tsx
    expect(gateway.workspaces.create).toHaveBeenCalledWith({
      name: "ws",
      path: "/tmp/ws",
      harnessEnabled: true,
      ralphLoopEnabled: false,
    });
```

- [ ] **Step 2: 실행, 실패 확인**

실행:
```bash
pnpm --filter @agent-desk/web test -- workspace-form
```

기대: 새 테스트 FAIL — `ralph-loop` 라벨을 찾지 못함.

---

### Task E3: `workspace-form.tsx` 에 체크박스 + 경고 추가

**파일:**
- 수정: `agent-desk/apps/web/components/workspace-form.tsx`

- [ ] **Step 1: state 와 useId 추가**

기존 `const [harnessEnabled, setHarnessEnabled] = useState(false);` 근처에:

```tsx
  const ralphId = useId();
  const [ralphLoopEnabled, setRalphLoopEnabled] = useState(false);
```

파일 상단에 import 추가:

```tsx
import { RalphWarningBox } from "./ralph-warning-box";
```

- [ ] **Step 2: submit 페이로드에 필드 포함**

`gateway.workspaces.create({...})` 호출에 `ralphLoopEnabled` 추가:

```tsx
          await gateway.workspaces.create({
            name: name.trim(),
            path: path.trim(),
            harnessEnabled,
            ralphLoopEnabled,
          });
```

성공 시 state reset:

```tsx
          setHarnessEnabled(false);
          setRalphLoopEnabled(false);
```

- [ ] **Step 3: 체크박스 + 경고 마크업 추가**

기존 harness 체크박스 `<div>` 뒤에 추가:

```tsx
      <div className="flex flex-col gap-1">
        <label
          className="flex items-center gap-2 text-[13px]"
          htmlFor={ralphId}
        >
          <input
            id={ralphId}
            type="checkbox"
            checked={ralphLoopEnabled}
            onChange={(e) => setRalphLoopEnabled(e.target.checked)}
          />
          <span>ralph-loop 활성화 (Claude Code 전용 · 위험)</span>
        </label>
        <RalphWarningBox active={ralphLoopEnabled} />
      </div>
```

- [ ] **Step 4: workspace-form 테스트 실행**

실행:
```bash
pnpm --filter @agent-desk/web test -- workspace-form
```

기대: `workspace-form.test.tsx` 모두 PASS.

---

### Task E4: `workspaces-subview.tsx` EditWorkspaceForm + 뱃지

**파일:**
- 수정: `agent-desk/apps/web/components/tabs/settings/workspaces-subview.tsx`

- [ ] **Step 1: patch 타입과 EditWorkspaceForm state 확장**

`workspaces-subview.tsx` 의 `{ harnessEnabled: boolean }` patch 타입을 모두 `{ harnessEnabled: boolean; ralphLoopEnabled: boolean }` 로 교체. 코드 확인 결과(2026-05-30 기준) 위치:
- `ActiveSection` props 의 `onSave` 파라미터 타입 (대략 206-208 라인)
- `EditWorkspaceForm` props 의 `onSave` 파라미터 타입 (대략 285 라인)
- 상위 `WorkspacesSubview` 의 `onSave` 호출부 (`await gateway.workspaces.update(w.id, patch)` — `patch` 의 타입은 prop drilling 으로 흐르므로 `ActiveSection.onSave` 만 확장하면 자동 반영)

편집 전 `grep -n "harnessEnabled: boolean" apps/web/components/tabs/settings/workspaces-subview.tsx` 로 정확한 set 을 확인.

`EditWorkspaceForm` 안에 state·useId·reset effect 추가:

```tsx
  const ralphId = useId();
  const [ralph, setRalph] = useState(props.workspace.ralphLoopEnabled);
  // ... 기존 harness state ...

  useEffect(() => {
    setHarness(props.workspace.harnessEnabled);
    setRalph(props.workspace.ralphLoopEnabled);
  }, [props.workspace.id, props.workspace.harnessEnabled, props.workspace.ralphLoopEnabled]);

  const dirty =
    harness !== props.workspace.harnessEnabled ||
    ralph !== props.workspace.ralphLoopEnabled;
```

`onSubmit` 저장 호출 갱신:

```tsx
          await props.onSave({ harnessEnabled: harness, ralphLoopEnabled: ralph });
```

- [ ] **Step 2: EditWorkspaceForm 안에 ralph 체크박스 마크업 추가**

기존 harness 토글 JSX 형제로 추가:

```tsx
        <div className="flex flex-col gap-1">
          <label
            className="flex items-center gap-2 text-[13px]"
            htmlFor={ralphId}
          >
            <input
              id={ralphId}
              type="checkbox"
              checked={ralph}
              onChange={(e) => setRalph(e.target.checked)}
            />
            <span>ralph-loop 활성화 (Claude Code 전용 · 위험)</span>
          </label>
          <RalphWarningBox active={ralph} />
        </div>
```

파일 상단에 import 추가:
```tsx
import { RalphWarningBox } from "../../ralph-warning-box";
```

- [ ] **Step 3: ActiveSection 에 ralph 뱃지 추가**

기존 harness 뱃지 위치:
```tsx
                    {w.harnessEnabled && (
                      <span ...>Claude Agent Teams · 실험</span>
                    )}
```

바로 뒤에 추가:
```tsx
                    {w.ralphLoopEnabled && (
                      <span
                        className="shrink-0 whitespace-nowrap rounded border border-amber-500 px-1.5 text-[10px] text-amber-700"
                        title="ralph-loop 활성. 세션에서 /ralph-loop 실행 시 강제 반복됩니다."
                      >
                        ralph-loop · 위험
                      </span>
                    )}
```

- [ ] **Step 4: workspaces-subview 테스트 fixture 갱신**

`apps/web/tests/workspaces-subview.test.tsx`. WorkspaceDto fixture (현재 `harnessEnabled: false/true` 포함) 각각에 `ralphLoopEnabled: false` 추가.

`update` mock 시그니처:
```tsx
  async (_id: number, _input: { harnessEnabled: boolean }) => ({}),
```
다음으로:
```tsx
  async (
    _id: number,
    _input: { harnessEnabled: boolean; ralphLoopEnabled: boolean },
  ) => ({}),
```

assertion:
```tsx
      expect(update).toHaveBeenCalledWith(1, { harnessEnabled: true }),
```
다음으로:
```tsx
      expect(update).toHaveBeenCalledWith(1, {
        harnessEnabled: true,
        ralphLoopEnabled: false,
      }),
```

새 ralph 토글 테스트 추가 (기존 harness 토글 테스트와 같은 위치에):

```tsx
  it("ralph 토글 ON 시 PATCH 페이로드에 ralphLoopEnabled=true", async () => {
    update.mockClear();
    render(<WorkspacesSubview onChanged={() => {}} />);
    // fixture 목록이 렌더되길 대기
    await screen.findByText("ws-1");
    // 워크스페이스 행을 클릭해 Edit 폼 열기
    fireEvent.click(screen.getByText("ws-1"));
    // ralph 토글
    fireEvent.click(screen.getByLabelText(/ralph-loop/i));
    // 저장
    fireEvent.click(screen.getByRole("button", { name: /Save/i }));
    await waitFor(() =>
      expect(update).toHaveBeenCalledWith(1, {
        harnessEnabled: false,
        ralphLoopEnabled: true,
      }),
    );
  });
```

이 파일의 기존 harness 토글 테스트가 다른 selector(예: 행을 aria-label 로 클릭하거나 submit 버튼 이름이 다른 경우)를 쓰면 그 selector 를 그대로 미러링한다 — harness 테스트와의 차이는 (a) 토글하는 체크박스 라벨과 (b) 기대 페이로드의 `ralphLoopEnabled: true` 둘뿐이어야 한다.

- [ ] **Step 5: web 스위트 실행**

실행:
```bash
pnpm --filter @agent-desk/web test
```

기대: `workspace-form.test.tsx`, `workspaces-subview.test.tsx` PASS.

다른 테스트(`app-header.test.tsx`, `workspace-switcher.test.tsx`)는 WorkspaceDto fixture 의 누락 필드로 실패할 가능성 — 다음 Task 에서 수정.

---

### Task E5: 다른 web 테스트의 WorkspaceDto fixture 보강

**파일:**
- 수정: `agent-desk/apps/web/tests/app-header.test.tsx`
- 수정: `agent-desk/apps/web/tests/workspace-switcher.test.tsx`

- [ ] **Step 1: 모든 WorkspaceDto fixture 객체에 `ralphLoopEnabled: false` 추가**

각 파일에서 `harnessEnabled: ...` 가 있는 모든 리터럴에 `ralphLoopEnabled: false` 도 함께 추가 (테스트가 ralph 를 명시적으로 검사하지 않으면 false 가 안전).

변환 예 — before:
```tsx
{ id: 1, name: "ws", path: "/x", createdAt: 0, deletedAt: null, harnessEnabled: false }
```
after:
```tsx
{ id: 1, name: "ws", path: "/x", createdAt: 0, deletedAt: null, harnessEnabled: false, ralphLoopEnabled: false }
```

- [ ] **Step 2: web 스위트 전체 실행**

실행:
```bash
pnpm --filter @agent-desk/web test
```

기대: 모든 web 테스트 PASS.

- [ ] **Step 3: web typecheck**

실행:
```bash
pnpm --filter @agent-desk/web typecheck
```

기대: PASS.

---

## Phase F — 전체 검증 + 커밋 staging

### Task F1: 전체 검증

**파일:** 없음 (검증만)

- [ ] **Step 1: 전체 typecheck**

`agent-desk/` 에서:
```bash
pnpm typecheck
```

기대: 모든 패키지 PASS.

- [ ] **Step 2: 전체 test**

`agent-desk/` 에서:
```bash
pnpm test
```

기대: 모든 워크스페이스 PASS. ralph-loop 와 무관한 pre-existing 실패가 있으면 별도로 보고만 하고 이번 변경에서 손대지 않는다 (`CLAUDE.md`).

---

### Task F2: 사용자 검토를 위한 staging (커밋 금지)

**파일:** 없음 (검토만)

- [ ] **Step 1: 모듈별 변경 목록 출력**

`agent-desk/` 에서:
```bash
git status
```

다음 자연스러운 커밋 그룹(CLAUDE.md "표준 모듈 묶음")으로 떨어지는지 확인:

1. **`packages/shared` + `apps/gateway`** (한 커밋):
   - `packages/shared/src/api/workspace.ts`
   - `packages/shared/src/db/schema.ts`
   - `apps/gateway/drizzle/000X_*.sql`
   - `apps/gateway/drizzle/meta/_journal.json`
   - `apps/gateway/drizzle/meta/000X_snapshot.json`
   - `apps/gateway/src/skills/install.ts`
   - `apps/gateway/src/routes/workspaces.ts`
   - `apps/gateway/src/server.ts`
   - `apps/gateway/tests/ralph-loop-install.test.ts`
   - `apps/gateway/tests/workspaces.test.ts`
2. **`apps/web`** (한 커밋):
   - `apps/web/components/ralph-warning-box.tsx`
   - `apps/web/components/workspace-form.tsx`
   - `apps/web/components/tabs/settings/workspaces-subview.tsx`
   - `apps/web/tests/workspace-form.test.tsx`
   - `apps/web/tests/workspaces-subview.test.tsx`
   - `apps/web/tests/app-header.test.tsx`
   - `apps/web/tests/workspace-switcher.test.tsx`
3. **`vendor/ralph-wiggum` + `docs/superpowers/{specs,plans}/`** (한 커밋):
   - `vendor/ralph-wiggum/**`
   - `docs/superpowers/specs/2026-05-30-ralph-loop-integration-design.md`
   - `docs/superpowers/plans/2026-05-30-ralph-loop-integration.md`

- [ ] **Step 2: 멈추고 — 사용자에게 diff 요약 보고**

사용자에게 보고:
- 그룹별 변경 파일 수
- 동작 변경 요약
- `pnpm typecheck` 와 `pnpm test` 결과
- 알림: **커밋 안 함.** 사용자가 검토 후 커밋 지시.

`git add` 나 `git commit` 을 자동 실행하지 말 것. `CLAUDE.md` 와 본 계획 호출 시 사용자 지시("커밋은 하지 마세요") 모두 동일.

---

## 셀프 리뷰 노트

**스펙 커버리지** — 모든 스펙 섹션이 Task 로 매핑됨:
- §1 목표 → 전 Phase 에 분산
- §2 Claude/Codex 평가 → 스펙에 기록; 코드 Task 없음 (정보성)
- §3 Vendor 스냅샷 → Task A1
- §4 Installer 시그니처/install/remove → Task C1, C2
- §5 라우트 분기 → Task D2-D5
- §6 스키마 + DB → Task B1, B2, B3
- §7 UI 경고 + 마크업 + gateway-client SDK + subview 재사용 → Task E1-E4 (gateway-client 타입은 shared zod 에서 자동 흐름; `RalphWarningBox` 추출이 §7.4 만족)
- §8 공존성 (wp-progress) → Task C1 에 공존 테스트 포함
- §9 테스트 전략 → Task C1, D2, D4, E2 (E4/E5 에서 fixture 보강)
- §10 마이그레이션/롤아웃 → Task B3 + 스펙 §10 의 "`ensureAllSkillsInstalled` 는 그대로 — Ralph 는 명시적 opt-in 만" (실제 코드 작업 없음)
- §11 미해결 / 향후 → Upstream drift 항목은 Task A2 (`bump.sh` + README) 로 코드화됨; 나머지 (세션 헤더 배지, per-package loop) 는 범위 밖 유지

**Placeholder 스캔** — TBD/TODO/"add validation" 등 없음. 모든 단계가 정확한 파일 편집·테스트 본문·명령어로 구성됨.

**타입 일관성** — 함수명은 어디서나 `ensureRalphLoopInstalled` / `ensureRalphLoopRemoved` (Task C1, C2, D1, D2, D3, D5). 필드는 TS 에서 `ralphLoopEnabled` (camelCase), SQL 에서 `ralph_loop_enabled` (snake). `RalphWarningBox` prop 은 어디서나 `active: boolean`.

**알려진 취약점** — Task D2 의 두 PATCH 테스트가 POST 테스트에서 만든 "ralph-ws" 를 재사용함 (`list.find((w) => w.name === "ralph-ws")`). 파일 내 순서 의존. 수용 사유 — (a) `workspaces.test.ts` 는 이미 이런 시퀀싱에 의존, (b) vitest 가 이 코드베이스에서 describe/it 순서를 기본 보존. 향후 테스트 재정렬 시 `list[0]` 폴백.
