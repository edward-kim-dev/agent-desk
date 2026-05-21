# agent-desk 화면 구성 리팩토링 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 현재 3컬럼(`사이드바 | 터미널 | 위키 패널`) 단일 화면을 **상단 탭 + 풀스크린 뷰** 구조로 재편한다. 구현된 기능(워크스페이스/세션/터미널/위키)은 그대로 새 위치에 이전하고, 미구현(Graph / Harness / Settings)은 정적 와이어프레임만 만든다.

**Architecture:** `apps/web` 클라이언트 컴포넌트만 재구성한다. 게이트웨이·API·DB·`@agent-desk/shared` 변경 없음. 탭 상태는 `AppShell`이 보유하고 선택된 하나만 마운트한다(라우터 도입 없음).

**Tech Stack:** Next.js 16, React 19, TypeScript 5, Tailwind 4, Vitest 2 + @testing-library/react (jsdom). 새 라이브러리 도입 없음.

**참조 스펙:** [2026-05-20-agent-desk-screen-layout-design.md](../specs/2026-05-20-agent-desk-screen-layout-design.md)

> **커밋 정책:** 각 태스크의 작업·테스트가 끝나면, 태스크 맨 아래 박스의 **제안 커밋 메시지**를 사용자 응답에 그대로 포함만 한다. 사용자가 명시적으로 "커밋해줘"라고 지시하기 전까지 실행 에이전트가 직접 `git add`/`git commit`을 실행하지 않는다.

---

## File Structure

작업 후 `apps/web/components/`:

```
components/
├── app-shell.tsx                   # ★ 리팩토링 (헤더 + TabBar + ActiveTab)
├── tabs/
│   ├── types.ts                    # ★ 신규 (TabKey 타입)
│   ├── tab-bar.tsx                 # ★ 신규
│   ├── terminal-tab.tsx            # ★ 신규 (기존 세션 UI + 터미널 이전)
│   ├── wiki-tab.tsx                # ★ 신규 (3컬럼 + 서브뷰)
│   ├── graph-tab.tsx               # ★ 신규 (정적 와이어프레임)
│   ├── harness-tab.tsx             # ★ 신규
│   ├── settings-tab.tsx            # ★ 신규
│   ├── wiki/
│   │   ├── subview-switch.tsx      # ★ 신규
│   │   ├── meta-panel.tsx          # ★ 신규
│   │   ├── adr-board.tsx           # ★ 신규
│   │   └── review-queue.tsx        # ★ 신규
│   ├── harness/
│   │   ├── subview-switch.tsx      # ★ 신규
│   │   ├── memory-subview.tsx      # ★ 신규
│   │   ├── hooks-subview.tsx       # ★ 신규
│   │   ├── agents-subview.tsx      # ★ 신규
│   │   └── adapters-subview.tsx    # ★ 신규
│   └── settings/
│       ├── subview-switch.tsx      # ★ 신규
│       ├── general-subview.tsx     # ★ 신규
│       ├── database-subview.tsx    # ★ 신규
│       ├── cli-catalog-subview.tsx # ★ 신규
│       ├── auth-subview.tsx        # ★ 신규
│       └── about-subview.tsx       # ★ 신규
├── workspace-switcher.tsx          # 그대로 (헤더에서 사용)
├── workspace-form.tsx              # 그대로 (Terminal 탭에서 사용)
├── session-list.tsx                # 그대로 (Terminal 탭에서 사용)
├── new-session-dialog.tsx          # 그대로
├── terminal-panel.tsx              # 그대로
├── wiki-tree.tsx                   # 그대로
├── wiki-viewer.tsx                 # 그대로
├── wiki-editor.tsx                 # 그대로
├── wiki-log-composer.tsx           # 그대로
└── wiki-panel.tsx                  # ★ Task 8에서 삭제
```

신규 테스트: `apps/web/tests/`
- `tab-bar.test.tsx`
- `wiki-subview-switch.test.tsx`
- `wiki-meta-panel.test.tsx`
- `adr-board.test.tsx`
- `harness-tab.test.tsx`
- `settings-database-subview.test.tsx`
- `graph-tab.test.tsx`

> 분할 원칙·금지 항목은 spec 6장을 따른다.

---

## Task 1: TabKey 타입과 TabBar 컴포넌트

**Files:**
- Create: `apps/web/components/tabs/types.ts`
- Create: `apps/web/components/tabs/tab-bar.tsx`
- Test: `apps/web/tests/tab-bar.test.tsx`

- [ ] **Step 1: 실패 테스트 작성**

`apps/web/tests/tab-bar.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TabBar } from "../components/tabs/tab-bar";

describe("<TabBar>", () => {
  it("5개 탭을 렌더링하고 활성 탭에 aria-current를 단다", () => {
    render(<TabBar value="wiki" onChange={() => {}} />);
    expect(screen.getByRole("tab", { name: "Terminal" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Wiki" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Graph" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Harness" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Settings" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Wiki" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("tab", { name: "Terminal" }).getAttribute("aria-current")).toBeNull();
  });

  it("탭 클릭 시 해당 키로 onChange를 호출한다", () => {
    const onChange = vi.fn();
    render(<TabBar value="terminal" onChange={onChange} />);
    fireEvent.click(screen.getByRole("tab", { name: "Settings" }));
    expect(onChange).toHaveBeenCalledWith("settings");
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm --filter @agent-desk/web test tab-bar`
Expected: FAIL — `Cannot find module '../components/tabs/tab-bar'`

- [ ] **Step 3: TabKey 타입 작성**

`apps/web/components/tabs/types.ts`:

```ts
export type TabKey = "terminal" | "wiki" | "graph" | "harness" | "settings";

export const TAB_LABELS: Record<TabKey, string> = {
  terminal: "Terminal",
  wiki: "Wiki",
  graph: "Graph",
  harness: "Harness",
  settings: "Settings",
};

export const TAB_ORDER: TabKey[] = ["terminal", "wiki", "graph", "harness", "settings"];
```

- [ ] **Step 4: TabBar 구현**

`apps/web/components/tabs/tab-bar.tsx`:

```tsx
"use client";
import { TAB_LABELS, TAB_ORDER, type TabKey } from "./types";

export function TabBar(props: {
  value: TabKey;
  onChange: (next: TabKey) => void;
}) {
  return (
    <nav
      role="tablist"
      aria-label="agent-desk 모드"
      className="flex items-center gap-1 border-b px-2"
    >
      {TAB_ORDER.map((key) => {
        const active = key === props.value;
        return (
          <button
            key={key}
            role="tab"
            aria-current={active ? "page" : undefined}
            onClick={() => props.onChange(key)}
            className={`px-3 py-2 text-sm ${
              active
                ? "border-b-2 border-zinc-900 font-semibold dark:border-zinc-100"
                : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
            }`}
          >
            {TAB_LABELS[key]}
          </button>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `pnpm --filter @agent-desk/web test tab-bar`
Expected: PASS — 2개 케이스 모두 녹색.

- [ ] **Step 6: 제안 커밋 메시지**

```
feat(web): TabKey 타입과 TabBar 컴포넌트 추가
```

---

## Task 2: 빈 탭 컴포넌트 5개 stub

각각 자리만 잡는다. 후속 태스크에서 내용을 채운다.

**Files:**
- Create: `apps/web/components/tabs/terminal-tab.tsx`
- Create: `apps/web/components/tabs/wiki-tab.tsx`
- Create: `apps/web/components/tabs/graph-tab.tsx`
- Create: `apps/web/components/tabs/harness-tab.tsx`
- Create: `apps/web/components/tabs/settings-tab.tsx`

- [ ] **Step 1: 다섯 stub 파일 작성 — 동일 패턴**

`apps/web/components/tabs/terminal-tab.tsx`:

```tsx
"use client";

export function TerminalTab(_props: {
  activeWorkspaceId: number | null;
  onWorkspacesChanged: () => void;
}) {
  return (
    <div className="grid h-full place-items-center text-sm text-zinc-500">
      Terminal tab (stub)
    </div>
  );
}
```

`apps/web/components/tabs/wiki-tab.tsx`:

```tsx
"use client";

export function WikiTab(_props: { workspaceId: number | null }) {
  return (
    <div className="grid h-full place-items-center text-sm text-zinc-500">
      Wiki tab (stub)
    </div>
  );
}
```

`apps/web/components/tabs/graph-tab.tsx`:

```tsx
"use client";

export function GraphTab() {
  return (
    <div className="grid h-full place-items-center text-sm text-zinc-500">
      Graph tab (stub)
    </div>
  );
}
```

`apps/web/components/tabs/harness-tab.tsx`:

```tsx
"use client";

export function HarnessTab() {
  return (
    <div className="grid h-full place-items-center text-sm text-zinc-500">
      Harness tab (stub)
    </div>
  );
}
```

`apps/web/components/tabs/settings-tab.tsx`:

```tsx
"use client";

export function SettingsTab() {
  return (
    <div className="grid h-full place-items-center text-sm text-zinc-500">
      Settings tab (stub)
    </div>
  );
}
```

- [ ] **Step 2: 타입 체크**

Run: `pnpm --filter @agent-desk/web typecheck`
Expected: PASS — 사용처가 아직 없으므로 unused warning만 가능.

- [ ] **Step 3: 제안 커밋 메시지**

```
feat(web): 탭 컴포넌트 5종 stub 추가
```

---

## Task 3: AppShell을 탭 셸로 재편

3컬럼 grid를 `헤더(auto) + TabBar(auto) + ActiveTab(1fr)` 2행으로 바꾼다. 세션 폴링 로직은 Task 4에서 TerminalTab으로 옮긴다 — 이번에는 일단 그대로 두고 prop drilling 없이 TerminalTab에 다 위임할 수 있게 모양만 만든다.

**Files:**
- Modify: `apps/web/components/app-shell.tsx` (전면 재작성)

- [ ] **Step 1: AppShell 재작성**

`apps/web/components/app-shell.tsx`:

```tsx
"use client";
import { useCallback, useEffect, useState } from "react";
import type { WorkspaceDto } from "@agent-desk/shared";
import { gateway } from "@/lib/gateway-client";
import { WorkspaceSwitcher } from "./workspace-switcher";
import { TabBar } from "./tabs/tab-bar";
import type { TabKey } from "./tabs/types";
import { TerminalTab } from "./tabs/terminal-tab";
import { WikiTab } from "./tabs/wiki-tab";
import { GraphTab } from "./tabs/graph-tab";
import { HarnessTab } from "./tabs/harness-tab";
import { SettingsTab } from "./tabs/settings-tab";

export function AppShell() {
  const [workspaces, setWorkspaces] = useState<WorkspaceDto[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [tab, setTab] = useState<TabKey>("terminal");

  const refresh = useCallback(async () => {
    const { workspaces } = await gateway.workspaces.list();
    setWorkspaces(workspaces);
    if (workspaces.length > 0 && activeId == null) setActiveId(workspaces[0].id);
  }, [activeId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <div className="grid h-screen grid-rows-[auto_auto_1fr]">
      <header className="flex items-center gap-4 border-b px-4 py-2">
        <h1 className="font-semibold">agent-desk</h1>
        <WorkspaceSwitcher
          workspaces={workspaces}
          activeId={activeId}
          onSelect={setActiveId}
        />
        <div className="flex-1" />
        <span aria-hidden className="text-xs text-zinc-400" data-stub="true">
          !0
        </span>
        <span className="text-xs text-zinc-500">v0.2</span>
      </header>
      <TabBar value={tab} onChange={setTab} />
      <main className="min-h-0 overflow-hidden">
        {tab === "terminal" && (
          <TerminalTab
            activeWorkspaceId={activeId}
            onWorkspacesChanged={refresh}
          />
        )}
        {tab === "wiki" && <WikiTab workspaceId={activeId} />}
        {tab === "graph" && <GraphTab />}
        {tab === "harness" && <HarnessTab />}
        {tab === "settings" && <SettingsTab />}
      </main>
    </div>
  );
}
```

- [ ] **Step 2: 브라우저 확인**

Run: `pnpm --filter @agent-desk/web dev`
Expected: `http://localhost:3333` 로드 → 상단에 헤더 + 5탭 + 빈 본문. 클릭마다 stub 문구 전환.

- [ ] **Step 3: 기존 vitest 통과 확인**

Run: `pnpm --filter @agent-desk/web test`
Expected: PASS — `<TabBar>`, `<SessionList>`, `<WikiTree>`, `<WorkspaceSwitcher>`, proxy 테스트 모두 통과.

- [ ] **Step 4: 제안 커밋 메시지**

```
feat(web): AppShell을 헤더 + TabBar + ActiveTab 구조로 재편
```

---

## Task 4: TerminalTab에 세션 사이드바 + 터미널 이전

기존 사이드바(WorkspaceForm + SessionList + NewSessionDialog)와 TerminalPanel을 TerminalTab으로 옮긴다. 세션 폴링도 함께 이동.

**Files:**
- Modify: `apps/web/components/tabs/terminal-tab.tsx` (전면 재작성)

- [ ] **Step 1: TerminalTab 구현**

`apps/web/components/tabs/terminal-tab.tsx`:

```tsx
"use client";
import { useCallback, useEffect, useState } from "react";
import type { SessionDto } from "@agent-desk/shared";
import { gateway } from "@/lib/gateway-client";
import { WorkspaceForm } from "../workspace-form";
import { SessionList } from "../session-list";
import { NewSessionDialog } from "../new-session-dialog";
import { TerminalPanel } from "../terminal-panel";

export function TerminalTab(props: {
  activeWorkspaceId: number | null;
  onWorkspacesChanged: () => void;
}) {
  const [sessions, setSessions] = useState<SessionDto[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null);

  const refreshSessions = useCallback(async () => {
    try {
      const { sessions } = await gateway.sessions.list();
      setSessions(sessions);
    } catch {}
  }, []);

  useEffect(() => {
    refreshSessions();
    const t = setInterval(refreshSessions, 3000);
    return () => clearInterval(t);
  }, [refreshSessions]);

  return (
    <div className="grid h-full grid-cols-[18rem_1fr]">
      <aside className="flex min-w-0 flex-col gap-3 overflow-y-auto border-r p-3">
        <WorkspaceForm onCreated={props.onWorkspacesChanged} />
        <section className="mt-2 flex items-center justify-between text-xs uppercase text-zinc-500">
          sessions
          {props.activeWorkspaceId != null && (
            <NewSessionDialog
              workspaceId={props.activeWorkspaceId}
              onCreated={refreshSessions}
            />
          )}
        </section>
        <SessionList
          sessions={sessions}
          activeWorkspaceId={props.activeWorkspaceId}
          selectedId={selectedSessionId}
          onSelect={setSelectedSessionId}
          onKill={async (id) => {
            await gateway.sessions.remove(id);
            refreshSessions();
          }}
        />
      </aside>
      <section className="bg-black text-zinc-100">
        <TerminalPanel sessionId={selectedSessionId} />
      </section>
    </div>
  );
}
```

- [ ] **Step 2: 타입 체크**

Run: `pnpm --filter @agent-desk/web typecheck`
Expected: PASS.

- [ ] **Step 3: 브라우저 수동 회귀**

Run: `pnpm --filter @agent-desk/web dev` (이미 떠 있다면 자동 갱신)
체크:
- 워크스페이스 생성 → SessionSwitcher와 사이드바 둘 다 갱신.
- New Session → 세션 생성 → 행에 노출 → 클릭하여 터미널 attach → 입력이 echo됨.
- 다른 탭으로 이동 → 다시 Terminal로 복귀 → 터미널이 재attach되어 즉시 사용 가능(스크롤백은 tmux 보존).
- 세션 kill → 행 사라짐.

- [ ] **Step 4: 기존 vitest 재실행**

Run: `pnpm --filter @agent-desk/web test`
Expected: PASS (테스트 변경 없음).

- [ ] **Step 5: 제안 커밋 메시지**

```
feat(web): Terminal 탭으로 세션 사이드바와 터미널 이전
```

---

## Task 5: Wiki 탭 — 서브뷰 스위치

**Files:**
- Create: `apps/web/components/tabs/wiki/subview-switch.tsx`
- Test: `apps/web/tests/wiki-subview-switch.test.tsx`

- [ ] **Step 1: 실패 테스트 작성**

`apps/web/tests/wiki-subview-switch.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { WikiSubviewSwitch } from "../components/tabs/wiki/subview-switch";

describe("<WikiSubviewSwitch>", () => {
  it("4개 옵션을 렌더링하고 활성 옵션에 aria-current를 단다", () => {
    render(<WikiSubviewSwitch value="adr" onChange={() => {}} />);
    expect(screen.getByRole("tab", { name: "문서" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "ADR 보드" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Review Queue" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Log" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "ADR 보드" }).getAttribute("aria-current")).toBe("page");
  });

  it("클릭 시 onChange 호출", () => {
    const onChange = vi.fn();
    render(<WikiSubviewSwitch value="docs" onChange={onChange} />);
    fireEvent.click(screen.getByRole("tab", { name: "Log" }));
    expect(onChange).toHaveBeenCalledWith("log");
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm --filter @agent-desk/web test wiki-subview-switch`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: 구현**

`apps/web/components/tabs/wiki/subview-switch.tsx`:

```tsx
"use client";

export type WikiSubview = "docs" | "adr" | "review" | "log";

const LABELS: Record<WikiSubview, string> = {
  docs: "문서",
  adr: "ADR 보드",
  review: "Review Queue",
  log: "Log",
};
const ORDER: WikiSubview[] = ["docs", "adr", "review", "log"];

export function WikiSubviewSwitch(props: {
  value: WikiSubview;
  onChange: (next: WikiSubview) => void;
}) {
  return (
    <nav role="tablist" aria-label="위키 서브뷰" className="flex gap-1 border-b px-2">
      {ORDER.map((key) => {
        const active = key === props.value;
        return (
          <button
            key={key}
            role="tab"
            aria-current={active ? "page" : undefined}
            onClick={() => props.onChange(key)}
            className={`px-3 py-1.5 text-xs ${
              active
                ? "border-b-2 border-zinc-900 font-semibold dark:border-zinc-100"
                : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
            }`}
          >
            {LABELS[key]}
          </button>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm --filter @agent-desk/web test wiki-subview-switch`
Expected: PASS.

- [ ] **Step 5: 제안 커밋 메시지**

```
feat(web): WikiSubviewSwitch 컴포넌트 추가
```

---

## Task 6: Wiki 메타 패널

문서 서브뷰 우측에 붙는 메타 패널. 데이터는 props로만 받는다(API 신설 금지). claim type 카운트는 부모(WikiTab)에서 본문 정규식 카운트로 계산해 내려준다.

**Files:**
- Create: `apps/web/components/tabs/wiki/meta-panel.tsx`
- Test: `apps/web/tests/wiki-meta-panel.test.tsx`

- [ ] **Step 1: 실패 테스트 작성**

`apps/web/tests/wiki-meta-panel.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { WikiMetaPanel } from "../components/tabs/wiki/meta-panel";

describe("<WikiMetaPanel>", () => {
  it("열린 파일이 없으면 안내 텍스트를 보여준다", () => {
    render(<WikiMetaPanel openFile={null} brokenLinks={[]} />);
    expect(screen.getByText(/문서가 선택되지 않음/)).toBeTruthy();
  });

  it("열린 파일의 layer, claim 카운트, 깨진 링크 수를 렌더링한다", () => {
    render(
      <WikiMetaPanel
        openFile={{
          path: "concepts/foo.md",
          layer: "concept",
          claimCounts: { source: 5, analysis: 3, unverified: 1, gap: 0 },
        }}
        brokenLinks={["bar.md"]}
      />
    );
    expect(screen.getByText(/concepts\/foo.md/)).toBeTruthy();
    expect(screen.getByText(/concept/)).toBeTruthy();
    expect(screen.getByText(/source.*5/)).toBeTruthy();
    expect(screen.getByText(/analysis.*3/)).toBeTruthy();
    expect(screen.getByText(/broken.*1/)).toBeTruthy();
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm --filter @agent-desk/web test wiki-meta-panel`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: 구현**

`apps/web/components/tabs/wiki/meta-panel.tsx`:

```tsx
"use client";

export interface WikiMetaFile {
  path: string;
  layer: string | null;
  claimCounts: { source: number; analysis: number; unverified: number; gap: number };
}

export function WikiMetaPanel(props: {
  openFile: WikiMetaFile | null;
  brokenLinks: string[];
}) {
  if (!props.openFile) {
    return (
      <aside className="border-l p-3 text-xs text-zinc-500">
        문서가 선택되지 않음
      </aside>
    );
  }
  const f = props.openFile;
  return (
    <aside className="flex flex-col gap-3 border-l p-3 text-xs">
      <div>
        <div className="font-mono text-zinc-700 dark:text-zinc-300">{f.path}</div>
        <div className="mt-1 text-zinc-500">layer: {f.layer ?? "—"}</div>
      </div>
      <div>
        <div className="mb-1 font-semibold text-zinc-700 dark:text-zinc-300">claims</div>
        <ul className="grid grid-cols-2 gap-x-3 text-zinc-600 dark:text-zinc-400">
          <li>source: {f.claimCounts.source}</li>
          <li>analysis: {f.claimCounts.analysis}</li>
          <li>unverified: {f.claimCounts.unverified}</li>
          <li>gap: {f.claimCounts.gap}</li>
        </ul>
      </div>
      <div>
        <div className="mb-1 font-semibold text-zinc-700 dark:text-zinc-300">links</div>
        <div className="text-zinc-600 dark:text-zinc-400">
          backlinks: — · broken: {props.brokenLinks.length}
        </div>
        {props.brokenLinks.length > 0 && (
          <ul className="mt-1 text-red-600">
            {props.brokenLinks.map((l) => (
              <li key={l}>↯ {l}</li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm --filter @agent-desk/web test wiki-meta-panel`
Expected: PASS.

- [ ] **Step 5: 제안 커밋 메시지**

```
feat(web): WikiMetaPanel 컴포넌트 추가
```

---

## Task 7: ADR 보드

`wiki/decisions/**/*.md` 트리 노드를 표 형태로 렌더. 행 클릭 시 부모로 path를 콜백.

**Files:**
- Create: `apps/web/components/tabs/wiki/adr-board.tsx`
- Test: `apps/web/tests/adr-board.test.tsx`

- [ ] **Step 1: 실패 테스트 작성**

`apps/web/tests/adr-board.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AdrBoard } from "../components/tabs/wiki/adr-board";

const tree = {
  name: "wiki",
  path: "",
  type: "dir" as const,
  children: [
    {
      name: "decisions",
      path: "decisions",
      type: "dir" as const,
      children: [
        { name: "0001-foo.md", path: "decisions/0001-foo.md", type: "file" as const },
        { name: "0002-bar.md", path: "decisions/0002-bar.md", type: "file" as const },
      ],
    },
    { name: "log.md", path: "log.md", type: "file" as const },
  ],
};

describe("<AdrBoard>", () => {
  it("decisions 디렉터리의 .md 파일을 행으로 렌더", () => {
    render(<AdrBoard tree={tree} onOpen={() => {}} />);
    expect(screen.getByText("0001-foo.md")).toBeTruthy();
    expect(screen.getByText("0002-bar.md")).toBeTruthy();
    expect(screen.queryByText("log.md")).toBeNull();
  });

  it("행 클릭 시 onOpen에 path 전달", () => {
    const onOpen = vi.fn();
    render(<AdrBoard tree={tree} onOpen={onOpen} />);
    fireEvent.click(screen.getByText("0001-foo.md"));
    expect(onOpen).toHaveBeenCalledWith("decisions/0001-foo.md");
  });

  it("decisions 디렉터리가 없으면 안내 메시지", () => {
    render(
      <AdrBoard
        tree={{ name: "wiki", path: "", type: "dir", children: [] }}
        onOpen={() => {}}
      />
    );
    expect(screen.getByText(/wiki\/decisions 가 비어 있습니다/)).toBeTruthy();
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm --filter @agent-desk/web test adr-board`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: 구현**

`apps/web/components/tabs/wiki/adr-board.tsx`:

```tsx
"use client";
import type { WikiNode } from "../../wiki-tree";

function findDecisions(root: WikiNode): WikiNode[] {
  if (root.type !== "dir") return [];
  const decisionsDir = root.children?.find(
    (c) => c.type === "dir" && c.name === "decisions"
  );
  if (!decisionsDir) return [];
  const files: WikiNode[] = [];
  const walk = (n: WikiNode) => {
    if (n.type === "file" && n.path.endsWith(".md")) files.push(n);
    n.children?.forEach(walk);
  };
  decisionsDir.children?.forEach(walk);
  files.sort((a, b) => a.name.localeCompare(b.name));
  return files;
}

export function AdrBoard(props: {
  tree: WikiNode;
  onOpen: (path: string) => void;
}) {
  const files = findDecisions(props.tree);
  if (files.length === 0) {
    return (
      <div className="p-4 text-sm text-zinc-500">
        wiki/decisions 가 비어 있습니다.
      </div>
    );
  }
  return (
    <table className="w-full text-sm">
      <thead className="border-b text-left text-xs uppercase text-zinc-500">
        <tr>
          <th className="px-3 py-2">파일</th>
          <th className="px-3 py-2">상태</th>
          <th className="px-3 py-2">날짜</th>
        </tr>
      </thead>
      <tbody>
        {files.map((f) => (
          <tr
            key={f.path}
            className="cursor-pointer border-b hover:bg-zinc-50 dark:hover:bg-zinc-900"
            onClick={() => props.onOpen(f.path)}
          >
            <td className="px-3 py-2 font-mono">{f.name}</td>
            <td className="px-3 py-2 text-zinc-500">—</td>
            <td className="px-3 py-2 text-zinc-500">—</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

> 상태/날짜는 프론트매터 파싱이 추가되면 채운다. 지금은 `—`.

- [ ] **Step 4: 통과 확인**

Run: `pnpm --filter @agent-desk/web test adr-board`
Expected: PASS (3 케이스).

- [ ] **Step 5: 제안 커밋 메시지**

```
feat(web): ADR 보드 컴포넌트 추가
```

---

## Task 8: Review Queue 정적 뷰

`wiki/infra/review-queue.md`(없으면 `wiki/review-queue.md`)를 마크다운으로 렌더. 데이터는 부모가 fetch한 문자열을 props로.

**Files:**
- Create: `apps/web/components/tabs/wiki/review-queue.tsx`

- [ ] **Step 1: 구현**

`apps/web/components/tabs/wiki/review-queue.tsx`:

```tsx
"use client";
import { marked } from "marked";

export function ReviewQueue(props: { content: string | null }) {
  if (props.content == null) {
    return (
      <div className="p-4 text-sm text-zinc-500">
        review-queue.md 가 없습니다. (wiki/infra/review-queue.md 또는 wiki/review-queue.md)
      </div>
    );
  }
  const html = marked.parse(props.content, { breaks: true }) as string;
  return (
    <article
      className="prose prose-sm max-w-none p-4 dark:prose-invert"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
```

- [ ] **Step 2: 타입 체크**

Run: `pnpm --filter @agent-desk/web typecheck`
Expected: PASS.

- [ ] **Step 3: 제안 커밋 메시지**

```
feat(web): ReviewQueue 컴포넌트 추가
```

---

## Task 9: WikiTab 통합

서브뷰 스위치 + 4개 서브뷰를 한 탭으로 묶는다. `docs` 서브뷰에서 기존 트리/뷰어/에디터를 사용. WikiPanel의 로직을 가져오되 새 컴포넌트 분해에 맞춘다.

**Files:**
- Modify: `apps/web/components/tabs/wiki-tab.tsx` (재작성)

- [ ] **Step 1: WikiTab 재작성**

`apps/web/components/tabs/wiki-tab.tsx`:

```tsx
"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { WikiTree, type WikiNode } from "../wiki-tree";
import { WikiViewer } from "../wiki-viewer";
import { WikiEditor } from "../wiki-editor";
import { WikiLogComposer } from "../wiki-log-composer";
import { WikiSubviewSwitch, type WikiSubview } from "./wiki/subview-switch";
import { WikiMetaPanel } from "./wiki/meta-panel";
import { AdrBoard } from "./wiki/adr-board";
import { ReviewQueue } from "./wiki/review-queue";

interface WikiFile {
  path: string;
  content: string;
  schemaWarnings: string[];
}

function countClaims(text: string) {
  const tally = { source: 0, analysis: 0, unverified: 0, gap: 0 };
  for (const m of text.matchAll(/\b(source|analysis|unverified|gap)\b/g)) {
    tally[m[1] as keyof typeof tally]++;
  }
  return tally;
}

function frontmatterLayer(text: string): string | null {
  const fm = text.match(/^---\n([\s\S]*?)\n---/);
  if (!fm) return null;
  const layer = fm[1].match(/^layer:\s*(\S+)/m);
  return layer ? layer[1] : null;
}

function findKnownPaths(node: WikiNode, into: Set<string>): void {
  if (node.type === "file") into.add(node.path);
  node.children?.forEach((c) => findKnownPaths(c, into));
}

function brokenLinksOf(content: string, known: Set<string>): string[] {
  return Array.from(content.matchAll(/\[[^\]]+\]\(([^)\s]+\.md)\)/g))
    .map((m) => m[1])
    .filter((t) => !known.has(t.replace(/^\.?\//, "")));
}

export function WikiTab(props: { workspaceId: number | null }) {
  const [subview, setSubview] = useState<WikiSubview>("docs");
  const [tree, setTree] = useState<WikiNode | null>(null);
  const [openFile, setOpenFile] = useState<WikiFile | null>(null);
  const [reviewBody, setReviewBody] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (props.workspaceId == null) return setTree(null);
    const res = await fetch(`/api/proxy/workspaces/${props.workspaceId}/wiki/tree`);
    if (res.ok) {
      const body = await res.json();
      setTree(body.root);
    }
  }, [props.workspaceId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Review Queue 콘텐츠 한 번 로드 (subview가 review일 때만)
  useEffect(() => {
    if (subview !== "review" || props.workspaceId == null) return;
    (async () => {
      for (const p of ["infra/review-queue.md", "review-queue.md"]) {
        const r = await fetch(
          `/api/proxy/workspaces/${props.workspaceId}/wiki/file?path=${encodeURIComponent(p)}`
        );
        if (r.ok) {
          const f = (await r.json()) as { content: string };
          setReviewBody(f.content);
          return;
        }
      }
      setReviewBody(null);
    })();
  }, [subview, props.workspaceId]);

  const open = useCallback(
    async (path: string) => {
      if (props.workspaceId == null) return;
      const res = await fetch(
        `/api/proxy/workspaces/${props.workspaceId}/wiki/file?path=${encodeURIComponent(path)}`
      );
      if (res.ok) {
        setOpenFile(await res.json());
        if (subview !== "docs") setSubview("docs");
      }
    },
    [props.workspaceId, subview]
  );

  const known = useMemo(() => {
    const s = new Set<string>();
    if (tree) findKnownPaths(tree, s);
    return s;
  }, [tree]);

  const brokenLinks = useMemo(
    () => (openFile ? brokenLinksOf(openFile.content, known) : []),
    [openFile, known]
  );

  if (props.workspaceId == null) {
    return (
      <div className="grid h-full place-items-center text-sm text-zinc-500">
        no workspace selected
      </div>
    );
  }
  if (!tree) {
    return (
      <div className="grid h-full place-items-center text-sm text-zinc-500">
        no wiki/ in workspace
      </div>
    );
  }

  return (
    <div className="grid h-full grid-rows-[auto_1fr]">
      <WikiSubviewSwitch value={subview} onChange={setSubview} />
      {subview === "docs" && (
        <div className="grid min-h-0 grid-cols-[16rem_1fr_18rem]">
          <aside className="overflow-y-auto border-r p-3 text-sm">
            <ul>
              <WikiTree node={tree} onOpen={open} />
            </ul>
          </aside>
          <section className="overflow-y-auto p-3 text-sm">
            {openFile ? (
              <>
                <WikiViewer
                  path={openFile.path}
                  content={openFile.content}
                  schemaWarnings={openFile.schemaWarnings}
                  brokenLinks={brokenLinks}
                />
                <details className="mt-3">
                  <summary className="cursor-pointer text-xs text-zinc-500">edit</summary>
                  <WikiEditor
                    initialContent={openFile.content}
                    onSave={async (next) => {
                      const r = await fetch(
                        `/api/proxy/workspaces/${props.workspaceId}/wiki/file`,
                        {
                          method: "PUT",
                          headers: { "content-type": "application/json" },
                          body: JSON.stringify({ path: openFile.path, content: next }),
                        }
                      );
                      if (!r.ok) throw new Error(`save failed: ${r.status}`);
                      const body = (await r.json()) as { schemaWarnings: string[] };
                      setOpenFile({
                        ...openFile,
                        content: next,
                        schemaWarnings: body.schemaWarnings,
                      });
                      await refresh();
                      return body;
                    }}
                  />
                </details>
              </>
            ) : (
              <div className="text-zinc-500">왼쪽 트리에서 문서를 선택하세요.</div>
            )}
          </section>
          <WikiMetaPanel
            openFile={
              openFile
                ? {
                    path: openFile.path,
                    layer: frontmatterLayer(openFile.content),
                    claimCounts: countClaims(openFile.content),
                  }
                : null
            }
            brokenLinks={brokenLinks}
          />
        </div>
      )}
      {subview === "adr" && (
        <div className="min-h-0 overflow-y-auto">
          <AdrBoard tree={tree} onOpen={open} />
        </div>
      )}
      {subview === "review" && (
        <div className="min-h-0 overflow-y-auto">
          <ReviewQueue content={reviewBody} />
        </div>
      )}
      {subview === "log" && (
        <div className="min-h-0 overflow-y-auto p-3 text-sm">
          <WikiLogComposer workspaceId={props.workspaceId} />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 타입 체크**

Run: `pnpm --filter @agent-desk/web typecheck`
Expected: PASS.

- [ ] **Step 3: 브라우저 회귀**

체크:
- Wiki 탭 → 좌측 트리 표시, 파일 클릭 → 가운데 뷰어 + 우측 메타.
- ADR 보드 탭 → `decisions/*` 행 표시, 클릭 시 docs 서브뷰로 점프 + 그 파일 오픈.
- Review Queue 탭 → `wiki/infra/review-queue.md` 있으면 렌더, 없으면 안내.
- Log 탭 → 기존 WikiLogComposer 동작.

- [ ] **Step 4: 기존 vitest 통과**

Run: `pnpm --filter @agent-desk/web test`
Expected: 모두 PASS.

- [ ] **Step 5: 제안 커밋 메시지**

```
feat(web): Wiki 탭 통합 (서브뷰 4종 + 메타 패널)
```

---

## Task 10: Graph 탭 정적 와이어프레임

**Files:**
- Modify: `apps/web/components/tabs/graph-tab.tsx` (재작성)
- Test: `apps/web/tests/graph-tab.test.tsx`

- [ ] **Step 1: 실패 테스트 작성**

`apps/web/tests/graph-tab.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GraphTab } from "../components/tabs/graph-tab";

describe("<GraphTab>", () => {
  it("placeholder 안내와 disabled 컨트롤을 렌더", () => {
    const { container } = render(<GraphTab />);
    expect(screen.getByText(/coming in v0.3/i)).toBeTruthy();
    expect(screen.getByLabelText(/search/i)).toHaveProperty("disabled", true);
    expect(container.querySelector('[data-stub="true"]')).toBeTruthy();
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm --filter @agent-desk/web test graph-tab`
Expected: FAIL — 새 placeholder 미존재.

- [ ] **Step 3: GraphTab 구현**

`apps/web/components/tabs/graph-tab.tsx`:

```tsx
"use client";

const LAYERS = ["sources", "concepts", "entities", "decisions", "synthesis", "infra"];
const CLAIM_TYPES = ["source", "analysis", "unverified", "gap"];

export function GraphTab() {
  return (
    <div
      data-stub="true"
      className="grid h-full grid-cols-[16rem_1fr_18rem]"
    >
      <aside className="overflow-y-auto border-r p-3 text-xs">
        <div className="font-semibold uppercase text-zinc-500">Filters</div>
        <fieldset disabled className="mt-2 flex flex-col gap-1">
          <legend className="text-zinc-500">Layer</legend>
          {LAYERS.map((l) => (
            <label key={l} className="flex items-center gap-2">
              <input type="checkbox" defaultChecked />
              {l}
            </label>
          ))}
          <legend className="mt-3 text-zinc-500">Claim type</legend>
          {CLAIM_TYPES.map((c) => (
            <label key={c} className="flex items-center gap-2">
              <input type="checkbox" defaultChecked={c === "source"} />
              {c}
            </label>
          ))}
          <label className="mt-3 flex items-center gap-2">
            <input type="checkbox" /> broken only
          </label>
        </fieldset>
      </aside>
      <section className="flex flex-col">
        <div className="flex items-center gap-2 border-b px-3 py-2 text-xs">
          <label className="flex items-center gap-2">
            search
            <input
              aria-label="search"
              disabled
              placeholder="🔍 (coming in v0.3)"
              className="rounded border px-2 py-1"
            />
          </label>
          <span className="flex-1" />
          <label className="flex items-center gap-2">
            layout
            <select disabled className="rounded border px-2 py-1">
              <option>force</option>
            </select>
          </label>
          <button disabled className="rounded border px-2 py-1">
            reset
          </button>
        </div>
        <div className="grid flex-1 place-items-center">
          <div className="rounded border border-dashed p-6 text-center text-sm text-zinc-500">
            <svg width="160" height="100" viewBox="0 0 160 100" aria-hidden>
              <line x1="20" y1="50" x2="80" y2="20" stroke="currentColor" />
              <line x1="80" y1="20" x2="140" y2="50" stroke="currentColor" />
              <line x1="80" y1="20" x2="80" y2="80" stroke="currentColor" />
              <circle cx="20" cy="50" r="6" fill="currentColor" />
              <circle cx="80" cy="20" r="6" fill="currentColor" />
              <circle cx="140" cy="50" r="6" fill="currentColor" />
              <circle cx="80" cy="80" r="6" fill="currentColor" />
            </svg>
            <div className="mt-3">Graph rendering — coming in v0.3</div>
          </div>
        </div>
      </section>
      <aside className="overflow-y-auto border-l p-3 text-xs">
        <div className="font-semibold uppercase text-zinc-500">Selected node</div>
        <div className="mt-2 text-zinc-500">no selection</div>
      </aside>
    </div>
  );
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm --filter @agent-desk/web test graph-tab`
Expected: PASS.

- [ ] **Step 5: 제안 커밋 메시지**

```
feat(web): Graph 탭 와이어프레임 추가 (placeholder)
```

---

## Task 11: Harness 서브뷰 스위치 + 4개 서브뷰

**Files:**
- Create: `apps/web/components/tabs/harness/subview-switch.tsx`
- Create: `apps/web/components/tabs/harness/memory-subview.tsx`
- Create: `apps/web/components/tabs/harness/hooks-subview.tsx`
- Create: `apps/web/components/tabs/harness/agents-subview.tsx`
- Create: `apps/web/components/tabs/harness/adapters-subview.tsx`
- Modify: `apps/web/components/tabs/harness-tab.tsx` (재작성)
- Test: `apps/web/tests/harness-tab.test.tsx`

- [ ] **Step 1: 실패 테스트 작성**

`apps/web/tests/harness-tab.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HarnessTab } from "../components/tabs/harness-tab";

describe("<HarnessTab>", () => {
  it("기본 서브뷰는 Memory이고 다른 서브뷰로 전환 가능", () => {
    render(<HarnessTab />);
    expect(screen.getByText(/source of truth/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Hooks" }));
    expect(screen.getByRole("columnheader", { name: "Event" })).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Adapters" }));
    expect(screen.getByText("claude")).toBeTruthy();
    expect(screen.getByText("gemini")).toBeTruthy();
    expect(screen.getByText("codex")).toBeTruthy();
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm --filter @agent-desk/web test harness-tab`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: 서브뷰 스위치 구현**

`apps/web/components/tabs/harness/subview-switch.tsx`:

```tsx
"use client";

export type HarnessSubview = "memory" | "hooks" | "agents" | "adapters";

const LABELS: Record<HarnessSubview, string> = {
  memory: "Memory",
  hooks: "Hooks",
  agents: "Sub-agents",
  adapters: "Adapters",
};
const ORDER: HarnessSubview[] = ["memory", "hooks", "agents", "adapters"];

export function HarnessSubviewSwitch(props: {
  value: HarnessSubview;
  onChange: (next: HarnessSubview) => void;
}) {
  return (
    <nav role="tablist" aria-label="하네스 서브뷰" className="flex gap-1 border-b px-2">
      {ORDER.map((key) => {
        const active = key === props.value;
        return (
          <button
            key={key}
            role="tab"
            aria-current={active ? "page" : undefined}
            onClick={() => props.onChange(key)}
            className={`px-3 py-1.5 text-xs ${
              active
                ? "border-b-2 border-zinc-900 font-semibold dark:border-zinc-100"
                : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
            }`}
          >
            {LABELS[key]}
          </button>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 4: Memory 서브뷰 구현**

`apps/web/components/tabs/harness/memory-subview.tsx`:

```tsx
"use client";

const FILES = ["CLAUDE.md", "AGENTS.md", "GEMINI.md"];
const DUMMY_DIFFS = [
  "L23: 메모리 규칙 문구 차이",
  "L41: 훅 소개 순서",
  "L78: 어댑터 설정 키 차이",
  "L102: 위키 참조 경로",
  "L150: 종결 안내 톤",
];

export function MemorySubview() {
  return (
    <div data-stub="true" className="grid h-full grid-cols-[16rem_1fr]">
      <aside className="overflow-y-auto border-r p-3 text-sm">
        <div className="font-semibold uppercase text-zinc-500">Files</div>
        <ul className="mt-2 flex flex-col gap-1 font-mono text-xs">
          {FILES.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
        <fieldset disabled className="mt-4 text-xs">
          <legend className="text-zinc-500">Source of truth</legend>
          {FILES.map((f, i) => (
            <label key={f} className="mt-1 flex items-center gap-2">
              <input type="radio" name="sot" defaultChecked={i === 0} />
              {f}
            </label>
          ))}
        </fieldset>
      </aside>
      <section className="flex flex-col p-3 text-sm">
        <div className="text-zinc-700 dark:text-zinc-300">
          CLAUDE.md ↔ AGENTS.md
        </div>
        <div className="mt-1 text-xs text-amber-700">⚠ {DUMMY_DIFFS.length} 불일치 항목</div>
        <ul className="mt-2 list-disc pl-5 text-xs text-zinc-600 dark:text-zinc-400">
          {DUMMY_DIFFS.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
        <div className="mt-4 flex gap-2">
          <button disabled className="rounded border px-3 py-1 text-xs">
            수동 편집
          </button>
          <button disabled className="rounded border px-3 py-1 text-xs">
            수정 세션 열기 → Terminal
          </button>
        </div>
        <div className="mt-6 rounded border border-dashed p-4 text-center text-xs text-zinc-500">
          diff view — coming in v0.3
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 5: Hooks 서브뷰 구현**

`apps/web/components/tabs/harness/hooks-subview.tsx`:

```tsx
"use client";

export function HooksSubview() {
  return (
    <div data-stub="true" className="p-3 text-sm">
      <table className="w-full">
        <thead className="border-b text-left text-xs uppercase text-zinc-500">
          <tr>
            <th scope="col" className="px-3 py-2">Event</th>
            <th scope="col" className="px-3 py-2">Matcher</th>
            <th scope="col" className="px-3 py-2">Command</th>
            <th scope="col" className="px-3 py-2">Source</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td colSpan={4} className="px-3 py-6 text-center text-zinc-500">
              no hooks loaded — coming in v0.3
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 6: Sub-agents 서브뷰 구현**

`apps/web/components/tabs/harness/agents-subview.tsx`:

```tsx
"use client";

export function AgentsSubview() {
  return (
    <div data-stub="true" className="grid h-full place-items-center p-3 text-sm text-zinc-500">
      no agents defined — coming in v0.3
    </div>
  );
}
```

- [ ] **Step 7: Adapters 서브뷰 구현**

`apps/web/components/tabs/harness/adapters-subview.tsx`:

```tsx
"use client";

const ADAPTERS = [
  { name: "claude", target: "~/.claude/agents/" },
  { name: "gemini", target: "~/.gemini/agents/" },
  { name: "codex", target: "~/.codex/agents/" },
];

export function AdaptersSubview() {
  return (
    <div data-stub="true" className="grid h-full grid-cols-3 gap-3 p-3 text-sm">
      {ADAPTERS.map((a) => (
        <article key={a.name} className="rounded border p-3">
          <h3 className="font-semibold">{a.name}</h3>
          <div className="mt-1 text-xs text-zinc-500">Export target</div>
          <div className="font-mono text-xs">{a.target}</div>
          <button disabled className="mt-3 rounded border px-2 py-1 text-xs">
            Export
          </button>
        </article>
      ))}
    </div>
  );
}
```

- [ ] **Step 8: HarnessTab 통합**

`apps/web/components/tabs/harness-tab.tsx`:

```tsx
"use client";
import { useState } from "react";
import { HarnessSubviewSwitch, type HarnessSubview } from "./harness/subview-switch";
import { MemorySubview } from "./harness/memory-subview";
import { HooksSubview } from "./harness/hooks-subview";
import { AgentsSubview } from "./harness/agents-subview";
import { AdaptersSubview } from "./harness/adapters-subview";

export function HarnessTab() {
  const [sub, setSub] = useState<HarnessSubview>("memory");
  return (
    <div className="grid h-full grid-rows-[auto_1fr]">
      <HarnessSubviewSwitch value={sub} onChange={setSub} />
      <div className="min-h-0">
        {sub === "memory" && <MemorySubview />}
        {sub === "hooks" && <HooksSubview />}
        {sub === "agents" && <AgentsSubview />}
        {sub === "adapters" && <AdaptersSubview />}
      </div>
    </div>
  );
}
```

- [ ] **Step 9: 통과 확인**

Run: `pnpm --filter @agent-desk/web test harness-tab`
Expected: PASS.

- [ ] **Step 10: 제안 커밋 메시지**

```
feat(web): Harness 탭 와이어프레임 추가 (4 서브뷰)
```

---

## Task 12: Settings 서브뷰 스위치 + 5개 서브뷰

Database 서브뷰만 폼 충실히, 나머지는 짧은 placeholder.

**Files:**
- Create: `apps/web/components/tabs/settings/subview-switch.tsx`
- Create: `apps/web/components/tabs/settings/general-subview.tsx`
- Create: `apps/web/components/tabs/settings/database-subview.tsx`
- Create: `apps/web/components/tabs/settings/cli-catalog-subview.tsx`
- Create: `apps/web/components/tabs/settings/auth-subview.tsx`
- Create: `apps/web/components/tabs/settings/about-subview.tsx`
- Modify: `apps/web/components/tabs/settings-tab.tsx` (재작성)
- Test: `apps/web/tests/settings-database-subview.test.tsx`

- [ ] **Step 1: 실패 테스트 작성**

`apps/web/tests/settings-database-subview.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DatabaseSubview } from "../components/tabs/settings/database-subview";

describe("<DatabaseSubview>", () => {
  it("모든 입력은 disabled, password 입력란은 존재하지 않고 .env 안내가 보인다", () => {
    render(<DatabaseSubview />);
    expect(screen.getByLabelText(/host/i)).toHaveProperty("disabled", true);
    expect(screen.getByLabelText(/port/i)).toHaveProperty("disabled", true);
    expect(screen.getByLabelText(/database/i)).toHaveProperty("disabled", true);
    expect(screen.getByLabelText(/user/i)).toHaveProperty("disabled", true);
    expect(screen.queryByLabelText(/password/i)).toBeNull();
    expect(screen.getByText(/AGENT_DESK_DB_PASSWORD/)).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /test connection/i })
    ).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: /save/i })).toHaveProperty("disabled", true);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm --filter @agent-desk/web test settings-database-subview`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: SubviewSwitch 구현**

`apps/web/components/tabs/settings/subview-switch.tsx`:

```tsx
"use client";

export type SettingsSubview =
  | "general"
  | "database"
  | "cli-catalog"
  | "auth"
  | "about";

const LABELS: Record<SettingsSubview, string> = {
  general: "General",
  database: "Database",
  "cli-catalog": "CLI Catalog",
  auth: "Auth",
  about: "About",
};
const ORDER: SettingsSubview[] = ["general", "database", "cli-catalog", "auth", "about"];

export function SettingsSubviewSwitch(props: {
  value: SettingsSubview;
  onChange: (next: SettingsSubview) => void;
}) {
  return (
    <nav role="tablist" aria-label="설정 서브뷰" className="flex gap-1 border-b px-2">
      {ORDER.map((key) => {
        const active = key === props.value;
        return (
          <button
            key={key}
            role="tab"
            aria-current={active ? "page" : undefined}
            onClick={() => props.onChange(key)}
            className={`px-3 py-1.5 text-xs ${
              active
                ? "border-b-2 border-zinc-900 font-semibold dark:border-zinc-100"
                : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
            }`}
          >
            {LABELS[key]}
          </button>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 4: General 서브뷰 구현**

`apps/web/components/tabs/settings/general-subview.tsx`:

```tsx
"use client";

export function GeneralSubview() {
  return (
    <div data-stub="true" className="flex flex-col gap-4 p-4 text-sm">
      <fieldset disabled>
        <legend className="text-xs uppercase text-zinc-500">Theme</legend>
        <div className="mt-2 flex gap-4 text-xs">
          {["auto", "light", "dark"].map((t, i) => (
            <label key={t} className="flex items-center gap-2">
              <input type="radio" name="theme" defaultChecked={i === 0} />
              {t}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="text-xs text-zinc-500">About agent-desk v0.2</div>
    </div>
  );
}
```

- [ ] **Step 5: Database 서브뷰 구현**

`apps/web/components/tabs/settings/database-subview.tsx`:

```tsx
"use client";

export function DatabaseSubview() {
  return (
    <div data-stub="true" className="grid h-full grid-cols-[14rem_1fr] gap-6 p-4 text-sm">
      <aside className="text-xs">
        <fieldset disabled>
          <legend className="text-zinc-500">Mode</legend>
          <label className="mt-1 flex items-center gap-2">
            <input type="radio" name="db-mode" defaultChecked /> Local SQLite
          </label>
          <label className="mt-1 flex items-center gap-2">
            <input type="radio" name="db-mode" /> Remote Postgres
          </label>
        </fieldset>
        <div className="mt-6 text-zinc-500">Migration</div>
        <button disabled className="mt-1 rounded border px-2 py-1 text-xs">
          Local → Remote Wizard
        </button>
        <ol className="mt-3 list-decimal pl-4 text-zinc-500">
          <li>snapshot</li>
          <li>restore on PG</li>
          <li>switch mode</li>
        </ol>
      </aside>
      <section className="flex flex-col gap-3 text-xs">
        <div>
          <div className="text-zinc-500">Current</div>
          <div className="font-mono">SQLite (local)</div>
          <div className="font-mono text-zinc-500">
            path: agent-desk/data/agent-desk.sqlite
          </div>
        </div>
        <fieldset disabled className="flex flex-col gap-2">
          <legend className="text-zinc-500">Remote connection (Postgres)</legend>
          <label className="flex items-center gap-2">
            <span className="w-20">host</span>
            <input
              aria-label="host"
              className="rounded border px-2 py-1"
              placeholder="db.example.com"
            />
          </label>
          <label className="flex items-center gap-2">
            <span className="w-20">port</span>
            <input
              aria-label="port"
              className="rounded border px-2 py-1"
              defaultValue="5432"
            />
          </label>
          <label className="flex items-center gap-2">
            <span className="w-20">database</span>
            <input
              aria-label="database"
              className="rounded border px-2 py-1"
              placeholder="agent_desk"
            />
          </label>
          <label className="flex items-center gap-2">
            <span className="w-20">user</span>
            <input
              aria-label="user"
              className="rounded border px-2 py-1"
              placeholder="agent_desk"
            />
          </label>
          <div className="flex items-center gap-2">
            <span className="w-20">password</span>
            <span className="text-zinc-500">
              .env (AGENT_DESK_DB_PASSWORD)
            </span>
          </div>
        </fieldset>
        <div className="flex gap-2">
          <button disabled className="rounded border px-3 py-1">
            Test connection
          </button>
          <button disabled className="rounded border px-3 py-1">
            Save
          </button>
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 6: CLI Catalog 서브뷰 구현**

`apps/web/components/tabs/settings/cli-catalog-subview.tsx`:

```tsx
"use client";

const CATALOG = [
  { name: "claude", command: "claude", defaultArgs: "" },
  { name: "gemini", command: "gemini", defaultArgs: "" },
  { name: "codex", command: "codex", defaultArgs: "" },
];

export function CliCatalogSubview() {
  return (
    <div data-stub="true" className="p-4 text-sm">
      <table className="w-full">
        <thead className="border-b text-left text-xs uppercase text-zinc-500">
          <tr>
            <th scope="col" className="px-3 py-2">name</th>
            <th scope="col" className="px-3 py-2">command</th>
            <th scope="col" className="px-3 py-2">default args</th>
          </tr>
        </thead>
        <tbody className="text-xs">
          {CATALOG.map((c) => (
            <tr key={c.name} className="border-b">
              <td className="px-3 py-2 font-mono">{c.name}</td>
              <td className="px-3 py-2 font-mono">{c.command}</td>
              <td className="px-3 py-2 text-zinc-500">{c.defaultArgs || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 7: Auth 서브뷰 구현**

`apps/web/components/tabs/settings/auth-subview.tsx`:

```tsx
"use client";

export function AuthSubview() {
  return (
    <div data-stub="true" className="p-4 text-sm">
      Token is read from <code>AGENT_DESK_TOKEN</code> env var only.
    </div>
  );
}
```

- [ ] **Step 8: About 서브뷰 구현**

`apps/web/components/tabs/settings/about-subview.tsx`:

```tsx
"use client";

export function AboutSubview() {
  return (
    <div data-stub="true" className="flex flex-col gap-1 p-4 text-sm">
      <div>agent-desk v0.2</div>
      <div className="text-xs text-zinc-500">browser-based AI coding session manager</div>
    </div>
  );
}
```

- [ ] **Step 9: SettingsTab 통합**

`apps/web/components/tabs/settings-tab.tsx`:

```tsx
"use client";
import { useState } from "react";
import {
  SettingsSubviewSwitch,
  type SettingsSubview,
} from "./settings/subview-switch";
import { GeneralSubview } from "./settings/general-subview";
import { DatabaseSubview } from "./settings/database-subview";
import { CliCatalogSubview } from "./settings/cli-catalog-subview";
import { AuthSubview } from "./settings/auth-subview";
import { AboutSubview } from "./settings/about-subview";

export function SettingsTab() {
  const [sub, setSub] = useState<SettingsSubview>("general");
  return (
    <div className="grid h-full grid-rows-[auto_1fr]">
      <SettingsSubviewSwitch value={sub} onChange={setSub} />
      <div className="min-h-0 overflow-y-auto">
        {sub === "general" && <GeneralSubview />}
        {sub === "database" && <DatabaseSubview />}
        {sub === "cli-catalog" && <CliCatalogSubview />}
        {sub === "auth" && <AuthSubview />}
        {sub === "about" && <AboutSubview />}
      </div>
    </div>
  );
}
```

- [ ] **Step 10: 통과 확인**

Run: `pnpm --filter @agent-desk/web test settings-database-subview`
Expected: PASS.

- [ ] **Step 11: 전체 테스트**

Run: `pnpm --filter @agent-desk/web test`
Expected: 모두 PASS (기존 + 신규).

- [ ] **Step 12: 제안 커밋 메시지**

```
feat(web): Settings 탭 와이어프레임 추가 (DB 마이그레이션 플로우 포함)
```

---

## Task 13: WikiPanel 제거 + 타입체크/린트/회귀

WikiTab으로 흡수됐으므로 이전 컨테이너 컴포넌트 삭제. 잔여 import / dead code 정리.

**Files:**
- Delete: `apps/web/components/wiki-panel.tsx`

- [ ] **Step 1: WikiPanel 참조 grep**

Run: `grep -rn "wiki-panel\|WikiPanel" apps/web --include='*.ts*'`
Expected: 출력 없음(또는 자기 자신만). 다른 파일에 import가 남아 있다면 그 파일을 먼저 정리해야 한다.

- [ ] **Step 2: 파일 삭제**

```bash
rm apps/web/components/wiki-panel.tsx
```

- [ ] **Step 3: 타입 체크**

Run: `pnpm --filter @agent-desk/web typecheck`
Expected: PASS.

- [ ] **Step 4: 린트**

Run: `pnpm --filter @agent-desk/web lint`
Expected: PASS (혹은 사전 경고 그대로 유지). 새로 도입된 에러는 0.

- [ ] **Step 5: 전체 테스트**

Run: `pnpm --filter @agent-desk/web test`
Expected: PASS.

- [ ] **Step 6: 수동 회귀 (브라우저)**

체크리스트:
- Terminal 탭: 워크스페이스/세션 CRUD + 터미널 입출력 정상.
- Wiki 탭 > 문서: 트리 열람·뷰어·에디터 저장 정상, 우측 메타가 layer/claim/broken 표시.
- Wiki 탭 > ADR 보드: `decisions/` 파일 표 노출, 클릭 시 docs 서브뷰로 이동하며 해당 파일 오픈.
- Wiki 탭 > Review Queue: 콘텐츠 있으면 마크다운 렌더, 없으면 안내.
- Wiki 탭 > Log: 기존 LogComposer 정상.
- Graph 탭: 더미 SVG + disabled 컨트롤, 콘솔 에러 없음.
- Harness 탭: 4개 서브뷰 전환, 모든 입력 disabled.
- Settings 탭: 5개 서브뷰 전환, Database 폼 입력 disabled, password 입력 없음.

- [ ] **Step 7: TODO/README 메모**

`apps/web/`에 별도 README가 없으면 `agent-desk/TODO.md`에 한 줄 추가:

`agent-desk/TODO.md` 의 끝에 다음 추가:

```markdown

## UI 재편 (2026-05-20)

- [ ] v0.3: Graph 렌더링 (cytoscape 또는 d3-force), Harness/Hooks/Agents 실데이터 연결, Settings.Database 마이그레이션 실행.
- v0.2 와이어프레임: 상단 탭(Terminal/Wiki/Graph/Harness/Settings) 풀스크린 구조. Graph/Harness/Settings 는 placeholder.
```

- [ ] **Step 8: 제안 커밋 메시지**

```
chore(web): WikiPanel 제거 + UI 재편 후 cleanup
```

---

> 비포함/명시적 제외 항목은 spec 2장(범위 외)·8장(비포함)을 따른다.

## Self-Review

**1. Spec coverage**

| Spec 섹션 | 담당 태스크 |
|---|---|
| 3.1 상단 탭 + 풀스크린 IA | Task 1, 3 |
| 3.2 글로벌 헤더 + 알림 배지 자리 | Task 3 |
| 3.3 탭 비활성 시 언마운트 | Task 3 |
| 4.1 Terminal 탭 (세션 사이드바 + 터미널) | Task 4 |
| 4.2.1 Wiki 4 서브뷰 | Task 5, 9 |
| 4.2.2 ADR = Wiki 서브뷰 (decisions/) | Task 7, 9 |
| 4.2.3 메타 패널 (layer/claim/broken) | Task 6, 9 |
| 4.2.4 본문 동작 보존 | Task 9 |
| 4.3 Graph 탭 와이어프레임 | Task 10 |
| 4.4 Harness 4 서브뷰 | Task 11 |
| 4.5 Settings 5 서브뷰, DB 마이그레이션 | Task 12 |
| 4.5.2 password input 없음 (.env 참조만) | Task 12 (테스트로 검증) |
| 5. 데이터/네트워크 변경 없음 | 전 태스크 준수 |
| 6. 컴포넌트 분할 + data-stub | Task 10, 11, 12 |

**2. Placeholder scan** — 코드 step에 "TBD"/"TODO"/"implement later" 문구 없음. 모든 코드 블록 풀로 작성. ADR 보드 상태/날짜 컬럼은 "—" 출력(데이터 부재의 의도적 표시) — spec 2장/8장에 v0.3+로 명시.

**3. Type consistency** — `WikiSubview`, `HarnessSubview`, `SettingsSubview`, `TabKey` 모두 한 곳에서 정의되고 import. `WikiNode`는 기존 `components/wiki-tree.tsx` 익스포트를 그대로 사용. `WikiMetaFile`은 meta-panel.tsx 안에서만 사용되므로 충돌 없음. `gateway.workspaces.list()`/`gateway.sessions.list()` 시그니처는 기존 `lib/gateway-client.ts` 그대로 — 변경 없음.

---

## Execution Handoff

이 plan은 13개 태스크다. 각 태스크는 자체 완결되며, TDD 흐름(실패 테스트 → 구현 → 통과)을 따른다. 신규 컴포넌트마다 최소 1개의 vitest 케이스를 박는다.

두 가지 실행 옵션:

**1. Subagent-Driven (recommended)** — task별로 fresh subagent를 띄워 격리 실행하고 사이사이 리뷰.

**2. Inline Execution** — 이 세션에서 `executing-plans`로 묶음 실행하며 체크포인트마다 리뷰.

어느 쪽으로 갈지 알려주세요.
