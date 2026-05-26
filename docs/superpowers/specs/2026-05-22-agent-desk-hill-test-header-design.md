# agent-desk — hill-test 헤더/컨테이너 적용

날짜: 2026-05-22
상태: 설계 승인

## 목적

`hill-test.html`의 매거진 스타일 헤더와 1180px 중앙 정렬 컨테이너를
agent-desk 웹 앱(`agent-desk/apps/web`)에 적용한다. 풀스크린 도구 UI가
주던 인상을 톤다운하고, 동일한 톤·타이포·여백 시스템 위에서
agent-desk 기능을 그대로 구동한다.

이번 작업은 시각 톤 정리에 한정한다. 데이터 흐름, 라우팅, 게이트웨이
프로토콜은 손대지 않는다.

## 결정사항

1. **컨테이너**: `max-width: 1180px; margin: 0 auto; padding: 36px 48px 80px`
   를 전체 셸에 적용. 헤더와 본문 모두 같은 폭으로 정렬.
2. **헤더 스타일**: hill-test와 동일 — 11px uppercase, letter-spacing 0.22em,
   border-bottom `rgba(26,18,8,0.12)`, `padding-bottom: 28px; margin-bottom: 96px`.
3. **좌측 로고**: `HalftoneLogo` 컴포넌트는 헤더에서 제거. 정적 텍스트
   `AGENT-DESK ⁄ DESK` (font-weight 600). HalftoneLogo 컴포넌트 파일은
   다른 곳에서 사용될 수 있으니 삭제하지 않고 헤더 사용처만 교체.
4. **우측 nav (실제 탭 전환)**: 기존 `TabBar` 컴포넌트의 역할을 헤더 우측의
   hill-test 스타일 nav로 흡수. 항목은 기존 탭 순서대로 — terminal · wiki ·
   graph · harness · settings. 비활성 탭 `opacity: 0.65`, 활성 탭 `opacity: 1`
   (혹은 살짝 굵기 600). 별도의 두 번째 탭바 줄은 제거.
5. **Meta 줄**: 헤더 `margin-bottom: 96px` 갭 사이에 `font-size: 10px;
   letter-spacing: 0.24em; text-transform: uppercase; opacity: 0.45` 의
   meta 줄 한 개. 좌측에 `WorkspaceSwitcher`(워크스페이스 이름 노출),
   우측에 `!0` 인디케이터 + `v0.2`. hill-test의 `.hero .meta` 톤과 동일.
6. **본문**: 1180px 컨테이너 내부에서 탭 컨텐츠가 그대로 렌더. 터미널
   사용 폭은 `1180 − 96 ≈ 1084px ≈ 약 135 cols` (D2Coding 13px 기준) —
   Claude Code급 AI CLI 작업에 충분.
7. **컬러/폰트 토큰**:
   - body 배경: `#ffffff`
   - 본문 텍스트: `#1a1208`
   - 본문 폰트: `-apple-system, BlinkMacSystemFont, "Segoe UI", Inter,
     sans-serif`, weight 400, antialiased
   - 코드/모노스페이스 폰트 (필요한 컴포넌트만): `ui-monospace, "SF Mono",
     Menlo, monospace` 또는 기존 `D2Coding Ligature` 유지
   - 다크 모드는 비활성화: `globals.css` 의 `@media (prefers-color-scheme: dark)`
     블록 제거, `layout.tsx`의 `dark:` Tailwind 클래스 제거
8. **모바일**: hill-test의 `@media (max-width: 760px)` 그대로 적용 —
   `padding: 24px 24px 60px`, header `margin-bottom: 56px`. nav가 좁아지면
   가로 스크롤 허용.

## 적용 범위

수정:
- [agent-desk/apps/web/app/layout.tsx](agent-desk/apps/web/app/layout.tsx)
  — `body` className에서 `bg-zinc-50 dark:bg-zinc-950` 등 다크 토큰 제거,
  배경/텍스트는 `globals.css`가 책임.
- [agent-desk/apps/web/app/globals.css](agent-desk/apps/web/app/globals.css)
  — `:root` 변수를 `#ffffff` / `#1a1208`로 고정, dark prefers-color-scheme
  블록 제거, 본문 폰트 패밀리 갱신.
- [agent-desk/apps/web/components/app-shell.tsx](agent-desk/apps/web/components/app-shell.tsx)
  — 최상위 `grid h-screen` → 1180px 컨테이너로 교체, `<header>` 재구성,
  Meta 줄 신설, 별도 `<TabBar>` 줄 제거, `<main>`은 컨테이너 내부.
- [agent-desk/apps/web/components/tabs/tab-bar.tsx](agent-desk/apps/web/components/tabs/tab-bar.tsx)
  — hill-test nav 스타일로 재작성 (`role="tablist"` 유지, `aria-current`
  유지, 시각적으로는 인라인 링크 목록).

손대지 않음:
- `components/halftone/*` (HalftoneLogo 등 — 헤더 외 사용처 가능성)
- 각 탭 내부 컴포넌트
- gateway, shared 패키지

## 접근성

- `<header>` 의 `<h1 className="sr-only">agent-desk</h1>` 유지.
- nav는 `role="tablist"` + `aria-current="page"` 유지. 시각만 hill-test
  스타일로 변경.
- 데코 nav가 실제 탭 전환을 수행하므로 키보드 포커스/Enter 동작 보존.

## 테스트

- 기존 vitest 컴포넌트 테스트 (`tab-bar.test.tsx`, `workspace-switcher.test.tsx`)
  통과해야 함. DOM 구조 변경에 맞춰 selector만 조정.
- 시각 검증은 dev 서버 띄워서 브라우저로 확인 (모바일 폭 포함).

## 작업 후 산출물

- 적용된 헤더가 hill-test와 같은 톤·간격·타이포로 보임
- 워크스페이스 전환, 탭 전환, 터미널 작동 모두 회귀 없음
- 다크 모드 토큰이 완전히 사라짐
