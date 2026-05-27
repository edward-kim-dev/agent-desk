# agent-desk — Claude 작업 가이드

## 브랜치

- **main 에서 직접 작업한다.** feature branch 만들지 말 것.
- 다음 PR 검토는 main 의 최근 커밋들을 기준으로 한다.

## 커밋 정책

- **모듈 단위로 큼직하게 묶어서 커밋한다.** TDD red→green 단계마다 커밋 금지.
- 표준 모듈 묶음:
  - `packages/shared` + `apps/gateway` — 한 커밋 (스키마·DTO·라우트가 강결합)
  - `apps/web` — 한 커밋
  - `docs/superpowers/{specs,plans}/**` + `README.md` — 한 커밋
- **사용자 검토 후에만 커밋한다.** 작업 중에는 commit 하지 말 것. 모든 phase 가 끝나고 사용자가 검토 + 승인하면 그때 한 번에 정리해서 commit.
- 커밋 메시지는 한국어로. 끝에 `Co-Authored-By: Claude <noreply@anthropic.com>` trailer.

## owngo 서브모듈

- agent-desk 는 owngo repo 의 git submodule. agent-desk 커밋 후 항상 owngo 에서 submodule pointer 도 bump 커밋한다.
- `git -C /workspaces/owngo add agent-desk && git -C /workspaces/owngo commit -m "chore: agent-desk 서브모듈 갱신 — ..."`

## 검증

- 작업 완료 전 fresh run 으로 verify:
  - `pnpm typecheck`
  - `pnpm test` (모든 워크스페이스)
- pre-existing 결함은 별도 보고. 우리 변경과 무관한 회귀는 fix 강요하지 않음.
