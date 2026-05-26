# agent-desk hill-test 헤더/컨테이너 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `hill-test.html`의 매거진 톤 헤더와 1180px 중앙 정렬 컨테이너를 agent-desk 웹 앱(`agent-desk/apps/web`)에 적용한다.

**Architecture:** `app-shell.tsx`의 풀스크린 grid를 1180px 컨테이너로 교체한다. 헤더 우측 데코 nav가 실제 탭 전환 역할을 하도록 `TabBar`를 헤더 안으로 끌어들인다. 워크스페이스 전환·인디케이터·버전은 헤더 아래의 작은 meta 줄로 옮긴다. 헤더+meta 줄은 새 `AppHeader` 컴포넌트로 분리해 RTL 테스트가 가능하게 한다. 다크 모드 토큰은 `@custom-variant` 한 줄로 explicit-only 모드로 전환해 사실상 비활성화한다.

**Tech Stack:** Next.js 16 · React 19 · Tailwind 4 · Vitest + Testing Library · `@agent-desk/shared` 타입.

**Spec:** [docs/superpowers/specs/2026-05-22-agent-desk-hill-test-header-design.md](docs/superpowers/specs/2026-05-22-agent-desk-hill-test-header-design.md)

---

## File Structure

수정하는 파일 (책임):
- `agent-desk/apps/web/app/globals.css` — body 컬러·폰트 토큰, 다크 모드 비활성화
- `agent-desk/apps/web/app/layout.tsx` — body className 정리 (다크 토큰 제거, 배경은 globals.css가 책임)
- `agent-desk/apps/web/components/workspace-switcher.tsx` — 버튼/메뉴 톤을 meta 줄에 맞게 재조정
- `agent-desk/apps/web/components/tabs/tab-bar.tsx` — hill-test 데코 nav 스타일로 시각 변환
- `agent-desk/apps/web/components/app-shell.tsx` — 풀스크린 grid를 1180px 컨테이너로 교체, `HalftoneLogo` import 제거, `AppHeader` 사용

새로 만드는 파일:
- `agent-desk/apps/web/components/app-header.tsx` — 헤더(logo + TabBar) + meta 줄(WorkspaceSwitcher + !0 + version) 단일 단위. props 기반 stateless.
- `agent-desk/apps/web/tests/app-header.test.tsx` — AppHeader 구조 RTL 테스트

손대지 않는 파일:
- `components/halftone/*` — `/halftone` 데모 페이지에서 계속 사용됨
- 탭 내부 컴포넌트 일체 (terminal, wiki, graph, harness, settings)
- gateway·shared 패키지

---

## Task 1: globals.css — hill-test 톤으로 교체하고 다크 모드 비활성화

**Files:**
- Modify: `agent-desk/apps/web/app/globals.css`

- [ ] **Step 1: globals.css를 새 톤으로 전부 교체**

  Replace the entire contents of `agent-desk/apps/web/app/globals.css` with:

  ```css
  @import "tailwindcss";

  /* dark: 유틸리티는 [data-theme="dark"]가 명시될 때만 활성. 우리는 명시하지 않으므로
     OS prefers-color-scheme이 dark여도 영향이 없다. */
  @custom-variant dark (&:where([data-theme="dark"], [data-theme="dark"] *));

  @font-face {
    font-family: "D2Coding Ligature";
    src: url("/fonts/D2CodingLigature-Regular.woff2") format("woff2");
    font-weight: 400;
    font-style: normal;
    font-display: swap;
  }

  @font-face {
    font-family: "D2Coding Ligature";
    src: url("/fonts/D2CodingLigature-Bold.woff2") format("woff2");
    font-weight: 700;
    font-style: normal;
    font-display: swap;
  }

  :root {
    --background: #ffffff;
    --foreground: #1a1208;
    --hill-rule: rgba(26, 18, 8, 0.12);
  }

  @theme inline {
    --color-background: var(--background);
    --color-foreground: var(--foreground);
    --font-sans: var(--font-geist-sans);
    --font-mono: var(--font-geist-mono);
  }

  body {
    background: var(--background);
    color: var(--foreground);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, sans-serif;
    font-weight: 400;
    -webkit-font-smoothing: antialiased;
  }
  ```

  핵심 변경:
  - `@media (prefers-color-scheme: dark)` 블록 삭제
  - `@custom-variant dark` 한 줄로 dark: 유틸리티를 사실상 OFF
  - `--foreground` 를 `#1a1208`로 (hill-test 본문 색)
  - `--hill-rule` 토큰 추가 (헤더/푸터 border-bottom용)
  - body font-family를 hill-test 시스템 폰트 스택으로

- [ ] **Step 2: 타입체크와 기존 테스트가 깨지지 않는지 확인**

  Run from `agent-desk/`:
  ```bash
  pnpm --filter @agent-desk/web typecheck
  pnpm --filter @agent-desk/web test
  ```
  Expected: 둘 다 통과. 기존 테스트는 DOM 구조에 의존하므로 CSS 변경에는 영향이 없다.

- [ ] **Step 3: Commit**

  ```bash
  git add agent-desk/apps/web/app/globals.css
  git commit -m "style(web): hill-test 톤 토큰 적용 및 prefers-color-scheme dark 비활성화"
  ```

---

## Task 2: layout.tsx — body 클래스에서 다크 토큰 제거

**Files:**
- Modify: `agent-desk/apps/web/app/layout.tsx`

- [ ] **Step 1: body className에서 색 토큰 제거**

  현재:
  ```tsx
  <body className="min-h-full bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
  ```
  로:
  ```tsx
  <body className="min-h-full">
  ```

  배경/텍스트 컬러는 `globals.css`의 `body` 룰이 책임진다. `min-h-full`은 layout 자체가 부모 `<html className="h-full">`의 높이를 채우기 위해 남긴다.

- [ ] **Step 2: 타입체크와 테스트 통과 확인**

  ```bash
  pnpm --filter @agent-desk/web typecheck
  pnpm --filter @agent-desk/web test
  ```
  Expected: 통과.

- [ ] **Step 3: Commit**

  ```bash
  git add agent-desk/apps/web/app/layout.tsx
  git commit -m "style(web): layout body 다크 모드 클래스 제거"
  ```

---

## Task 3: TabBar — hill-test 데코 nav 스타일로 시각 변환

기존 `role="tablist"`·`aria-current` 동작과 onChange 인터페이스를 그대로 유지하면서 시각만 hill-test nav로 바꾼다. 이렇게 하면 `tests/tab-bar.test.tsx`는 수정 없이 그대로 통과한다.

**Files:**
- Modify: `agent-desk/apps/web/components/tabs/tab-bar.tsx`

- [ ] **Step 1: 기존 tab-bar 테스트가 baseline으로 통과하는지 확인**

  ```bash
  pnpm --filter @agent-desk/web test -- tests/tab-bar.test.tsx
  ```
  Expected: 2 tests PASS. 이 baseline을 깨지 않는 것이 Task 3의 목표.

- [ ] **Step 2: tab-bar.tsx를 hill-test nav 스타일로 교체**

  `agent-desk/apps/web/components/tabs/tab-bar.tsx` 의 전체 내용을:

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
        className="flex items-center"
      >
        {TAB_ORDER.map((key) => {
          const active = key === props.value;
          return (
            <button
              key={key}
              role="tab"
              aria-current={active ? "page" : undefined}
              onClick={() => props.onChange(key)}
              className={[
                "ml-7 first:ml-0 text-[11px] uppercase tracking-[0.22em]",
                "text-[#1a1208] transition-opacity",
                active ? "opacity-100 font-semibold" : "opacity-65 hover:opacity-100",
                "bg-transparent border-0 p-0 cursor-pointer",
              ].join(" ")}
            >
              {TAB_LABELS[key]}
            </button>
          );
        })}
      </nav>
    );
  }
  ```

  핵심:
  - 외곽 `border-b`·`px-2` 제거 — hill-test의 인라인 nav 형태
  - 항목 간격은 `ml-7` (28px)로 hill-test의 `margin-left: 28px` 재현
  - `text-[11px] uppercase tracking-[0.22em]`로 헤더 타이포 통일
  - 활성 탭은 `opacity-100 font-semibold`, 비활성은 `opacity-65 hover:opacity-100`
  - `aria-current="page"`·`role="tab"`·label은 그대로 → 기존 테스트 그대로 통과

- [ ] **Step 3: tab-bar 테스트가 여전히 통과하는지 확인**

  ```bash
  pnpm --filter @agent-desk/web test -- tests/tab-bar.test.tsx
  ```
  Expected: 2 tests PASS.

- [ ] **Step 4: Commit**

  ```bash
  git add agent-desk/apps/web/components/tabs/tab-bar.tsx
  git commit -m "style(web): TabBar를 hill-test nav 스타일로 변환"
  ```

---

## Task 4: WorkspaceSwitcher — meta 줄 톤으로 재조정

`role="button"` 기반 테스트(`tests/workspace-switcher.test.tsx`)는 버튼의 accessible name(워크스페이스 이름)에 의존한다. 이름과 마크업 구조는 그대로 두고, 시각만 hill-test meta 톤으로 바꾼다.

**Files:**
- Modify: `agent-desk/apps/web/components/workspace-switcher.tsx`

- [ ] **Step 1: workspace-switcher 테스트가 baseline으로 통과하는지 확인**

  ```bash
  pnpm --filter @agent-desk/web test -- tests/workspace-switcher.test.tsx
  ```
  Expected: 2 tests PASS.

- [ ] **Step 2: workspace-switcher.tsx 시각 교체**

  `agent-desk/apps/web/components/workspace-switcher.tsx` 의 전체 내용을:

  ```tsx
  "use client";
  import type { WorkspaceDto } from "@agent-desk/shared";

  export function WorkspaceSwitcher(props: {
    workspaces: WorkspaceDto[];
    activeId: number | null;
    onSelect: (id: number) => void;
  }) {
    const active = props.workspaces.find((w) => w.id === props.activeId);
    if (props.workspaces.length === 0) {
      return (
        <div className="text-[10px] uppercase tracking-[0.24em] opacity-45">
          no workspace yet
        </div>
      );
    }
    const others = props.workspaces.filter((w) => w.id !== props.activeId);
    return (
      <details className="relative">
        <summary className="cursor-pointer list-none">
          <button
            className={[
              "text-[10px] uppercase tracking-[0.24em] opacity-55 hover:opacity-100",
              "bg-transparent border-0 p-0 cursor-pointer",
            ].join(" ")}
          >
            workspace · {active?.name ?? "select"} ⌄
          </button>
        </summary>
        <ul
          className={[
            "absolute top-full left-0 z-10 mt-2 w-56 bg-white",
            "border border-[var(--hill-rule)] shadow-sm",
          ].join(" ")}
        >
          {others.map((w) => (
            <li key={w.id}>
              <button
                className={[
                  "block w-full px-3 py-2 text-left",
                  "text-[11px] tracking-[0.04em] text-[#1a1208] hover:bg-[#1a1208]/5",
                ].join(" ")}
                onClick={() => props.onSelect(w.id)}
              >
                {w.name}
                <span className="ml-2 text-[10px] opacity-50">{w.path}</span>
              </button>
            </li>
          ))}
        </ul>
      </details>
    );
  }
  ```

  핵심:
  - 활성 버튼의 텍스트는 `workspace · {name} ⌄` — 테스트는 `name: /side/i`(부분 일치)이므로 그대로 매칭
  - 빈 상태 텍스트 `no workspace yet`도 그대로 → `getByText(/no workspace/i)` 매칭
  - 굵은 border·rounded 박스 → 가는 hairline 메뉴로 변경
  - 다크 모드 클래스 (`dark:bg-zinc-900` 등) 제거

- [ ] **Step 3: workspace-switcher 테스트가 여전히 통과하는지 확인**

  ```bash
  pnpm --filter @agent-desk/web test -- tests/workspace-switcher.test.tsx
  ```
  Expected: 2 tests PASS.

- [ ] **Step 4: Commit**

  ```bash
  git add agent-desk/apps/web/components/workspace-switcher.tsx
  git commit -m "style(web): WorkspaceSwitcher를 meta 줄 톤으로 재조정"
  ```

---

## Task 5: AppHeader 컴포넌트 — 실패하는 테스트부터 작성

`app-shell.tsx`에서 헤더·meta 줄을 props 기반 stateless 컴포넌트로 분리한다. 분리하면 gateway 모킹 없이 RTL 테스트가 가능하다.

**Files:**
- Create: `agent-desk/apps/web/tests/app-header.test.tsx`

- [ ] **Step 1: 실패하는 테스트를 작성**

  Create `agent-desk/apps/web/tests/app-header.test.tsx`:

  ```tsx
  import { fireEvent, render, screen } from "@testing-library/react";
  import { describe, expect, it, vi } from "vitest";
  import { AppHeader } from "../components/app-header";

  const workspaces = [
    { id: 1, name: "owngo", path: "/workspaces/owngo", createdAt: 0 },
  ];

  describe("<AppHeader>", () => {
    it("로고·탭 nav·meta 줄을 모두 렌더한다", () => {
      render(
        <AppHeader
          workspaces={workspaces}
          activeId={1}
          onSelectWorkspace={() => {}}
          tab="terminal"
          onTabChange={() => {}}
          version="v0.2"
        />
      );
      // 로고
      expect(screen.getByText(/agent-desk/i)).toBeTruthy();
      // 탭 nav (TabBar의 role="tab" 항목)
      expect(screen.getByRole("tab", { name: "Terminal" })).toBeTruthy();
      expect(
        screen.getByRole("tab", { name: "Terminal" }).getAttribute("aria-current")
      ).toBe("page");
      // 워크스페이스 스위처 (활성 워크스페이스 이름이 버튼 label에 포함됨)
      expect(screen.getByRole("button", { name: /owngo/i })).toBeTruthy();
      // 버전
      expect(screen.getByText("v0.2")).toBeTruthy();
    });

    it("탭 클릭 시 onTabChange에 새 탭 키를 전달한다", () => {
      const onTabChange = vi.fn();
      render(
        <AppHeader
          workspaces={workspaces}
          activeId={1}
          onSelectWorkspace={() => {}}
          tab="terminal"
          onTabChange={onTabChange}
          version="v0.2"
        />
      );
      fireEvent.click(screen.getByRole("tab", { name: "Wiki" }));
      expect(onTabChange).toHaveBeenCalledWith("wiki");
    });
  });
  ```

- [ ] **Step 2: 테스트가 실패하는지 확인**

  ```bash
  pnpm --filter @agent-desk/web test -- tests/app-header.test.tsx
  ```
  Expected: FAIL. `Cannot find module '../components/app-header'` 또는 import 실패.

- [ ] **Step 3: Commit (실패하는 테스트 먼저)**

  ```bash
  git add agent-desk/apps/web/tests/app-header.test.tsx
  git commit -m "test(web): AppHeader 구조 테스트 추가 (실패)"
  ```

---

## Task 6: AppHeader 컴포넌트 — 구현

**Files:**
- Create: `agent-desk/apps/web/components/app-header.tsx`

- [ ] **Step 1: AppHeader 구현**

  Create `agent-desk/apps/web/components/app-header.tsx`:

  ```tsx
  "use client";
  import type { WorkspaceDto } from "@agent-desk/shared";
  import { WorkspaceSwitcher } from "./workspace-switcher";
  import { TabBar } from "./tabs/tab-bar";
  import type { TabKey } from "./tabs/types";

  export function AppHeader(props: {
    workspaces: WorkspaceDto[];
    activeId: number | null;
    onSelectWorkspace: (id: number) => void;
    tab: TabKey;
    onTabChange: (next: TabKey) => void;
    version: string;
  }) {
    return (
      <>
        <header
          className={[
            "flex items-center justify-between",
            "text-[11px] uppercase tracking-[0.22em]",
            "pb-7 border-b border-[var(--hill-rule)]",
          ].join(" ")}
        >
          <h1 className="sr-only">agent-desk</h1>
          <div className="font-semibold">agent-desk  ⁄  desk</div>
          <TabBar value={props.tab} onChange={props.onTabChange} />
        </header>
        <div
          className={[
            "mt-4 mb-24 flex items-center justify-between",
            "text-[10px] uppercase tracking-[0.24em] opacity-100",
          ].join(" ")}
        >
          <WorkspaceSwitcher
            workspaces={props.workspaces}
            activeId={props.activeId}
            onSelect={props.onSelectWorkspace}
          />
          <div className="flex items-center gap-4 opacity-45">
            <span aria-hidden data-stub="true">!0</span>
            <span>{props.version}</span>
          </div>
        </div>
      </>
    );
  }
  ```

  핵심:
  - hill-test header 톤: `pb-7` (28px), `border-b` + hill-rule 색
  - 헤더 아래 `mt-4` 살짝 띄우고 meta 줄 → `mb-24` (96px)로 main 시작 전 큰 여백
  - meta 줄 안에서 `WorkspaceSwitcher`는 자체 opacity 55%, 우측 `!0 v0.2`는 opacity 45% (hill-test `.hero .meta` 톤)
  - `<h1 className="sr-only">` 스크린리더용 유지

- [ ] **Step 2: app-header 테스트가 통과하는지 확인**

  ```bash
  pnpm --filter @agent-desk/web test -- tests/app-header.test.tsx
  ```
  Expected: 2 tests PASS.

- [ ] **Step 3: 전체 테스트가 여전히 통과하는지 확인**

  ```bash
  pnpm --filter @agent-desk/web test
  ```
  Expected: ALL PASS.

- [ ] **Step 4: Commit**

  ```bash
  git add agent-desk/apps/web/components/app-header.tsx
  git commit -m "feat(web): AppHeader 컴포넌트 분리 (hill-test 헤더 + meta 줄)"
  ```

---

## Task 7: app-shell.tsx — 1180px 컨테이너로 재구성, AppHeader 사용

**Files:**
- Modify: `agent-desk/apps/web/components/app-shell.tsx`

- [ ] **Step 1: app-shell.tsx 전체 교체**

  `agent-desk/apps/web/components/app-shell.tsx` 의 전체 내용을:

  ```tsx
  "use client";
  import { useCallback, useEffect, useState } from "react";
  import type { WorkspaceDto } from "@agent-desk/shared";
  import { gateway } from "@/lib/gateway-client";
  import { AppHeader } from "./app-header";
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
      <div
        className={[
          "mx-auto flex min-h-screen flex-col",
          "max-w-[1180px] px-12 pt-9 pb-20",
          "max-md:px-6 max-md:pt-6 max-md:pb-[60px]",
        ].join(" ")}
      >
        <AppHeader
          workspaces={workspaces}
          activeId={activeId}
          onSelectWorkspace={setActiveId}
          tab={tab}
          onTabChange={setTab}
          version="v0.2"
        />
        <main className="min-h-0 flex-1 overflow-hidden">
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

  핵심:
  - `grid h-screen grid-rows-[auto_auto_1fr]` → `mx-auto flex min-h-screen flex-col max-w-[1180px]`
  - `px-12 pt-9 pb-20` ≈ hill-test container `padding: 36px 48px 80px`
  - `max-md:` 분기 (Tailwind 4의 `max-md`는 `(max-width: 767px)`)로 모바일 padding 축소
  - `HalftoneLogo` import 제거
  - `WorkspaceSwitcher` import 제거 (AppHeader가 책임)
  - `TabBar` import 제거 (AppHeader가 책임)
  - 별도 `<TabBar>` 줄 제거 — TabBar는 이제 헤더 안에 있음
  - `main`은 `flex-1 min-h-0 overflow-hidden`으로 남은 세로 공간 채움

- [ ] **Step 2: 타입체크 통과 확인**

  ```bash
  pnpm --filter @agent-desk/web typecheck
  ```
  Expected: 통과. 사용하지 않는 import가 없어야 함.

- [ ] **Step 3: 전체 테스트 통과 확인**

  ```bash
  pnpm --filter @agent-desk/web test
  ```
  Expected: ALL PASS.

- [ ] **Step 4: Commit**

  ```bash
  git add agent-desk/apps/web/components/app-shell.tsx
  git commit -m "feat(web): app-shell을 1180px 컨테이너로 재구성, AppHeader 통합"
  ```

---

## Task 8: 시각 검증 (dev 서버)

**Files:** 없음 (수동 검증)

- [ ] **Step 1: gateway + web 동시 기동**

  agent-desk 루트에서:
  ```bash
  pnpm --filter @agent-desk/gateway dev &
  pnpm --filter @agent-desk/web dev
  ```
  Expected: `http://localhost:3333` 에서 웹, gateway는 3334.

- [ ] **Step 2: 브라우저로 `http://localhost:3333` 접속하고 확인**

  체크 리스트:
  - [ ] 배경이 `#ffffff` (순백). zinc-50 회색 아님.
  - [ ] 헤더 좌측에 `AGENT-DESK ⁄ DESK` (대문자, letter-spacing 넓음, weight 600).
  - [ ] 헤더 우측에 `TERMINAL · WIKI · GRAPH · HARNESS · SETTINGS` 가 한 줄로, 항목 사이 28px, 비활성은 흐릿(opacity 0.65).
  - [ ] 헤더 아래 hairline 보더 (`rgba(26,18,8,0.12)`).
  - [ ] 보더 아래에 meta 줄: 좌측 `workspace · {name} ⌄`, 우측 `!0  V0.2`. 둘 다 10px uppercase, 톤 다운.
  - [ ] meta 줄과 본문 사이 충분한 여백 (≈ 96px).
  - [ ] 본문은 컨테이너 1180px 내부에 있고 좌우 여백이 균등.
  - [ ] 탭을 클릭하면 활성 탭이 진해지고 컨텐츠가 바뀜.
  - [ ] 워크스페이스 드롭다운(`workspace ·` 클릭)이 열리고 닫힘.
  - [ ] 터미널 탭에서 xterm이 정상 렌더, 폭이 약 130 cols 근처.

- [ ] **Step 3: OS 다크 모드를 켠 상태에서 동일 검증**

  macOS: System Settings → Appearance → Dark.
  또는 DevTools → Rendering → Emulate CSS prefers-color-scheme: dark.

  Expected: 페이지는 여전히 라이트 톤(#ffffff 배경, #1a1208 텍스트). 자동 다크로 안 넘어감.

- [ ] **Step 4: 모바일 폭 확인**

  DevTools → 디바이스 ≤ 767px (iPhone SE 등).

  Expected: padding이 줄어들고, 헤더가 좁아져도 nav가 가로 스크롤 없이 표시되거나(폭이 충분) 자연스럽게 줄바꿈. 깨진 레이아웃 없음.

- [ ] **Step 5: dev 서버 종료**

  ```bash
  # foreground는 Ctrl+C
  kill %1   # background gateway
  ```

- [ ] **Step 6: 시각 검증 결과를 PR/세션에 보고**

  체크리스트 결과를 텍스트로 남긴다. 문제가 있다면 다음 작업(Task 9+)으로 미세 조정.

  Note: 이 Task는 코드 변경이 없으므로 commit 없음. 시각 문제가 발견되면 해당 Task로 돌아가서 fix → 새 commit.

---

## Self-Review Notes

스펙 커버리지 확인:

| 스펙 결정사항 | 구현 Task |
|---|---|
| 1180px 중앙 정렬 컨테이너, 헤더+본문 동일 폭 | Task 7 |
| hill-test 헤더 톤 (11px uppercase, letter-spacing, border-b) | Task 6 |
| 좌측 정적 텍스트 로고, HalftoneLogo 헤더에서 제거 | Task 6 (텍스트) + Task 7 (import 제거) |
| 우측 nav가 실제 탭 전환 역할 | Task 3 + Task 6 |
| 별도 두 번째 탭바 줄 제거 | Task 7 |
| Meta 줄 (WorkspaceSwitcher · !0 · v0.2, 10px uppercase) | Task 6 |
| 본문 폭이 ~135 cols (1180−96 ≈ 1084px) | Task 7 (컨테이너 폭) + Task 8 (시각 확인) |
| body 배경 #ffffff, 텍스트 #1a1208, system font 스택 | Task 1 |
| 다크 모드 비활성화 | Task 1 (variant 재정의) + Task 2 (layout body 정리) |
| 모바일 padding 축소 | Task 7 (max-md:) |
| WorkspaceSwitcher 이름 노출, `<h1 sr-only>` 유지 | Task 4 + Task 6 |
| 기존 테스트 (tab-bar, workspace-switcher) 통과 | Task 3 · 4의 검증 step |
| `components/halftone/*`, 각 탭 컴포넌트 손대지 않음 | 영향 없음 |

타입/시그니처 일관성:
- `TabKey` import 경로는 모든 파일에서 `./tabs/types` (app-shell, app-header, tab-bar).
- `WorkspaceDto` import는 모두 `@agent-desk/shared`.
- `AppHeader` props는 Task 5 (test) 와 Task 6 (impl) 에서 동일 (workspaces, activeId, onSelectWorkspace, tab, onTabChange, version).

플레이스홀더 없음, "TODO/TBD" 없음. 모든 코드 step에 실제 코드 포함.
