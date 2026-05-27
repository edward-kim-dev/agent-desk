# agent-desk

브라우저에서 tmux 기반 CLI AI 코딩 세션(claude, gemini, codex 등)을 관리하고 `wiki/` 디렉터리를 편집하는 단일 페이지 웹 제품. 자세한 설계는 `docs/superpowers/specs/2026-05-19-agent-desk-design.md`.

## Prerequisites

- Node.js 22.x (`.nvmrc` 참고)
- pnpm 9+
- tmux 3.x (host 또는 devcontainer 내부)
- 빌드 툴체인 (node-pty 컴파일용): Linux는 `build-essential`, macOS는 Xcode CLT

```bash
# Debian/Ubuntu
sudo apt-get install -y tmux build-essential python3

# macOS
brew install tmux
xcode-select --install
```

## Quickstart

```bash
cp .env.example .env
# AGENT_DESK_TOKEN을 직접 채우거나:
echo "AGENT_DESK_TOKEN=$(openssl rand -hex 24)" > .env

pnpm install
pnpm dev
```

- Web: http://localhost:3333
- Gateway: http://127.0.0.1:3334 (헬스: `/health`)

## Scripts

- `pnpm dev` — web + gateway 동시 실행 (`pnpm -r --parallel dev`)
- `pnpm build` — 두 앱 모두 프로덕션 빌드
- `pnpm test` — 모든 워크스페이스 테스트
- `pnpm typecheck` — composite refs 빌드

## Features

- 워크스페이스별 tmux 세션 관리 (claude / codex / gemini 등)
- 위키/ADR/Graph 탭, 세션 패널
- **Work packages** — 새 Claude 세션은 패키지(현재 "기획" 1 종)를 선택해 시작. brainstorming → writing-plans 의 2-step 흐름이 UI 의 Next/Complete 로 진행되며 진행 상태와 산출물 sha256 인덱스가 DB 에 기록됨.
- obra/superpowers 스킬 번들 (모든 워크스페이스 자동 symlink)
- **(Opt-in) RevFactory/harness 통합** — 워크스페이스 생성 시 활성화하면 multi-agent 팀 생성 스킬 자동 install + claude 세션에 `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` 주입. **Claude Max 구독 필요**, codex/gemini 세션에서는 동작하지 않음.

## 데이터

SQLite DB와 WAL/SHM은 `agent-desk/data/`에 저장되며 `.gitignore`로 커밋되지 않는다. 머신 간 이전은 디렉터리 통째 복사.

## 보안

- 게이트웨이는 기본값으로 `127.0.0.1:3334`에 바인딩한다.
- 베어러 토큰은 `AGENT_DESK_TOKEN` 환경 변수로만 주입한다. 설정 파일에 저장하지 않는다.
- v0.1은 단일 사용자 가정이다. 멀티 사용자 인증, 외부 노출은 v0.2+.

## 알려진 한계 (v0.1)

- xterm.js에서 한글 IME 조합이 부정확할 수 있다. v0.2 채팅 스타일 입력 바로 해결 예정.
- 어돕션된 외부 tmux 세션은 자동 종료되지 않는다.
- 위키 SCHEMA 검증은 비차단 경고이며 차단하지 않는다.
- `pnpm --filter @agent-desk/web build`는 Next 16.2의 `/_global-error` 내부 페이지 사전 렌더에서 `useContext` 오류로 실패한다 (Next 업스트림 이슈). `pnpm --filter @agent-desk/web dev`는 정상 동작한다. 운영 빌드가 필요하면 Next 패치 이후 재시도하거나 `output: "standalone"` 등을 검토하라.
