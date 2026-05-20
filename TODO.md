# TODO

## 인프라 / 런타임

- [ ] tmux 등 외부 미들웨어가 호스트/컨테이너에 없는 경우에 대한 조치 필요
  - 현재 게이트웨이는 tmux 없이도 기동되지만 discovery 루프가 5초마다 `ENOENT` 에러를 로그에 토해낸다.
  - 옵션: (a) `isNoServer` 가드를 `ENOENT`까지 넓혀 조용히 빈 결과 반환, (b) tmux/claude/codex 설치를 devcontainer뿐 아니라 로컬(호스트) 사용자도 커버하도록 자동화 — `pnpm dev` 또는 게이트웨이 부팅 시 사전 점검 후 누락 안내/설치 스크립트 제공(OS별: apt / brew / npm 등), (c) 헬스 엔드포인트에서 미들웨어 가용성 노출.
