# agent-desk v0.1 설계 문서

- 상태: 초안 (사용자 리뷰 대기 중)
- 작성자: 브레인스토밍 세션
- 날짜: 2026-05-19

## 1. 목적

tmux 안에서 실행되는 CLI 기반 AI 코딩 세션(`claude`, `gemini`, `codex` 등)을 시작·연결·관리하고, owngo 위키를 탐색·편집할 수 있는 단일 페이지 웹 제품을 제공한다. 모든 작업을 브라우저에서 수행하며, 기존 하네스(PostToolUse 훅, 메모리 파일, 스킬, 위키 컨벤션)를 손상시키지 않고 현재의 VSCode 기반 워크플로우를 대체한다.

## 2. 범위 외 항목 (v0.1)

- 구조화된 채팅 렌더링 (Claude는 더 이상 stream-json 대응 기능을 지원하지 않음. 이 경로는 닫혔다).
- 다중 환경 세션 통합 (호스트 + devcontainer 동시 운영). 사용자는 단일 환경에서 실행한다.
- 커스텀 xterm.js 테마. v0.1은 라이브러리 기본값으로 출시한다.
- 메모리 파일 편집기, 훅 설정 UI, 빌링/사용량 대시보드, 전문 검색, 다중 사용자 인증.
- CLI의 내부 동작을 대체하거나 수정하는 것. 우리는 얇은 터미널/세션 래퍼다.

## 3. 운영 환경

agent-desk는 환경에 종속되지 않는다. 어떤 배포 형태에서도 동일한 코드가 동일한 동작으로 실행된다:

- **DevContainer 모드**: agent-desk가 owngo devcontainer 내부에 존재한다. 해당 컨테이너 내부의 tmux 세션을 관리한다.
- **Localhost 모드**: 사용자가 호스트 머신에서 직접 `pnpm dev`를 실행한다. 호스트의 tmux 세션을 관리한다.

두 경우 모두 전제는 다음과 같다: agent-desk와 그것이 관리하는 tmux 세션은 동일한 OS 유저스페이스를 공유한다. 환경 간 브리징은 존재하지 않는다.

## 4. 아키텍처

```
[브라우저]
   │ WebSocket (xterm.js I/O) + REST (CRUD)
   ▼
[agent-desk Next.js 앱 — 포트 3333]   (UI + 얇은 REST 프록시)
   │
   ▼  (localhost IPC; HTTP + WS)
[agent-desk-gateway — Node, 포트 3334]
   │
   ├─► node-pty → tmux (로컬 소켓)
   │     └─► tmux 세션 → claude / gemini / codex / ...
   │
   └─► SQLite (better-sqlite3 + drizzle-orm)
         workspaces, sessions, session_events
```

### 4.1 프로세스 구성

- **Next.js** (포트 3333) — UI 및 정적 자산. 모든 상태 변경 작업과 실시간 세션 I/O는 Gateway를 거친다. Next.js가 읽기 전용 뷰를 위해 SQLite를 직접 읽을지, 항상 Gateway를 통해 프록시할지는 플랜 단계에서 결정한다 (§12 참고).
- **Gateway** (포트 3334) — 상주 Node 프로세스(서버가 떠 있는 동안 계속 실행되며 PTY·WebSocket·tmux 상태를 메모리에 보유). 모든 PTY/tmux 상호작용과 WebSocket 서버를 소유한다. Next.js와 분리한 이유: (a) `node-pty`의 네이티브 바인딩이 Next.js HMR/Turbopack 워커와 충돌함, (b) WS 연결은 개발 서버 재시작에도 살아남아야 함.
- 두 프로세스는 개발 중 병렬로 시작된다 (`pnpm dev` 스크립트가 `next dev`와 gateway를 동시에 실행).

### 4.2 Gateway를 분리하는 이유

- 네이티브 바인딩 빌드 실패를 Next.js 빌드로부터 격리.
- 라이브 터미널 세션을 잃지 않고 UI 재시작 가능.
- 권한 경계가 깔끔함: 베어러 토큰을 보유하고 PTY 소켓을 바인딩하는 것은 gateway뿐.

### 4.3 패키지 구조 (내부 모노레포)

`agent-desk/` 디렉터리 자체를 pnpm 모노레포로 구성한다. 단일 패키지 안에서 폴더로만 분리하지 않는 이유는 §4.2의 분리 의도(빌드 격리, 네이티브 바인딩 경계, 의존성 그래프 분리)가 런타임이 아니라 **빌드와 타입 경계**에서 자연스럽게 강제되어야 하기 때문이다.

```
agent-desk/
├── pnpm-workspace.yaml          # packages: ['apps/*', 'packages/*']
├── package.json                  # 루트: 오케스트레이션 스크립트만 (예: "dev": "pnpm -r --parallel dev")
├── apps/
│   ├── web/                      # Next.js 16 (포트 3333)
│   │   ├── package.json          # next, react, codemirror, xterm 등
│   │   └── ...
│   └── gateway/                  # 상주 Node 데몬 (포트 3334)
│       ├── package.json          # node-pty, better-sqlite3, drizzle-orm, ws
│       └── src/main.ts
├── packages/
│   └── shared/                   # 공유 타입·DB 스키마·공용 유틸
│       ├── package.json          # name: "@agent-desk/shared"
│       └── src/...
├── data/                         # SQLite 파일 (gitignore됨, §6.1 참고)
└── docs/
```

핵심 규칙:

- `apps/web`의 `dependencies`에는 `node-pty`·`better-sqlite3`를 **두지 않는다**. 누군가 클라이언트/RSC에서 네이티브 모듈을 import하면 즉시 빌드 에러가 발생하도록 의존성으로 가드레일을 박는다.
- 공유 코드(API 페이로드 타입, drizzle 스키마, CLI 카탈로그 타입 등)는 `packages/shared`에 두고 `@agent-desk/shared`로 import한다. 양쪽 앱은 `package.json`에 `"@agent-desk/shared": "workspace:*"`로 의존.
- `apps/web/next.config.ts`에 `transpilePackages: ['@agent-desk/shared']`를 설정해 워크스페이스 패키지가 Next 변환에 포함되도록 한다.
- 개발 실행은 루트의 `pnpm dev`가 `pnpm -r --parallel dev`로 두 앱을 동시에 띄운다. 빌드도 `pnpm -r build`로 각 앱이 독립 산출물을 갖는다.

VSCode/툴체인 셋업(설계 결정의 일부로 명시):

- 각 패키지 `tsconfig.json`에 `"composite": true`, 루트 `agent-desk/tsconfig.json`에서 `references`로 묶어 "Go to definition"이 소스 파일로 점프하도록 한다.
- `agent-desk/.vscode/settings.json`에 `"typescript.tsdk": "node_modules/typescript/lib"`, `"eslint.workingDirectories": [{ "mode": "auto" }]`를 추가.
- 멀티루트 `.code-workspace` 파일은 v0.1에서 채택하지 않는다 (단일 루트로 충분).

## 5. 컴포넌트

### 5.1 Gateway

책임:

- Tmux 작업: `list-sessions`, `new-session`, `attach`, `kill-session`. 모두 node-pty 셸 아웃(attach용) 또는 `child_process.exec`(list/kill용)를 통해 수행.
- PTY 라이프사이클: 브라우저 연결마다 `tmux attach -t <name>`을 spawn하고, WS와 PTY 사이에서 stdin/stdout/resize를 파이프.
- 세션 디스커버리: `tmux list-sessions -F '<format>'`를 5초마다 폴링; 구독 중인 클라이언트에 델타를 SSE/WS 이벤트로 송출.
- 어돕션(Adoption): SQLite에는 없지만 tmux에 존재하는 세션을 발견하면 `adopted=1`로 삽입하고, 베스트-에포트 메타데이터(`pane_current_command`로 CLI 추정)를 기록.
- 영속화: 모든 상태 변경 시 SQLite에 write-through; `last_activity_at` 업데이트는 1초 배치로 스로틀링.
- 인증: 모든 HTTP 요청 및 WS 핸드셰이크에서 `Authorization: Bearer <token>`을 검증. 토큰은 `AGENT_DESK_TOKEN` 환경 변수에서 읽음.
- 바인딩: 기본값으로 `127.0.0.1:3334`에 리스닝. 외부 바인딩은 명시적 설정을 요구하며 v0.1 마무리 범위 밖.

### 5.2 웹 UI

레이아웃 (싱글 페이지, 3 영역):

```
┌────────────────────────────────────────────────────────┐
│ 헤더: 워크스페이스 스위처 · 세션 카운트 · 설정         │
├────────────┬───────────────────────────────┬───────────┤
│            │                               │           │
│ 사이드바   │   메인: xterm.js 터미널       │  위키     │
│            │   (기본 스타일, 테마 없음)     │  패널     │
│ - 워크스페  │                               │  (토글)   │
│   이스     │                               │           │
│ - 세션     │                               │           │
└────────────┴───────────────────────────────┴───────────┘
```

v0.1 UI 프리미티브:

- 워크스페이스 리스트 (CRUD: 이름 + 파일시스템 경로).
- 워크스페이스로 묶인 세션 리스트. 각 행: tmux 이름, CLI 추정값, 연결된 클라이언트 수, `last_activity_at`.
- "New Session" 다이얼로그: 워크스페이스 선택 → CLI 카탈로그에서 선택 → 선택적 인자.
- 터미널 패널: xterm.js. 애드온은 `fit`, `web-links`, `unicode11`만 사용. 커스텀 테마 없음.
- 위키 패널(접이식): 활성 워크스페이스의 `wiki/` 디렉터리 파일 트리; 마크다운 뷰어; CodeMirror 6 편집기; SCHEMA 프론트매터 검사; index.md 깨진 링크 배지; log.md 어펜드 헬퍼.
- 연결 상태 인디케이터. WS 자동 재연결 시 `tmux refresh-client`로 재렌더링.

xterm.js 셋업 세부:

- 폰트: 시스템 모노스페이스 폴백 체인 (라이브러리 기본값; v0.1에서 커스텀 폰트 없음).
- Unicode 11 애드온 활성화 (CJK 폭 정확성).
- 커스텀 키 이벤트 핸들러로 브라우저 탈취 단축키(Ctrl+W, Ctrl+T, Cmd+W)를 터미널 포커스 시 차단.
- 리사이즈: fit-addon을 컨테이너 ResizeObserver에 연결; 변경 시 `{type:'resize', cols, rows}`을 WS로 전송.

### 5.3 위키 패널

활성 워크스페이스의 `wiki/` 디렉터리가 존재하면 그 범위에서 동작. v0.1 기능:

- 6-Layer 디렉터리 구조와 레이어 라벨을 보여주는 파일 트리.
- 프론트매터를 메타데이터 스트립(claim type, layer)으로 본문 위에 렌더링하는 마크다운 뷰어.
- `.md` 파일을 위한 CodeMirror 6 편집기. 저장 시 gateway 엔드포인트를 통해 디스크에 기록.
- 저장 시: 프론트매터 존재 여부와 레이어-디렉터리 일치 여부 검증. SCHEMA 위반 시 비차단(non-blocking) 경고 표시.
- `index.md`: 타겟이 해소되지 않는 링크에 배지를 표시하며 렌더링.
- `log.md`: 현재 타임스탬프 + 사용자 입력 본문을 어펜드하는 소형 컴포저.

여기서 범위 외: index.md 자동 재생성, ADR 템플릿, 리뷰 큐 보드 (모두 v0.2+).

## 6. 데이터 모델 (SQLite)

### 6.1 저장 위치

데이터베이스 파일은 리포 내 로컬 경로에 떨어진다.

- 경로: `agent-desk/data/agent-desk.sqlite`
- WAL/SHM 사이드카: `agent-desk/data/agent-desk.sqlite-wal`, `agent-desk/data/agent-desk.sqlite-shm`
- VCS 무시: `agent-desk/.gitignore`의 `/data` 와 `*.db*` 패턴으로 이미 커버됨. 워크스페이스 루트 `.gitignore`에도 `/data/`가 등록되어 있어 누구의 머신에서도 커밋되지 않는다.
- Gateway는 부팅 시 `agent-desk/data/` 디렉터리가 없으면 생성하고, WAL 모드를 활성화한다.

호스트/devcontainer 어느 쪽에서 실행하더라도 동일한 상대 경로를 사용한다(§3의 환경 무관성 원칙). 글로벌 경로(`~/.local/share/agent-desk/db.sqlite`)는 다중 워크스페이스가 한 머신에서 도는 시나리오를 위한 옵션이며, v0.1에서는 채택하지 않는다.

### 6.2 테이블 개요

agent-desk가 다루는 도메인은 셋으로 압축된다: **워크스페이스(어디서 일하는가)**, **세션(무엇이 실행 중인가)**, **세션 이벤트(무슨 일이 있었는가)**. 아래 스키마는 이 세 가지를 직접적으로 표현한다.

- `workspaces`: 사용자가 등록한 작업 디렉터리. 새 세션을 만들 때 `cwd`로 사용된다. `path` 유니크 제약으로 동일 경로의 중복 등록을 막는다.
- `sessions`: tmux 세션 1개 = 행 1개. `tmux_name` 유니크. agent-desk가 만든 세션인지(`adopted=0`), 외부에서 만들어진 것을 발견해 흡수한 것인지(`adopted=1`)를 구분한다. `status`는 `'active'`/`'dead'` 두 상태만 가지며, kill되거나 야간 잡이 정리하면 `'dead'`로 전이한다. `last_activity_at`는 PTY 출력이 발생할 때마다 1초 배치로 갱신되어 정렬·정리 기준이 된다.
- `session_events`: 세션의 라이프사이클 감사 로그. `'created' | 'attached' | 'detached' | 'killed' | 'adopted'` 다섯 종류만 기록한다. UI의 세션 히스토리, 디버깅, 추후 사용량 집계에 사용한다. `payload_json`은 자유 형식이며 예를 들어 `attached`에는 클라이언트 개수, `killed`에는 사유 같은 부수 정보를 담는다.

세션 본문(터미널 스크롤백)은 SQLite에 저장하지 않는다. 그건 tmux의 스크롤백 버퍼가 담당하며, agent-desk는 라이브 PTY 스트림만 중계한다.

### 6.3 스키마

```sql
CREATE TABLE workspaces (
  id            INTEGER PRIMARY KEY,
  path          TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  created_at    INTEGER NOT NULL  -- epoch ms
);

CREATE TABLE sessions (
  id                INTEGER PRIMARY KEY,
  tmux_name         TEXT NOT NULL UNIQUE,
  workspace_id      INTEGER REFERENCES workspaces(id),
  cli               TEXT,           -- 추정값 또는 사용자 지정: 'claude' | 'gemini' | 'codex' | 'unknown'
  args              TEXT,           -- 생성 시 사용된 raw args 문자열
  status            TEXT NOT NULL,  -- 'active' | 'dead'
  last_activity_at  INTEGER NOT NULL,
  created_at        INTEGER NOT NULL,
  adopted           INTEGER NOT NULL DEFAULT 0  -- 발견된 경우 1, agent-desk가 생성했으면 0
);

CREATE TABLE session_events (
  id           INTEGER PRIMARY KEY,
  session_id   INTEGER NOT NULL REFERENCES sessions(id),
  kind         TEXT NOT NULL,  -- 'created' | 'attached' | 'detached' | 'killed' | 'adopted'
  payload_json TEXT,
  at           INTEGER NOT NULL
);
```

drizzle-kit으로 마이그레이션. 부팅 시 WAL 모드 활성화.

## 7. 세션 라이프사이클

1. **Discover** — Gateway가 `tmux list-sessions -F '#{session_name}|#{session_created}|#{session_attached}|#{pane_current_command}'`을 5초마다 폴링. SQLite와 diff.
2. **Adopt** — tmux에는 존재하지만 SQLite에 없는 세션은 `adopted=1`로 삽입. CLI는 `pane_current_command`로 추정.
3. **Create** — UI가 `POST /sessions`로 workspace_id, CLI, args 전송. Gateway가 `tmux new-session -d -s <generated-name> -c <workspace.path> '<cli> <args>'`를 실행. SQLite 행 삽입.
4. **Attach** — UI가 `WS /sessions/<id>/attach?cols=&rows=`를 열기. Gateway가 node-pty로 `tmux attach -t <tmux_name>`을 spawn. `attached` 이벤트 기록.
5. **Detach** — WS close. Gateway가 attach 프로세스를 종료(tmux 세션 자체는 죽이지 않음). `detached` 이벤트 기록.
6. **Kill** — `DELETE /sessions/<id>`. Gateway가 `tmux kill-session -t <tmux_name>` 실행. SQLite 행을 `status='dead'`로 표시. `killed` 이벤트 기록.

agent-desk가 생성하는 세션의 명명 규칙: `ad-<workspace-slug>-<short-id>`. 여기서 `workspace-slug`은 워크스페이스 이름을 소문자로 변환하고 영숫자 외 문자를 `-`로 치환한 뒤 16자로 잘라낸 것이며, `short-id`는 6자 base36 랜덤 서픽스. 어돕션된 세션은 원래의 tmux 이름을 그대로 유지한다.

## 8. 설정

`~/.config/agent-desk/config.toml` (개발 환경에서는 `./agent-desk.config.toml`)에 단일 설정 파일. v0.1 키:

```toml
[server]
gateway_port = 3334
ui_port = 3333
bind = "127.0.0.1"

[auth]
# 토큰은 AGENT_DESK_TOKEN 환경 변수에서 읽으며, 이 파일에 저장하지 않는다

[[cli]]
name = "claude"
command = "claude"
default_args = []

[[cli]]
name = "gemini"
command = "gemini"
default_args = []

[[cli]]
name = "codex"
command = "codex"
default_args = []
```

사용자는 `[[cli]]` 항목을 추가할 수 있다 (예: `aider`, `opencode`). UI의 "New Session" 다이얼로그는 카탈로그에 등록된 모든 항목을 리스트로 노출한다.

## 9. 주요 기술 결정

| 결정 사항 | 선택 | 근거 |
|---|---|---|
| Gateway 분리 | Next.js와 분리된 별도 Node 프로세스 | node-pty 네이티브 바인딩 + HMR 충돌; UI 재시작에도 생존 |
| 패키지 구조 | `agent-desk/` 내부 pnpm 모노레포 (`apps/web`, `apps/gateway`, `packages/shared`) | 빌드·타입 경계를 의존성 그래프로 강제; v0.2 확장에도 마찰 적음 |
| 터미널 렌더러 | xterm.js | 브라우저에서 실시간 ANSI/TUI를 렌더링할 수 있는 유일한 선택지 |
| 터미널 스타일링 | 라이브러리 기본값 | 사용자가 테마링을 v0.2로 명시적으로 보류 |
| 세션 오케스트레이터 | tmux | WS 단절 시에도 생존; 외부 세션 어돕션 가능; 다중 attach 무료 제공 |
| DB | SQLite (better-sqlite3) | 이미 설치됨; 단일 노드; WAL로 동시 읽기 커버 |
| ORM | drizzle-orm | 이미 설치됨; TypeScript 우선; 마이그레이션 포함 |
| 인증 | 단일 베어러 토큰 | v0.1 단일 사용자 가정 |
| 바인드 주소 | 기본값 127.0.0.1 | 우발적 노출 최소화 |
| 어돕션 전략 | 디스커버리 시 자동 | 사용자가 외부 세션을 attach 가능해야 한다고 명시 |
| 다중 환경 지원 | 인스톨당 하나의 환경 | 사용자가 환경 간 시나리오 없음을 확정 |

## 10. 리스크와 완화

- **xterm.js 한글 IME** — 조합 상태가 터미널 내부에서 잘못 렌더링될 수 있다. 완화: 알려진 한계로 v0.1에서 수용. v0.2의 채팅 스타일 입력 바(X2)가 이를 해결.
- **네이티브 바인딩 빌드 실패** — node-pty 컴파일이 잘못 설정된 시스템에서 실패할 수 있다. 완화: 플랫폼별 필요 빌드 툴을 문서화; `.nvmrc`로 Node 버전 핀; devcontainer 이미지에서 검증.
- **고아 tmux 세션** — 시간이 지나면 세션이 누적된다. 완화: gateway의 야간 잡이 7일간(설정 가능) 활동이 없는 세션을 `dead`로 표시. v0.1에서는 자동으로 `tmux kill-session`을 호출하지 않는다; 행에 플래그만 표시하고 UI에서 정리 액션을 제공. 어돕션된 세션은 절대 자동 종료하지 않음.
- **무거운 출력에서의 WS 백프레셔** — `cat huge.log` 같은 명령이 채널을 압도할 수 있다. 완화: PTY 출력을 ~16ms 단위로 묶어 WS로 송신; `ws.bufferedAmount`가 임계치를 넘으면 `pty`를 일시중지.
- **외부 세션 속성 추정** — `pane_current_command`는 베스트-에포트 추정이다. 사용자가 중첩 프로세스를 띄웠다면 추정이 틀린다. 완화: 추정값으로 저장하고 UI에서 사용자가 CLI 라벨을 오버라이드할 수 있도록 한다.

## 11. 범위 외 (v0.2+로 보류)

- **X1 — 테마드 터미널**: 커스텀 xterm.js 테마, 폰트, 컨테이너 크롬. (사용자 지시로 보류.)
- **X2 — 채팅 스타일 입력**: 입력은 별도 텍스트영역, 출력은 readonly 터미널. 한글 IME 문제 해결. v0.2 우선순위 상위.
- **X3 — 데코레이션된 트랜스크립트**: 패턴 감지된 메시지 카드. 리스크가 크고 비용이 높음; claude 출력 포맷이 안정화된 후 재검토.
- 구조화된 채팅 / SDK 통합 (Claude가 더 이상 지원하지 않음).
- 메모리 편집기, 훅 설정 UI, ADR 템플릿, 리뷰 큐 보드, FTS, 다중 사용자 인증, 비용 대시보드, 세션 레코딩/리플레이.
- 다중 환경 세션 통합, SSH/마운트 소켓 드라이버, 호스트↔devcontainer 브리징.

## 12. 플랜 단계에서 결정할 열린 항목

이 설계의 블로커가 아니라, 구현 플랜(writing-plans 스킬) 단계까지 미루는 결정 사항:

- Next.js와 Gateway 간 REST 엔드포인트의 정확한 형태 (프록시 패스스루 vs 중복 라우트).
- Next.js 프로세스가 읽기 전용 뷰에 대해 SQLite를 직접 읽을지, 항상 Gateway를 통할지. (트레이드오프: 단순성 vs 단일 진실 소스.)
- 위키 트리를 위한 구체적인 UI 라이브러리 선택 (커스텀 vs 기성품).
- 인증 토큰 부트스트랩: 첫 실행 시 사용자에게 프롬프트 vs 환경 변수 사전 설정 요구.
