# agent-desk 화면 구성 재편 설계 문서 (v0.2 IA)

- 상태: 초안 (사용자 리뷰 대기 중)
- 작성자: 브레인스토밍 세션
- 날짜: 2026-05-20
- 선행: [2026-05-19-agent-desk-design.md](2026-05-19-agent-desk-design.md) (v0.1 전체 설계)

## 1. 목적

v0.1에서 단일 화면(`사이드바 | 터미널 | 위키 패널`)으로 출시한 agent-desk를 **상단 탭 + 풀스크린 뷰** 구조로 재편한다. 추가로 다룰 영역이 다섯이기 때문이다:

1. 채팅(터미널 안의 CLI 세션) — 이미 구현.
2. Wiki 탐색·편집 — 이미 구현. 그래프 시각화와 ADR 관리가 추가로 묶일 자리.
3. ADR(아키텍처 결정 기록) 관리 — 위키 안 `decisions/`에 저장되지만 라이프사이클이 다르다.
4. 하네스(`CLAUDE.md`/`AGENTS.md`/`GEMINI.md`) 통합 관리, 훅, 서브 에이전트, 어댑터.
5. 설정 — 일반 + DB 연결(로컬 SQLite → 원격 Postgres 마이그레이션 흐름).

이번 변경은 **IA(정보 구조)와 와이어프레임만 확정**한다. 구현된 영역은 새 자리로 이전해 동작을 유지하고, 미구현 영역은 정적 와이어프레임만 둔다. 데이터 모델·게이트웨이·API 변경 없음.

## 2. 범위 외 (v0.2)

- 그래프 렌더링 엔진(cytoscape / d3-force 등) 도입 — v0.3+.
- 메모리 파일 실제 diff/병합 알고리즘, 훅·에이전트 에디터 — v0.3+.
- Postgres 드라이버, drizzle 어댑터 교체, 실제 DB 마이그레이션 실행 — v0.3+.
- 탭 라우팅을 Next.js 경로(`/terminal`, `/wiki`, …)로 분리 — 현재는 클라이언트 상태로 충분.
- xterm keep-alive(탭 전환 시 PTY attach 유지). 탭 이동 시 dispose 후 재attach; tmux 스크롤백은 보존.
- 다중 사용자 인증, 권한 모델 — v0.1 가정 유지.
- ADR/문서 프론트매터 기반 상태/날짜 컬럼 채우기 — 데이터 구조 합의 후 v0.3+.

## 3. 정보 구조 (IA)

### 3.1 최상위: 상단 탭 + 풀스크린 뷰

선택지로 검토된 세 가지:

| 후보 | 장점 | 단점 |
|---|---|---|
| 좌측 글로벌 네비(VSCode 액티비티바 풍) | 모드 전환 명확, 컨텍스트 사이드바 가능 | 새 영역마다 컨텍스트 사이드바 디자인 비용 큼 |
| **상단 탭 + 풀스크린 (채택)** | 모드 전환이 가장 단순, 각 뷰가 가장 넓은 작업 영역 확보 | 두 모드를 동시에 보기 어려움 |
| 현재 3컬럼 + 우측 멀티탭 | 터미널과 보조 정보 동시 표시 | 그래프/하네스 같은 큰 뷰가 좁은 우측에 갇힘 |

선택: **상단 탭**. 채팅(터미널)과 위키/그래프/하네스를 동시에 봐야 할 강한 필요가 없고, 그래프·하네스·DB 마이그레이션은 본문 폭이 절실하다.

탭 순서: `Terminal | Wiki | Graph | Harness | Settings`.

### 3.2 글로벌 헤더

```
┌─────────────────────────────────────────────────────────────────────┐
│ agent-desk · workspace ▾    [!N unresolved]   v0.2                  │
└─────────────────────────────────────────────────────────────────────┘
```

- 타이틀 + 워크스페이스 스위처(기존 컴포넌트 재사용).
- **알림 배지 자리**: 다른 탭에서 일할 때도 Harness 불일치/Review Queue 액션 아이템을 노출하는 슬롯. v0.2에서는 자리만(`!0`) 잡고, 실제 카운트 연결은 v0.3+.
- 우측 끝: 버전 표시(`v0.2`).

### 3.3 탭별 셸 규약

각 탭은 자기 영역만 책임지고 `min-h-0`/`overflow` 처리를 자체적으로 한다. 탭 전환 시 비활성 탭은 **언마운트**한다(상태 누수/네트워크 누수 방지). 다만 `AppShell`이 들고 있는 워크스페이스 목록과 활성 워크스페이스 id는 모든 탭이 공유한다.

## 4. 탭 명세

### 4.1 Terminal 탭

```
┌──────────────┬──────────────────────────────────────────┐
│ Workspaces ▾ │                                          │
│ + new        │                                          │
│ ─ Sessions ─ │           xterm.js terminal              │
│ • ad-foo-x1  │           (claude / gemini / codex)      │
│ • ad-foo-x2  │                                          │
│ [+ new]      │                                          │
└──────────────┴──────────────────────────────────────────┘
```

- **좌측(폭 18rem)**: WorkspaceForm + NewSessionDialog + SessionList.
- **우측**: TerminalPanel(`bg-black`).
- 채팅 = CLI 자체. v0.1 스펙대로 별도 채팅 UI는 만들지 않는다(stream-json 경로 차단).
- 세션 폴링은 이 탭이 마운트된 동안만 동작(`setInterval(refreshSessions, 3000)`).
- 탭 이동 시 TerminalPanel이 dispose되어 PTY는 detach된다(tmux 세션은 살아 있음). 복귀 시 즉시 재attach.

**책임:** 워크스페이스/세션 CRUD + 터미널 입출력. 다른 탭이 사용하는 워크스페이스 목록은 `AppShell`이 관리한다.

### 4.2 Wiki 탭

```
┌─[문서 ◀][ADR 보드][Review Queue][Log]──────────🔍 search──┐
├──────────────┬─────────────────────────┬─────────────────┤
│ 6-Layer Tree │ concepts/foo.md         │ META            │
│ ▾ sources/   │ ---                     │ layer: concept  │
│ ▾ concepts/  │ layer: concept          │ claims:         │
│   • foo ◀    │ ---                     │  source     5   │
│ ▸ entities/  │ # Title                 │  analysis   3   │
│ ▸ decisions/ │ ...                     │  unverified 1   │
│ ▸ synthesis/ │ [edit] [history]        │  gap        0   │
│ ▸ infra/     │                         │ backlinks: —    │
│              │                         │ broken: ⚠ 1     │
└──────────────┴─────────────────────────┴─────────────────┘
```

#### 4.2.1 서브뷰 4종

- **문서**: 6-Layer 트리(좌) + 본문 뷰어/에디터(중) + 메타 패널(우). 기본값.
- **ADR 보드**: `wiki/decisions/**/*.md`만 표로 렌더(ID/제목/상태/날짜). 클릭 시 `문서` 서브뷰로 점프하며 해당 파일을 연다.
- **Review Queue**: `wiki/infra/review-queue.md`(없으면 `wiki/review-queue.md`)를 마크다운으로 렌더. 핵심 변경은 사람 합의 게이트라는 점을 반영하는 자리.
- **Log**: 기존 `log.md` 어펜드 컴포저(`wiki-log-composer`).

#### 4.2.2 ADR 위치 결정

ADR을 위키 안 서브뷰로 둔다(별도 최상위 탭 X). 근거:

- 사용자가 정한 위키 구조에서 ADR은 `decisions/` 디렉터리에 저장된다. **파일이 위키의 일부**다. 별도 탭으로 분리하면 같은 파일을 두 곳에서 다루게 되어 혼란이 생긴다.
- ADR의 라이프사이클(상태/번호/합의)은 일반 위키 문서와 다르지만, 그 차이는 **렌더링/뷰 차원**에서 해결할 수 있다. ADR 보드 서브뷰가 그 역할을 한다.
- 위키-ADR 간 백링크는 본질적으로 같은 링크 그래프다. 두 영역을 분리하면 그래프 통합이 비싸진다.

#### 4.2.3 메타 패널(우)

문서 서브뷰의 우측 패널. 표시 항목:

- 파일 경로, layer(프론트매터에서 추출).
- claim type 카운트(`source` / `analysis` / `unverified` / `gap`) — 본문의 키워드 빈도. v0.2에서는 정규식 기반 best-effort, 실데이터 연동은 v0.3+.
- backlinks 수(v0.2: `—`, v0.3+ 연동).
- broken link 수와 목록(현재 알고리즘 그대로: `index.md` 외 다른 문서까지 확장).

**비포함:** index.md 자동 재생성, ADR 템플릿/마법사, 6-Layer 강제 검증.

#### 4.2.4 본문 영역의 동작 보존

- 마크다운 뷰어, 프론트매터 메타데이터 스트립, SCHEMA 경고 표시, broken link 배지 — 기존 그대로.
- 편집은 CodeMirror 6 디테일 패널(접이식). 저장 시 SCHEMA 경고 갱신.

### 4.3 Graph 탭 (정적 와이어프레임)

```
┌─🔍 search──────────────────layout: force ▾  reset──┐
├──────────┬───────────────────────────┬─────────────┤
│ Filters  │     ●─────●                │ selected:   │
│ Layer ☑  │       \  /                 │ (none)      │
│ Claim ☑  │        ●                   │ in/out: —   │
│ broken ☐ │       / \                  │ broken: —   │
│   only   │      ●   ● (ADR ⚠)         │ [open in    │
│          │                            │  Wiki tab]  │
└──────────┴───────────────────────────┴─────────────┘
```

- 좌측 필터(레이어/클레임 타입/broken only), 중앙 그래프 캔버스, 우측 선택 노드 상세.
- v0.2에서는 모두 disabled. 더미 SVG(원·선)로 "어떤 인터랙션이 들어올지" 시각화.
- "Coming in v0.3" 안내. `data-stub="true"` 마커.

### 4.4 Harness 탭

```
┌─[Memory ◀][Hooks][Sub-agents][Adapters]────────────┐
├──────────────┬─────────────────────────────────────┤
│ Files        │ CLAUDE.md  ↔  AGENTS.md             │
│ • CLAUDE.md  │ ⚠ 5 불일치 항목                       │
│ • AGENTS.md  │  - L23, L41, L78, L102, L150         │
│ • GEMINI.md  │ [수동 편집] [수정 세션 열기 → Terminal]│
│              │                                     │
│ Source of    │ diff view (v0.3)                    │
│ truth ◉ CLAUDE│                                    │
└──────────────┴─────────────────────────────────────┘
```

서브뷰 4종 (v0.2는 정적 와이어프레임):

#### 4.4.1 Memory

- 좌측: `CLAUDE.md` / `AGENTS.md` / `GEMINI.md` 파일 리스트, "소스 진실" 라디오(disabled).
- 우측: 불일치 항목 더미 리스트 + 두 액션 버튼(disabled):
  - `수동 편집` — 인라인 편집기.
  - `수정 세션 열기 → Terminal` — 새 CLI 세션을 띄워 LLM에게 동기화를 위임. 사용자의 핵심 요구사항 중 하나.
- diff view 자리는 점선 박스 + "v0.3" 라벨.

#### 4.4.2 Hooks

- 표 골격: `Event | Matcher | Command | Source(global/project)`.
- 본문은 "no hooks loaded — coming in v0.3" 안내.

#### 4.4.3 Sub-agents

- "no agents defined — coming in v0.3" 안내.
- v0.3에서 카드 그리드로 에이전트 정의 표시 예정.

#### 4.4.4 Adapters

- `claude` / `gemini` / `codex` 3개 카드. 각 카드에 export target 경로(읽기 전용) + `Export` 버튼(disabled).
- 의도: 메모리/훅/서브 에이전트의 단일 정의를 세 CLI의 포맷별로 출력.

### 4.5 Settings 탭

```
┌─[General][Database ◀][CLI Catalog][Auth][About]────┐
├──────────────┬─────────────────────────────────────┤
│ Mode         │ Current: SQLite (local)             │
│ ◉ Local SQL  │ path: agent-desk/data/...sqlite     │
│ ○ Remote PG  │                                     │
│              │ Remote connection (Postgres)        │
│ Migration    │  host / port / database / user      │
│ [Local→Remote│  password: .env 참조                 │
│   Wizard]    │ [Test connection] [Save]            │
└──────────────┴─────────────────────────────────────┘
```

#### 4.5.1 서브뷰 5종

- **General**: 테마 라디오(`auto/light/dark`, disabled), 짧은 안내.
- **Database**: 아래 4.5.2 상세.
- **CLI Catalog**: `claude/gemini/codex` 3행 표 — `name | command | default args`. v0.1 config의 정적 미러.
- **Auth**: "Token is read from `AGENT_DESK_TOKEN` env var only." 안내. 평문 저장 안 함.
- **About**: 버전/링크.

#### 4.5.2 Database 서브뷰 (가장 충실)

마이그레이션 방향은 **SQLite → Postgres 단방향**. 양방향 마이그레이션은 비포함.

- **Mode** 라디오: `Local SQLite` / `Remote Postgres` (v0.2: 둘 다 disabled).
- **Current** 상태: 현재 모드와 path 표시.
- **Remote connection 폼**: host / port(기본 5432) / database / user 4개 input(disabled).
- **password**: input 자체를 두지 않는다. `password: .env (AGENT_DESK_DB_PASSWORD)` 텍스트만. 이유: UI에서 평문/세션 저장을 막기 위한 의도적 선택.
- **Actions**: `[Test connection]` `[Save]` (v0.2 disabled).
- **Migration**: `[Local → Remote Wizard]` 버튼 + 3단계 표시(`snapshot → restore on PG → switch mode`).

사용자가 명시한 시나리오 — "혼자 로컬에서 작업하다가 팀원이 추가되면 기존 DB를 원격으로 옮기고 그쪽에 붙는다" — 를 위한 자리.

## 5. 데이터/네트워크 변경

**없음.** 모든 변경은 `apps/web` 클라이언트 컴포넌트에 한정된다.

- 신규 API 라우트 신설 금지.
- 게이트웨이 엔드포인트 추가 금지.
- `@agent-desk/shared` DTO 변경 금지.
- 새 fetch 호출은 기존 `/api/proxy/...` 경로만 사용.

미구현 와이어프레임이 호출하는 실제 데이터 fetch는 없다(모두 정적 더미 또는 props 입력).

## 6. 컴포넌트 분할 원칙

새로 만드는 컴포넌트들은 다음 폴더 규약을 따른다:

```
apps/web/components/
├── app-shell.tsx                # 헤더 + TabBar + ActiveTab
├── tabs/
│   ├── types.ts                 # TabKey 정의
│   ├── tab-bar.tsx              # 상단 탭 UI
│   ├── terminal-tab.tsx
│   ├── wiki-tab.tsx
│   ├── graph-tab.tsx
│   ├── harness-tab.tsx
│   ├── settings-tab.tsx
│   ├── wiki/                    # Wiki 탭 내부 부속
│   │   ├── subview-switch.tsx
│   │   ├── meta-panel.tsx
│   │   ├── adr-board.tsx
│   │   └── review-queue.tsx
│   ├── harness/                 # Harness 탭 내부 부속
│   │   └── (subview-switch, memory, hooks, agents, adapters)
│   └── settings/                # Settings 탭 내부 부속
│       └── (subview-switch, general, database, cli-catalog, auth, about)
```

원칙:

- 기존 컴포넌트(`terminal-panel.tsx`, `wiki-tree.tsx`, `session-list.tsx`, …)는 **로직 변경 금지**, 새 탭이 import해 자리만 옮긴다.
- 미구현 와이어프레임은 disabled 입력 + `data-stub="true"` 마커. 추후 실데이터 연결 시 grep으로 위치 파악.
- 신규 컴포넌트는 최소 하나의 vitest smoke test로 마운트 검증.

## 7. 핵심 결정 근거 요약

| 결정 | 근거 |
|---|---|
| 상단 탭 + 풀스크린 | 그래프·하네스·DB 마이그레이션이 본문 폭을 요구. 두 모드 동시 표시 필요 낮음. |
| ADR = Wiki 서브뷰 | 파일이 `wiki/decisions/`에 있음. 두 탭으로 분리하면 같은 파일이 이중 노출. |
| Graph 별도 탭(서브뷰 X) | 위키 + ADR + 향후 다른 그래프(예: 훅 의존성)까지 수용할 큰 그릇이 필요. |
| Harness 단일 탭 + 4 서브뷰 | Memory/Hooks/Agents/Adapters는 강하게 연관. 새 훅 추가 시 어댑터 export를 즉시 확인 가능. |
| Settings 단일 탭 + 5 서브뷰 | 마이그레이션 마법사가 Settings 내에서 끝나는 게 사용자 의도. 별도 Connection 탭은 과잉. |
| DB password input 없음 | `.env`만 진실 원천. UI 입력란을 만들면 평문 보관 유혹이 생긴다. |
| 미구현 = 정적 view + disabled | 사용자 명시 요구. plan/spec/data 합의 없이 동작을 흉내 내지 않음. |

## 8. 비포함 (재정리)

- 실데이터: 그래프, 하네스, 훅, 어댑터 export, DB 마이그레이션 실행.
- 인증/멀티 사용자.
- 탭 URL 라우팅.
- xterm keep-alive.
- 채팅 UI(stream-json 기반 구조화 렌더).
- ADR 템플릿/마법사, index.md 자동 재생성.

## 9. 후속 단계

- 이 spec 사용자 승인 후 → `2026-05-20-agent-desk-screen-layout.md` plan 시작점이 됨(plan은 이미 초안 작성됨).
- 구현은 `superpowers:subagent-driven-development`로 13개 태스크 task-by-task 실행.
- v0.3 후속 spec 예정 항목: 그래프 렌더링, 하네스 실데이터 연동, DB 마이그레이션 실행.
