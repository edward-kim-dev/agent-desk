# agent-desk v0.1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 브라우저에서 tmux 기반 CLI AI 코딩 세션(claude/gemini/codex)을 시작·연결·관리하고, owngo `wiki/`를 탐색·편집하는 단일 페이지 웹 제품의 v0.1 구현.

**Architecture:** `agent-desk/` 내부 pnpm 모노레포 (`apps/web` Next.js 16 + `apps/gateway` 상주 Node 데몬 + `packages/shared` drizzle 스키마/공유 타입). 웹은 포트 3333, 게이트웨이는 127.0.0.1:3334. 게이트웨이만 node-pty/tmux/SQLite를 만지고, 웹은 베어러 토큰을 단 REST/WS로 호출한다.

**Tech Stack:** Next.js 16, React 19, TypeScript 5, Tailwind 4, xterm.js, CodeMirror 6, Hono (HTTP), `ws` (WebSocket), node-pty, better-sqlite3, drizzle-orm + drizzle-kit, Vitest + @testing-library/react, smol-toml, Zod.

**참조 스펙:** [2026-05-19-agent-desk-design.md](../specs/2026-05-19-agent-desk-design.md)

> **커밋 정책:** 각 태스크의 작업·테스트가 끝나면, 태스크 맨 아래 박스에 적힌 **제안 커밋 메시지**를 사용자 응답에 그대로 포함만 한다. 사용자가 명시적으로 "커밋해줘"라고 지시하기 전까지 실행 에이전트가 직접 `git add`/`git commit`을 실행하지 않는다.

---

## File Structure

기존 `agent-desk/`는 단일 Next.js 앱이다. v0.1에서는 이를 내부 pnpm 모노레포로 재구성한다. 변경 후 트리:

```
agent-desk/
├── pnpm-workspace.yaml            # packages: ['apps/*', 'packages/*']
├── package.json                    # 루트: dev/build 오케스트레이션 스크립트
├── tsconfig.json                   # 루트: composite references 묶음
├── .vscode/
│   └── settings.json               # tsdk + eslint workingDirectories
├── apps/
│   ├── web/                        # Next.js 16 — 포트 3333
│   │   ├── package.json
│   │   ├── next.config.ts          # transpilePackages: ['@agent-desk/shared']
│   │   ├── tsconfig.json           # composite, refs shared
│   │   ├── app/
│   │   │   ├── layout.tsx          # 헤더 + 사이드바 + 메인 + 위키 패널 셸
│   │   │   ├── page.tsx            # 클라이언트 셸 진입
│   │   │   ├── globals.css
│   │   │   └── api/
│   │   │       └── proxy/[...path]/route.ts   # 게이트웨이로 패스스루
│   │   ├── components/
│   │   │   ├── workspace-switcher.tsx
│   │   │   ├── workspace-form.tsx
│   │   │   ├── session-list.tsx
│   │   │   ├── new-session-dialog.tsx
│   │   │   ├── terminal-panel.tsx           # xterm.js + WS
│   │   │   ├── wiki-panel.tsx               # 토글 패널 컨테이너
│   │   │   ├── wiki-tree.tsx
│   │   │   ├── wiki-viewer.tsx
│   │   │   ├── wiki-editor.tsx              # CodeMirror 6
│   │   │   └── wiki-log-composer.tsx
│   │   ├── hooks/
│   │   │   ├── use-gateway.ts              # fetch + 토큰 헤더
│   │   │   └── use-session-stream.ts       # WS 자동 재연결
│   │   └── lib/
│   │       └── gateway-client.ts
│   └── gateway/                    # 상주 Node — 포트 3334
│       ├── package.json
│       ├── tsconfig.json
│       ├── drizzle.config.ts
│       ├── src/
│       │   ├── main.ts                     # 엔트리: config 로드 → DB → server
│       │   ├── config.ts                   # smol-toml + env
│       │   ├── auth.ts                     # bearer 토큰 미들웨어
│       │   ├── db.ts                       # better-sqlite3 + drizzle + WAL + migrations
│       │   ├── server.ts                   # Hono 앱 + WS 어태치
│       │   ├── routes/
│       │   │   ├── workspaces.ts
│       │   │   ├── sessions.ts
│       │   │   └── wiki.ts
│       │   ├── tmux/
│       │   │   ├── commands.ts             # list/new/kill (exec 래핑)
│       │   │   ├── attach.ts               # node-pty + ws pipe
│       │   │   └── discover.ts             # 5초 폴링 + diff + adoption
│       │   ├── ws/
│       │   │   └── attach-server.ts        # 업그레이드 핸들러
│       │   ├── jobs/
│       │   │   └── nightly-cleanup.ts      # 7일 미활동 → status='dead'
│       │   └── util/
│       │       ├── slug.ts
│       │       └── log.ts
│       └── tests/
│           ├── tmux-commands.test.ts
│           ├── discover.test.ts
│           ├── auth.test.ts
│           ├── workspaces.test.ts
│           ├── sessions.test.ts
│           ├── attach.integration.test.ts
│           ├── nightly-cleanup.test.ts
│           └── wiki.test.ts
├── packages/
│   └── shared/                     # @agent-desk/shared
│       ├── package.json
│       ├── tsconfig.json
│       ├── src/
│       │   ├── index.ts                    # 배럴
│       │   ├── db/
│       │   │   ├── schema.ts               # workspaces/sessions/session_events
│       │   │   └── types.ts                # InferSelect/Insert 재노출
│       │   ├── api/
│       │   │   ├── workspace.ts            # Zod 스키마 + 타입
│       │   │   ├── session.ts
│       │   │   └── wiki.ts
│       │   └── cli/
│       │       └── catalog.ts              # CliEntry 타입
│       └── tests/
│           └── schema.test.ts
├── data/                           # SQLite + WAL (gitignored)
├── docs/
│   └── superpowers/
│       ├── specs/
│       └── plans/
└── README.md                       # devloop, tmux 설치 안내, 토큰 부트스트랩
```

설계 원칙 재확인:
- 네이티브 모듈(`node-pty`, `better-sqlite3`)은 `apps/gateway`의 `dependencies`에만 둔다. `apps/web`은 절대 직접 import 못 하도록 의존성으로 가드레일.
- 공유 코드(타입, Zod 스키마, drizzle 스키마, CLI 카탈로그 타입)는 `@agent-desk/shared`. 양쪽 앱이 `workspace:*` 로 의존.
- 마이그레이션 SQL은 `apps/gateway/drizzle/`에 생성하고 부팅 시 적용 (스키마는 shared, 마이그레이션 적용 코드는 gateway 소유).

---

## Task 1: 모노레포 재구성 + 워크스페이스 부트스트랩

기존 단일 패키지 agent-desk를 pnpm 모노레포로 전환하고 빈 `apps/web`·`apps/gateway`·`packages/shared` 골격을 만든다.

**Files:**
- Modify: `agent-desk/pnpm-workspace.yaml`
- Modify: `agent-desk/package.json`
- Create: `agent-desk/tsconfig.json` (composite refs)
- Create: `agent-desk/.vscode/settings.json`
- Create: `agent-desk/apps/web/` (기존 코드 이전, 아래 step 참조)
- Create: `agent-desk/apps/gateway/package.json`, `tsconfig.json`, `src/main.ts`
- Create: `agent-desk/packages/shared/package.json`, `tsconfig.json`, `src/index.ts`
- Test: `agent-desk/packages/shared/tests/sanity.test.ts`

- [ ] **Step 1: `pnpm-workspace.yaml`에 packages 등록**

기존 파일을 다음으로 덮어쓴다 — `storeDir`/`allowBuilds`는 보존하고 `packages` 키만 추가한다.

```yaml
# agent-desk/pnpm-workspace.yaml
storeDir: /home/vscode/.local/share/pnpm/store

packages:
  - 'apps/*'
  - 'packages/*'

allowBuilds:
  better-sqlite3: true
  esbuild: true
  sharp: true
  unrs-resolver: false
```

- [ ] **Step 2: 기존 Next.js 앱을 `apps/web`으로 이동**

쉘에서 일괄 수행:

```bash
cd /workspaces/owngo/agent-desk
mkdir -p apps/web packages/shared/src apps/gateway/src
git mv app apps/web/app
git mv public apps/web/public
git mv next.config.ts apps/web/next.config.ts
git mv eslint.config.mjs apps/web/eslint.config.mjs
git mv postcss.config.mjs apps/web/postcss.config.mjs
git mv next-env.d.ts apps/web/next-env.d.ts
# tsconfig.json은 루트용으로 새로 쓸 거라 일단 이동
git mv tsconfig.json apps/web/tsconfig.json
# 빌드 캐시는 버린다
rm -f tsconfig.tsbuildinfo
```

- [ ] **Step 3: 루트 `package.json` 재작성 (오케스트레이션 전용)**

```json
{
  "name": "agent-desk",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "pnpm -r --parallel dev",
    "build": "pnpm -r build",
    "lint": "pnpm -r lint",
    "test": "pnpm -r test",
    "typecheck": "tsc -b"
  },
  "devDependencies": {
    "typescript": "^5"
  },
  "pnpm": {
    "onlyBuiltDependencies": [
      "better-sqlite3",
      "node-pty",
      "sharp"
    ]
  }
}
```

- [ ] **Step 4: `apps/web/package.json` 작성 (기존 deps 이전)**

```json
{
  "name": "@agent-desk/web",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev -p 3333",
    "build": "next build",
    "start": "next start -p 3333",
    "lint": "eslint",
    "test": "vitest run",
    "typecheck": "tsc -b"
  },
  "dependencies": {
    "@agent-desk/shared": "workspace:*",
    "next": "16.2.6",
    "react": "19.2.4",
    "react-dom": "19.2.4"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "^4",
    "@testing-library/react": "^16.1.0",
    "@types/node": "^20",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "@vitejs/plugin-react": "^4.3.4",
    "eslint": "^9",
    "eslint-config-next": "16.2.6",
    "jsdom": "^25.0.1",
    "tailwindcss": "^4",
    "typescript": "^5",
    "vitest": "^2.1.8"
  }
}
```

- [ ] **Step 5: `apps/web/next.config.ts` 갱신 — shared transpile + node 네이티브는 외부화**

```ts
// agent-desk/apps/web/next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@agent-desk/shared"],
  serverExternalPackages: ["sharp"],
};

export default nextConfig;
```

`better-sqlite3`은 더 이상 web 의존성이 아니므로 `serverExternalPackages`에서 제거한다.

- [ ] **Step 6: `apps/web/tsconfig.json` 작성 (composite)**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "composite": true,
    "outDir": ".next/types",
    "rootDir": ".",
    "jsx": "react-jsx",
    "lib": ["dom", "dom.iterable", "esnext"],
    "plugins": [{ "name": "next" }],
    "paths": {
      "@/*": ["./*"]
    }
  },
  "references": [{ "path": "../../packages/shared" }],
  "include": [
    "next-env.d.ts",
    "**/*.ts",
    "**/*.tsx",
    ".next/types/**/*.ts"
  ],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 7: `agent-desk/tsconfig.base.json`과 루트 `tsconfig.json` 작성**

`tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "esnext",
    "moduleResolution": "bundler",
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "allowJs": true,
    "incremental": true
  }
}
```

`tsconfig.json` (루트):

```json
{
  "files": [],
  "references": [
    { "path": "./packages/shared" },
    { "path": "./apps/gateway" },
    { "path": "./apps/web" }
  ]
}
```

- [ ] **Step 8: `packages/shared/package.json`과 `tsconfig.json` 작성**

```json
{
  "name": "@agent-desk/shared",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts",
    "./db/schema": "./src/db/schema.ts"
  },
  "scripts": {
    "dev": "tsc -b --watch",
    "build": "tsc -b",
    "test": "vitest run",
    "typecheck": "tsc -b"
  },
  "devDependencies": {
    "typescript": "^5",
    "vitest": "^2.1.8"
  }
}
```

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "composite": true,
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true,
    "noEmit": false
  },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 9: `packages/shared/src/index.ts`에 sentinel 노출**

```ts
// agent-desk/packages/shared/src/index.ts
export const SHARED_VERSION = "0.1.0";
```

- [ ] **Step 10: 실패하는 sanity 테스트 작성**

```ts
// agent-desk/packages/shared/tests/sanity.test.ts
import { describe, expect, it } from "vitest";
import { SHARED_VERSION } from "../src/index";

describe("@agent-desk/shared", () => {
  it("SHARED_VERSION을 export한다", () => {
    expect(SHARED_VERSION).toBe("0.1.0");
  });
});
```

- [ ] **Step 11: `apps/gateway/package.json`과 `tsconfig.json` 골격**

```json
{
  "name": "@agent-desk/gateway",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/main.ts",
    "build": "tsc -b",
    "start": "node dist/main.js",
    "lint": "echo 'no lint yet'",
    "test": "vitest run",
    "typecheck": "tsc -b"
  },
  "dependencies": {
    "@agent-desk/shared": "workspace:*"
  },
  "devDependencies": {
    "@types/node": "^20",
    "tsx": "^4.19.2",
    "typescript": "^5",
    "vitest": "^2.1.8"
  }
}
```

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "composite": true,
    "outDir": "dist",
    "rootDir": "src",
    "noEmit": false,
    "module": "esnext",
    "moduleResolution": "bundler"
  },
  "references": [{ "path": "../../packages/shared" }],
  "include": ["src/**/*.ts"]
}
```

`src/main.ts` 자리표시:

```ts
// agent-desk/apps/gateway/src/main.ts
import { SHARED_VERSION } from "@agent-desk/shared";
console.log(`agent-desk gateway booting (shared ${SHARED_VERSION})`);
```

- [ ] **Step 12: `.vscode/settings.json` 추가**

```json
{
  "typescript.tsdk": "node_modules/typescript/lib",
  "eslint.workingDirectories": [{ "mode": "auto" }],
  "files.exclude": {
    "**/.next": true,
    "**/dist": true,
    "**/*.tsbuildinfo": true
  }
}
```

- [ ] **Step 13: `pnpm install` 실행 후 sanity 테스트 통과 확인**

```bash
cd /workspaces/owngo/agent-desk
pnpm install
pnpm -r test
```

Expected: `packages/shared`의 1 테스트 통과, 다른 워크스페이스는 테스트 없음 또는 통과.

**제안 커밋 메시지**

```
refactor(agent-desk): split into pnpm monorepo (apps/web, apps/gateway, packages/shared)
```

---

## Task 2: 공유 DB 스키마 (drizzle)

설계 §6.3의 SQL을 drizzle로 정의하고 타입을 노출한다. 게이트웨이가 import해서 마이그레이션과 쿼리에 사용한다.

**Files:**
- Modify: `agent-desk/packages/shared/package.json` (add drizzle-orm)
- Create: `agent-desk/packages/shared/src/db/schema.ts`
- Create: `agent-desk/packages/shared/src/db/types.ts`
- Modify: `agent-desk/packages/shared/src/index.ts`
- Test: `agent-desk/packages/shared/tests/schema.test.ts`

- [ ] **Step 1: shared에 drizzle-orm 추가**

```bash
cd /workspaces/owngo/agent-desk
pnpm --filter @agent-desk/shared add drizzle-orm
```

- [ ] **Step 2: 실패하는 스키마 모양 테스트 작성**

```ts
// agent-desk/packages/shared/tests/schema.test.ts
import { describe, expect, it } from "vitest";
import { sessions, sessionEvents, workspaces } from "../src/db/schema";

describe("db 스키마", () => {
  it("workspaces 테이블이 기대한 컬럼을 노출한다", () => {
    const cols = Object.keys(workspaces);
    expect(cols).toEqual(
      expect.arrayContaining(["id", "path", "name", "createdAt"])
    );
  });

  it("sessions 테이블이 기대한 컬럼을 노출한다", () => {
    const cols = Object.keys(sessions);
    expect(cols).toEqual(
      expect.arrayContaining([
        "id",
        "tmuxName",
        "workspaceId",
        "cli",
        "args",
        "status",
        "lastActivityAt",
        "createdAt",
        "adopted",
      ])
    );
  });

  it("session_events 테이블이 기대한 컬럼을 노출한다", () => {
    const cols = Object.keys(sessionEvents);
    expect(cols).toEqual(
      expect.arrayContaining(["id", "sessionId", "kind", "payloadJson", "at"])
    );
  });
});
```

- [ ] **Step 3: 테스트 실행 — 실패 확인**

```bash
pnpm --filter @agent-desk/shared test
```

Expected: FAIL — `Cannot find module '../src/db/schema'`.

- [ ] **Step 4: drizzle 스키마 구현**

```ts
// agent-desk/packages/shared/src/db/schema.ts
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const workspaces = sqliteTable("workspaces", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  path: text("path").notNull().unique(),
  name: text("name").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const sessions = sqliteTable("sessions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  tmuxName: text("tmux_name").notNull().unique(),
  workspaceId: integer("workspace_id").references(() => workspaces.id),
  cli: text("cli"),
  args: text("args"),
  status: text("status", { enum: ["active", "dead"] }).notNull(),
  lastActivityAt: integer("last_activity_at").notNull(),
  createdAt: integer("created_at").notNull(),
  adopted: integer("adopted").notNull().default(0),
});

export const sessionEvents = sqliteTable("session_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  sessionId: integer("session_id")
    .notNull()
    .references(() => sessions.id),
  kind: text("kind", {
    enum: ["created", "attached", "detached", "killed", "adopted"],
  }).notNull(),
  payloadJson: text("payload_json"),
  at: integer("at").notNull(),
});
```

- [ ] **Step 5: 타입 재노출**

```ts
// agent-desk/packages/shared/src/db/types.ts
import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { sessionEvents, sessions, workspaces } from "./schema";

export type Workspace = InferSelectModel<typeof workspaces>;
export type WorkspaceInsert = InferInsertModel<typeof workspaces>;

export type Session = InferSelectModel<typeof sessions>;
export type SessionInsert = InferInsertModel<typeof sessions>;

export type SessionEvent = InferSelectModel<typeof sessionEvents>;
export type SessionEventInsert = InferInsertModel<typeof sessionEvents>;

export type SessionStatus = Session["status"];
export type SessionEventKind = SessionEvent["kind"];
```

- [ ] **Step 6: `src/index.ts` 배럴 갱신**

```ts
// agent-desk/packages/shared/src/index.ts
export const SHARED_VERSION = "0.1.0";

export * from "./db/schema";
export * from "./db/types";
```

- [ ] **Step 7: 테스트 통과 확인**

```bash
pnpm --filter @agent-desk/shared test
```

Expected: 4 tests PASS.

**제안 커밋 메시지**

```
feat(shared): add drizzle schema for workspaces, sessions, session_events
```

---

## Task 3: 공유 API 페이로드 (Zod 스키마)

REST 페이로드와 위키 페이로드를 Zod로 정의해 양쪽 앱이 같은 검증/타입을 쓰게 한다.

**Files:**
- Modify: `agent-desk/packages/shared/package.json` (add zod)
- Create: `agent-desk/packages/shared/src/api/workspace.ts`
- Create: `agent-desk/packages/shared/src/api/session.ts`
- Create: `agent-desk/packages/shared/src/api/wiki.ts`
- Create: `agent-desk/packages/shared/src/cli/catalog.ts`
- Modify: `agent-desk/packages/shared/src/index.ts`
- Test: `agent-desk/packages/shared/tests/api.test.ts`

- [ ] **Step 1: zod 추가**

```bash
pnpm --filter @agent-desk/shared add zod
```

- [ ] **Step 2: 실패하는 API 스키마 테스트 작성**

```ts
// agent-desk/packages/shared/tests/api.test.ts
import { describe, expect, it } from "vitest";
import {
  createSessionRequest,
  createWorkspaceRequest,
  writeWikiFileRequest,
} from "../src";

describe("api 스키마", () => {
  it("선행 슬래시가 없는 워크스페이스 경로를 거부한다", () => {
    const result = createWorkspaceRequest.safeParse({
      name: "owngo",
      path: "owngo",
    });
    expect(result.success).toBe(false);
  });

  it("올바른 형식의 워크스페이스를 수락한다", () => {
    const result = createWorkspaceRequest.safeParse({
      name: "owngo",
      path: "/workspaces/owngo",
    });
    expect(result.success).toBe(true);
  });

  it("workspaceId 없는 세션 요청을 거부한다", () => {
    const result = createSessionRequest.safeParse({
      cli: "claude",
      args: [],
    });
    expect(result.success).toBe(false);
  });

  it("절대 경로 또는 ..을 포함한 위키 쓰기를 거부한다", () => {
    expect(
      writeWikiFileRequest.safeParse({ path: "/etc/passwd", content: "" })
        .success
    ).toBe(false);
    expect(
      writeWikiFileRequest.safeParse({ path: "../escape.md", content: "" })
        .success
    ).toBe(false);
  });

  it("상대 경로 위키 쓰기를 수락한다", () => {
    expect(
      writeWikiFileRequest.safeParse({
        path: "L1-claims/note.md",
        content: "hi",
      }).success
    ).toBe(true);
  });
});
```

- [ ] **Step 3: 테스트 실행 — 실패 확인**

Run: `pnpm --filter @agent-desk/shared test`
Expected: FAIL — `../src` exports missing.

- [ ] **Step 4: 워크스페이스 페이로드 구현**

```ts
// agent-desk/packages/shared/src/api/workspace.ts
import { z } from "zod";

export const createWorkspaceRequest = z.object({
  name: z.string().min(1).max(120),
  path: z.string().startsWith("/"),
});
export type CreateWorkspaceRequest = z.infer<typeof createWorkspaceRequest>;

export const workspaceDto = z.object({
  id: z.number().int(),
  name: z.string(),
  path: z.string(),
  createdAt: z.number().int(),
});
export type WorkspaceDto = z.infer<typeof workspaceDto>;
```

- [ ] **Step 5: 세션 페이로드 구현**

```ts
// agent-desk/packages/shared/src/api/session.ts
import { z } from "zod";

export const createSessionRequest = z.object({
  workspaceId: z.number().int().positive(),
  cli: z.string().min(1),
  args: z.array(z.string()).default([]),
});
export type CreateSessionRequest = z.infer<typeof createSessionRequest>;

export const sessionStatus = z.enum(["active", "dead"]);
export const sessionEventKind = z.enum([
  "created",
  "attached",
  "detached",
  "killed",
  "adopted",
]);

export const sessionDto = z.object({
  id: z.number().int(),
  tmuxName: z.string(),
  workspaceId: z.number().int().nullable(),
  cli: z.string().nullable(),
  args: z.string().nullable(),
  status: sessionStatus,
  adopted: z.boolean(),
  attachedClients: z.number().int().nonnegative(),
  lastActivityAt: z.number().int(),
  createdAt: z.number().int(),
});
export type SessionDto = z.infer<typeof sessionDto>;

export const sessionListDto = z.object({
  sessions: z.array(sessionDto),
});
```

- [ ] **Step 6: 위키 페이로드 구현**

```ts
// agent-desk/packages/shared/src/api/wiki.ts
import { z } from "zod";

const safeRelativePath = z
  .string()
  .min(1)
  .refine((p) => !p.startsWith("/") && !p.startsWith("\\"), {
    message: "path must be relative to wiki/",
  })
  .refine((p) => !p.split(/[\\/]/).some((seg) => seg === ".." || seg === ""), {
    message: "path must not traverse out of wiki/",
  });

export const readWikiFileRequest = z.object({ path: safeRelativePath });
export const writeWikiFileRequest = z.object({
  path: safeRelativePath,
  content: z.string(),
});
export const appendLogRequest = z.object({ body: z.string().min(1) });

export const wikiTreeNode: z.ZodType<{
  name: string;
  path: string;
  type: "dir" | "file";
  children?: Array<{ name: string; path: string; type: "dir" | "file" }>;
}> = z.lazy(() =>
  z.object({
    name: z.string(),
    path: z.string(),
    type: z.enum(["dir", "file"]),
    children: z.array(wikiTreeNode).optional(),
  })
);

export const wikiFileDto = z.object({
  path: z.string(),
  content: z.string(),
  frontmatter: z.record(z.string(), z.unknown()).nullable(),
  schemaWarnings: z.array(z.string()),
});
export type WikiFileDto = z.infer<typeof wikiFileDto>;
```

- [ ] **Step 7: CLI 카탈로그 타입**

```ts
// agent-desk/packages/shared/src/cli/catalog.ts
import { z } from "zod";

export const cliEntry = z.object({
  name: z.string().min(1),
  command: z.string().min(1),
  defaultArgs: z.array(z.string()).default([]),
});
export type CliEntry = z.infer<typeof cliEntry>;
```

- [ ] **Step 8: 배럴 갱신**

```ts
// agent-desk/packages/shared/src/index.ts
export const SHARED_VERSION = "0.1.0";

export * from "./db/schema";
export * from "./db/types";
export * from "./api/workspace";
export * from "./api/session";
export * from "./api/wiki";
export * from "./cli/catalog";
```

- [ ] **Step 9: 테스트 통과 확인**

```bash
pnpm --filter @agent-desk/shared test
```

Expected: 9 tests PASS in shared.

**제안 커밋 메시지**

```
feat(shared): add zod schemas for workspace/session/wiki APIs and CLI catalog
```

---

## Task 4: 게이트웨이 설정 로더 (smol-toml + 환경변수)

설계 §8의 단일 설정 파일과 `AGENT_DESK_TOKEN` 환경변수 처리.

**Files:**
- Modify: `agent-desk/apps/gateway/package.json` (add smol-toml, zod)
- Create: `agent-desk/apps/gateway/src/config.ts`
- Test: `agent-desk/apps/gateway/tests/config.test.ts`

- [ ] **Step 1: deps 추가**

```bash
pnpm --filter @agent-desk/gateway add smol-toml zod
pnpm --filter @agent-desk/gateway add -D @types/node vitest
```

- [ ] **Step 2: 설정 모양에 대한 실패 테스트**

```ts
// agent-desk/apps/gateway/tests/config.test.ts
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config";

const ORIGINAL_ENV = process.env;

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

afterEach(() => {
  process.env = ORIGINAL_ENV;
});

describe("loadConfig", () => {
  it("파일이 없으면 기본값을 반환한다", () => {
    process.env.AGENT_DESK_TOKEN = "tkn";
    const cfg = loadConfig({ configPath: "/nonexistent/agent-desk.toml" });
    expect(cfg.server.gatewayPort).toBe(3334);
    expect(cfg.server.uiPort).toBe(3333);
    expect(cfg.server.bind).toBe("127.0.0.1");
    expect(cfg.token).toBe("tkn");
    expect(cfg.cli.map((c) => c.name)).toEqual(["claude", "gemini", "codex"]);
  });

  it("TOML 오버라이드를 기본값 위에 병합한다", () => {
    process.env.AGENT_DESK_TOKEN = "tkn";
    const dir = mkdtempSync(join(tmpdir(), "ad-cfg-"));
    const file = join(dir, "agent-desk.config.toml");
    writeFileSync(
      file,
      `
[server]
gateway_port = 4444

[[cli]]
name = "aider"
command = "aider"
default_args = ["--no-auto-commits"]
`
    );
    const cfg = loadConfig({ configPath: file });
    expect(cfg.server.gatewayPort).toBe(4444);
    expect(cfg.cli.find((c) => c.name === "aider")?.command).toBe("aider");
    expect(cfg.cli.find((c) => c.name === "claude")).toBeDefined();
  });

  it("AGENT_DESK_TOKEN이 없으면 예외를 던진다", () => {
    delete process.env.AGENT_DESK_TOKEN;
    expect(() =>
      loadConfig({ configPath: "/nonexistent/agent-desk.toml" })
    ).toThrow(/AGENT_DESK_TOKEN/);
  });
});
```

- [ ] **Step 3: 테스트 실행 — 실패 확인**

Run: `pnpm --filter @agent-desk/gateway test`
Expected: FAIL — `Cannot find module '../src/config'`.

- [ ] **Step 4: 설정 로더 구현**

```ts
// agent-desk/apps/gateway/src/config.ts
import { readFileSync } from "node:fs";
import { parse as parseToml } from "smol-toml";
import { z } from "zod";
import { cliEntry, type CliEntry } from "@agent-desk/shared";

const tomlSchema = z.object({
  server: z
    .object({
      gateway_port: z.number().int().optional(),
      ui_port: z.number().int().optional(),
      bind: z.string().optional(),
    })
    .partial()
    .optional(),
  cli: z
    .array(
      z.object({
        name: z.string(),
        command: z.string(),
        default_args: z.array(z.string()).optional(),
      })
    )
    .optional(),
});

export interface GatewayConfig {
  server: { gatewayPort: number; uiPort: number; bind: string };
  cli: CliEntry[];
  token: string;
}

const DEFAULT_CLI: CliEntry[] = [
  { name: "claude", command: "claude", defaultArgs: [] },
  { name: "gemini", command: "gemini", defaultArgs: [] },
  { name: "codex", command: "codex", defaultArgs: [] },
];

export function loadConfig(opts: { configPath?: string } = {}): GatewayConfig {
  const token = process.env.AGENT_DESK_TOKEN;
  if (!token || token.trim() === "") {
    throw new Error(
      "AGENT_DESK_TOKEN environment variable is required to start the gateway"
    );
  }

  let raw: unknown = {};
  if (opts.configPath) {
    try {
      raw = parseToml(readFileSync(opts.configPath, "utf8"));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }
  }

  const parsed = tomlSchema.parse(raw);
  const cliFromToml = (parsed.cli ?? []).map((c) =>
    cliEntry.parse({
      name: c.name,
      command: c.command,
      defaultArgs: c.default_args ?? [],
    })
  );

  const merged = new Map<string, CliEntry>();
  for (const c of DEFAULT_CLI) merged.set(c.name, c);
  for (const c of cliFromToml) merged.set(c.name, c);

  return {
    server: {
      gatewayPort: parsed.server?.gateway_port ?? 3334,
      uiPort: parsed.server?.ui_port ?? 3333,
      bind: parsed.server?.bind ?? "127.0.0.1",
    },
    cli: Array.from(merged.values()),
    token,
  };
}
```

- [ ] **Step 5: vitest 설정 (워크스페이스마다)**

```ts
// agent-desk/apps/gateway/vitest.config.ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
});
```

- [ ] **Step 6: 테스트 통과 확인**

```bash
pnpm --filter @agent-desk/gateway test
```

Expected: 3 tests PASS.

**제안 커밋 메시지**

```
feat(gateway): load TOML config + AGENT_DESK_TOKEN env
```

---

## Task 5: 게이트웨이 DB 부팅 (better-sqlite3 + WAL + 마이그레이션)

설계 §6.1에 따라 `agent-desk/data/agent-desk.sqlite`에 DB를 두고 WAL 모드 + 부팅 시 자동 마이그레이션.

**Files:**
- Modify: `agent-desk/apps/gateway/package.json` (add better-sqlite3, drizzle-orm, drizzle-kit)
- Create: `agent-desk/apps/gateway/drizzle.config.ts`
- Create: `agent-desk/apps/gateway/drizzle/` (생성된 SQL 들어감)
- Create: `agent-desk/apps/gateway/src/db.ts`
- Test: `agent-desk/apps/gateway/tests/db.test.ts`

- [ ] **Step 1: deps 추가 + 스크립트**

```bash
pnpm --filter @agent-desk/gateway add better-sqlite3 drizzle-orm
pnpm --filter @agent-desk/gateway add -D drizzle-kit @types/better-sqlite3
```

`apps/gateway/package.json`의 scripts에 추가:

```json
"db:generate": "drizzle-kit generate",
"db:migrate": "drizzle-kit migrate"
```

- [ ] **Step 2: drizzle-kit 설정 작성**

```ts
// agent-desk/apps/gateway/drizzle.config.ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: "../../packages/shared/src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: "../../data/agent-desk.sqlite",
  },
});
```

- [ ] **Step 3: 마이그레이션 SQL 생성**

```bash
cd /workspaces/owngo/agent-desk
pnpm --filter @agent-desk/gateway db:generate
ls apps/gateway/drizzle/
```

Expected: `apps/gateway/drizzle/0000_<adjective>_<noun>.sql` + `meta/_journal.json` 생성됨. (이 파일들을 git에 커밋.)

- [ ] **Step 4: 실패하는 DB 부팅 테스트**

```ts
// agent-desk/apps/gateway/tests/db.test.ts
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDatabase } from "../src/db";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ad-db-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("openDatabase", () => {
  it("data 디렉터리를 만들고 마이그레이션을 적용한다", () => {
    const dbFile = join(dir, "nested", "agent-desk.sqlite");
    const handle = openDatabase({ filePath: dbFile });
    expect(existsSync(dbFile)).toBe(true);
    const tables = handle.raw
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all() as Array<{ name: string }>;
    const names = tables.map((t) => t.name);
    expect(names).toEqual(
      expect.arrayContaining(["workspaces", "sessions", "session_events"])
    );
    handle.close();
  });

  it("WAL 모드를 활성화한다", () => {
    const dbFile = join(dir, "agent-desk.sqlite");
    const handle = openDatabase({ filePath: dbFile });
    const mode = handle.raw.pragma("journal_mode", { simple: true });
    expect(mode).toBe("wal");
    handle.close();
  });
});
```

- [ ] **Step 5: 테스트 실행 — 실패 확인**

Run: `pnpm --filter @agent-desk/gateway test tests/db.test.ts`
Expected: FAIL — `Cannot find module '../src/db'`.

- [ ] **Step 6: DB 핸들 구현**

```ts
// agent-desk/apps/gateway/src/db.ts
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "@agent-desk/shared/db/schema";

export interface DbHandle {
  db: BetterSQLite3Database<typeof schema>;
  raw: Database.Database;
  close: () => void;
}

const MIGRATIONS_FOLDER = resolve(
  new URL("../drizzle", import.meta.url).pathname
);

export function openDatabase(opts: { filePath: string }): DbHandle {
  mkdirSync(dirname(opts.filePath), { recursive: true });
  const raw = new Database(opts.filePath);
  raw.pragma("journal_mode = WAL");
  raw.pragma("foreign_keys = ON");
  const db = drizzle(raw, { schema });
  migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  return {
    db,
    raw,
    close: () => raw.close(),
  };
}

export const DEFAULT_DB_PATH = resolve(
  new URL("../../../data/agent-desk.sqlite", import.meta.url).pathname
);
```

- [ ] **Step 7: 테스트 통과 확인**

```bash
pnpm --filter @agent-desk/gateway test tests/db.test.ts
```

Expected: 2 tests PASS.

**제안 커밋 메시지**

```
feat(gateway): open SQLite with WAL and apply drizzle migrations on boot
```

---

## Task 6: 게이트웨이 HTTP 서버 + 인증 미들웨어 (Hono)

베어러 토큰 검증과 헬스 엔드포인트, 그리고 라우트가 붙을 자리.

**Files:**
- Modify: `agent-desk/apps/gateway/package.json` (add hono, @hono/node-server)
- Create: `agent-desk/apps/gateway/src/auth.ts`
- Create: `agent-desk/apps/gateway/src/server.ts`
- Modify: `agent-desk/apps/gateway/src/main.ts`
- Test: `agent-desk/apps/gateway/tests/server.test.ts`

- [ ] **Step 1: deps 추가**

```bash
pnpm --filter @agent-desk/gateway add hono @hono/node-server
```

- [ ] **Step 2: 실패하는 서버/인증 테스트 작성**

```ts
// agent-desk/apps/gateway/tests/server.test.ts
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer } from "../src/server";
import { openDatabase, type DbHandle } from "../src/db";

let dbHandle: DbHandle;
let dir: string;
let url: string;
let stop: () => Promise<void>;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "ad-srv-"));
  dbHandle = openDatabase({ filePath: join(dir, "agent-desk.sqlite") });
  const built = await createServer({
    db: dbHandle,
    token: "secret",
    cli: [],
    bind: "127.0.0.1",
    port: 0,
  });
  url = built.url;
  stop = built.close;
});

afterAll(async () => {
  await stop();
  dbHandle.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("gateway 서버", () => {
  it("인증 없이도 /health에 200을 응답한다 (liveness)", async () => {
    const res = await fetch(`${url}/health`);
    expect(res.status).toBe(200);
  });

  it("인증 없는 /sessions 요청을 거부한다", async () => {
    const res = await fetch(`${url}/sessions`);
    expect(res.status).toBe(401);
  });

  it("잘못된 토큰을 거부한다", async () => {
    const res = await fetch(`${url}/sessions`, {
      headers: { authorization: "Bearer wrong" },
    });
    expect(res.status).toBe(401);
  });

  it("올바른 토큰을 수락한다 (라우트 추가 전까지는 404 가능)", async () => {
    const res = await fetch(`${url}/sessions`, {
      headers: { authorization: "Bearer secret" },
    });
    expect([200, 404]).toContain(res.status);
  });
});
```

- [ ] **Step 3: 인증 미들웨어 구현**

```ts
// agent-desk/apps/gateway/src/auth.ts
import type { MiddlewareHandler } from "hono";

export function bearerAuth(expected: string): MiddlewareHandler {
  return async (c, next) => {
    const header = c.req.header("authorization") ?? "";
    const [scheme, token] = header.split(/\s+/);
    if (scheme?.toLowerCase() !== "bearer" || token !== expected) {
      return c.json({ error: "unauthorized" }, 401);
    }
    await next();
  };
}
```

- [ ] **Step 4: 서버 구현**

```ts
// agent-desk/apps/gateway/src/server.ts
import { serve, type ServerType } from "@hono/node-server";
import { Hono } from "hono";
import type { AddressInfo } from "node:net";
import { bearerAuth } from "./auth";
import type { DbHandle } from "./db";
import type { CliEntry } from "@agent-desk/shared";

export interface CreateServerOptions {
  db: DbHandle;
  token: string;
  cli: CliEntry[];
  bind: string;
  port: number;
}

export interface RunningServer {
  url: string;
  port: number;
  close: () => Promise<void>;
}

export async function createServer(
  opts: CreateServerOptions
): Promise<RunningServer> {
  const app = new Hono();

  app.get("/health", (c) => c.json({ ok: true }));

  const api = new Hono();
  api.use("*", bearerAuth(opts.token));
  api.get("/cli", (c) => c.json({ cli: opts.cli }));
  // Workspaces / sessions / wiki routes are mounted in later tasks
  app.route("/", api);

  const server = await new Promise<ServerType>((resolve) => {
    const s = serve(
      { fetch: app.fetch, hostname: opts.bind, port: opts.port },
      () => resolve(s)
    );
  });

  const addr = server.address() as AddressInfo;
  return {
    url: `http://${opts.bind}:${addr.port}`,
    port: addr.port,
    close: () =>
      new Promise<void>((res, rej) =>
        server.close((err) => (err ? rej(err) : res()))
      ),
  };
}
```

- [ ] **Step 5: `main.ts` 갱신 (실 런타임 글루)**

```ts
// agent-desk/apps/gateway/src/main.ts
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadConfig } from "./config";
import { openDatabase, DEFAULT_DB_PATH } from "./db";
import { createServer } from "./server";

async function bootstrap() {
  const localConfig = resolve(process.cwd(), "agent-desk.config.toml");
  const globalConfig = resolve(
    process.env.HOME ?? "",
    ".config/agent-desk/config.toml"
  );
  const configPath = existsSync(localConfig)
    ? localConfig
    : existsSync(globalConfig)
      ? globalConfig
      : undefined;

  const config = loadConfig({ configPath });
  const db = openDatabase({ filePath: DEFAULT_DB_PATH });
  const server = await createServer({
    db,
    token: config.token,
    cli: config.cli,
    bind: config.server.bind,
    port: config.server.gatewayPort,
  });
  console.log(`[gateway] listening on ${server.url}`);
}

bootstrap().catch((err) => {
  console.error("[gateway] failed to start:", err);
  process.exit(1);
});
```

- [ ] **Step 6: 테스트 통과 확인**

```bash
pnpm --filter @agent-desk/gateway test tests/server.test.ts
```

Expected: 4 tests PASS.

**제안 커밋 메시지**

```
feat(gateway): Hono server scaffold with bearer auth + /health
```

---

## Task 7: tmux 명령 래퍼 (list/new/kill)

`child_process.exec`로 tmux를 호출하는 얇은 함수. 단위 테스트는 `execFile`를 주입 가능하게 해서 mock.

**Files:**
- Create: `agent-desk/apps/gateway/src/tmux/commands.ts`
- Create: `agent-desk/apps/gateway/src/util/slug.ts`
- Test: `agent-desk/apps/gateway/tests/tmux-commands.test.ts`
- Test: `agent-desk/apps/gateway/tests/slug.test.ts`

- [ ] **Step 1: slug 유틸 실패 테스트**

```ts
// agent-desk/apps/gateway/tests/slug.test.ts
import { describe, expect, it } from "vitest";
import { generateSessionName, slugify } from "../src/util/slug";

describe("slug", () => {
  it("워크스페이스 이름을 소문자 영숫자와 -로 슬러그화한다", () => {
    expect(slugify("Own Go Wiki!")).toBe("own-go-wiki");
  });

  it("슬러그를 16자로 잘라낸다", () => {
    expect(slugify("the-quick-brown-fox-jumps-over").length).toBeLessThanOrEqual(
      16
    );
  });

  it("세션 이름을 ad-<slug>-<6자> 형식으로 만든다", () => {
    const name = generateSessionName("Owngo Wiki");
    expect(name).toMatch(/^ad-[a-z0-9-]{1,16}-[a-z0-9]{6}$/);
  });
});
```

- [ ] **Step 2: slug 유틸 구현**

```ts
// agent-desk/apps/gateway/src/util/slug.ts
import { randomBytes } from "node:crypto";

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 16);
}

export function generateSessionName(workspaceName: string): string {
  const suffix = randomBytes(4).toString("hex").slice(0, 6);
  const slug = slugify(workspaceName) || "ws";
  return `ad-${slug}-${suffix}`;
}
```

- [ ] **Step 3: tmux 명령 래퍼 실패 테스트 (exec mocking)**

```ts
// agent-desk/apps/gateway/tests/tmux-commands.test.ts
import { describe, expect, it, vi } from "vitest";
import {
  createTmuxClient,
  type ExecLike,
  type TmuxSessionInfo,
} from "../src/tmux/commands";

function mockExec(responses: Record<string, { stdout: string; stderr?: string }>): ExecLike {
  return vi.fn(async (cmd: string, args: string[]) => {
    const key = `${cmd} ${args.join(" ")}`;
    const r = responses[key];
    if (!r) throw new Error(`unexpected exec: ${key}`);
    return { stdout: r.stdout, stderr: r.stderr ?? "" };
  }) as unknown as ExecLike;
}

describe("tmuxClient", () => {
  it("포맷된 출력으로부터 세션 목록을 파싱한다", async () => {
    const exec = mockExec({
      "tmux list-sessions -F #{session_name}|#{session_created}|#{session_attached}|#{pane_current_command}":
        {
          stdout:
            "ad-owngo-abc123|1700000000|1|claude\nlegacy|1699999999|0|bash\n",
        },
    });
    const client = createTmuxClient({ exec });
    const list: TmuxSessionInfo[] = await client.listSessions();
    expect(list).toEqual([
      {
        name: "ad-owngo-abc123",
        createdAt: 1700000000,
        attachedClients: 1,
        paneCurrentCommand: "claude",
      },
      {
        name: "legacy",
        createdAt: 1699999999,
        attachedClients: 0,
        paneCurrentCommand: "bash",
      },
    ]);
  });

  it("tmux가 'no server running'이면 빈 목록을 반환한다", async () => {
    const exec = vi.fn(async () => {
      const err = new Error("no server running on /tmp/tmux-1000/default");
      (err as NodeJS.ErrnoException & { stderr?: string }).stderr =
        "no server running on /tmp/tmux-1000/default";
      throw err;
    }) as unknown as ExecLike;
    const client = createTmuxClient({ exec });
    expect(await client.listSessions()).toEqual([]);
  });

  it("cwd와 command를 지정해 detached 세션을 생성한다", async () => {
    const exec = mockExec({
      "tmux new-session -d -s ad-owngo-aaa111 -c /workspaces/owngo claude":
        { stdout: "" },
    });
    const client = createTmuxClient({ exec });
    await client.newSession({
      name: "ad-owngo-aaa111",
      cwd: "/workspaces/owngo",
      command: "claude",
    });
  });

  it("이름으로 세션을 종료한다", async () => {
    const exec = mockExec({
      "tmux kill-session -t ad-foo": { stdout: "" },
    });
    const client = createTmuxClient({ exec });
    await client.killSession("ad-foo");
  });
});
```

- [ ] **Step 4: 명령 래퍼 구현**

```ts
// agent-desk/apps/gateway/src/tmux/commands.ts
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileP = promisify(execFile);

export interface ExecLike {
  (cmd: string, args: string[]): Promise<{ stdout: string; stderr: string }>;
}

export interface TmuxSessionInfo {
  name: string;
  createdAt: number;
  attachedClients: number;
  paneCurrentCommand: string;
}

export interface NewSessionInput {
  name: string;
  cwd: string;
  command: string;
}

export interface TmuxClient {
  listSessions(): Promise<TmuxSessionInfo[]>;
  newSession(input: NewSessionInput): Promise<void>;
  killSession(name: string): Promise<void>;
  hasSession(name: string): Promise<boolean>;
}

const LIST_FORMAT =
  "#{session_name}|#{session_created}|#{session_attached}|#{pane_current_command}";

function isNoServer(err: unknown): boolean {
  const msg =
    (err as { stderr?: string; message?: string }).stderr ??
    (err as Error).message ??
    "";
  return /no server running/.test(msg);
}

export function createTmuxClient(opts: { exec?: ExecLike } = {}): TmuxClient {
  const exec: ExecLike =
    opts.exec ?? ((cmd, args) => execFileP(cmd, args, { encoding: "utf8" }));

  async function listSessions(): Promise<TmuxSessionInfo[]> {
    try {
      const { stdout } = await exec("tmux", ["list-sessions", "-F", LIST_FORMAT]);
      return stdout
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .map((line) => {
          const [name, createdAt, attached, paneCurrentCommand] =
            line.split("|");
          return {
            name,
            createdAt: Number(createdAt),
            attachedClients: Number(attached),
            paneCurrentCommand,
          };
        });
    } catch (err) {
      if (isNoServer(err)) return [];
      throw err;
    }
  }

  async function newSession(input: NewSessionInput): Promise<void> {
    await exec("tmux", [
      "new-session",
      "-d",
      "-s",
      input.name,
      "-c",
      input.cwd,
      input.command,
    ]);
  }

  async function killSession(name: string): Promise<void> {
    await exec("tmux", ["kill-session", "-t", name]);
  }

  async function hasSession(name: string): Promise<boolean> {
    try {
      await exec("tmux", ["has-session", "-t", name]);
      return true;
    } catch {
      return false;
    }
  }

  return { listSessions, newSession, killSession, hasSession };
}
```

- [ ] **Step 5: 테스트 통과 확인**

```bash
pnpm --filter @agent-desk/gateway test tests/slug.test.ts tests/tmux-commands.test.ts
```

Expected: 3+4 = 7 tests PASS.

**제안 커밋 메시지**

```
feat(gateway): tmux command wrappers (list/new/kill) with injectable exec
```

---

## Task 8: 디스커버리 + 어돕션 루프

5초 폴링하면서 SQLite와 diff하고 새로 보인 세션을 `adopted=1`로 삽입. 사라진 세션은 `status='dead'`로 마크. CLI 라벨은 `pane_current_command`로 추정.

**Files:**
- Create: `agent-desk/apps/gateway/src/tmux/discover.ts`
- Test: `agent-desk/apps/gateway/tests/discover.test.ts`

- [ ] **Step 1: 실패 테스트 작성 — 어돕션과 사망 마킹**

```ts
// agent-desk/apps/gateway/tests/discover.test.ts
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openDatabase, type DbHandle } from "../src/db";
import { runDiscoveryTick } from "../src/tmux/discover";
import { sessions, sessionEvents } from "@agent-desk/shared/db/schema";

let dir: string;
let handle: DbHandle;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ad-disc-"));
  handle = openDatabase({ filePath: join(dir, "db.sqlite") });
});

afterEach(() => {
  handle.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("runDiscoveryTick", () => {
  it("외부에서 만든 세션을 어돕션한다", async () => {
    await runDiscoveryTick({
      db: handle.db,
      now: 1000,
      tmux: {
        listSessions: vi.fn(async () => [
          {
            name: "manual",
            createdAt: 999,
            attachedClients: 0,
            paneCurrentCommand: "claude",
          },
        ]),
      } as never,
    });
    const rows = handle.db.select().from(sessions).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      tmuxName: "manual",
      adopted: 1,
      status: "active",
      cli: "claude",
    });
    const events = handle.db.select().from(sessionEvents).all();
    expect(events.map((e) => e.kind)).toEqual(["adopted"]);
  });

  it("사라진 세션을 dead로 마킹한다", async () => {
    handle.db
      .insert(sessions)
      .values({
        tmuxName: "ghost",
        cli: "claude",
        args: "",
        status: "active",
        lastActivityAt: 100,
        createdAt: 100,
        adopted: 0,
      })
      .run();
    await runDiscoveryTick({
      db: handle.db,
      now: 2000,
      tmux: { listSessions: vi.fn(async () => []) } as never,
    });
    const row = handle.db
      .select()
      .from(sessions)
      .where(eq(sessions.tmuxName, "ghost"))
      .get();
    expect(row?.status).toBe("dead");
  });

  it("이미 알고 있는 세션을 중복 삽입하지 않는다", async () => {
    handle.db
      .insert(sessions)
      .values({
        tmuxName: "known",
        cli: "claude",
        args: "",
        status: "active",
        lastActivityAt: 100,
        createdAt: 100,
        adopted: 0,
      })
      .run();
    await runDiscoveryTick({
      db: handle.db,
      now: 2000,
      tmux: {
        listSessions: vi.fn(async () => [
          {
            name: "known",
            createdAt: 100,
            attachedClients: 1,
            paneCurrentCommand: "claude",
          },
        ]),
      } as never,
    });
    const rows = handle.db.select().from(sessions).all();
    expect(rows).toHaveLength(1);
  });
});
```

- [ ] **Step 2: 디스커버리 구현**

```ts
// agent-desk/apps/gateway/src/tmux/discover.ts
import { and, eq, inArray, notInArray } from "drizzle-orm";
import { sessionEvents, sessions } from "@agent-desk/shared/db/schema";
import type { DbHandle } from "../db";
import type { TmuxClient, TmuxSessionInfo } from "./commands";

const KNOWN_CLIS = new Set(["claude", "gemini", "codex", "aider", "opencode"]);

function inferCli(paneCurrentCommand: string): string {
  return KNOWN_CLIS.has(paneCurrentCommand) ? paneCurrentCommand : "unknown";
}

export interface DiscoveryDeps {
  db: DbHandle["db"];
  tmux: Pick<TmuxClient, "listSessions">;
  now: number;
}

export async function runDiscoveryTick(deps: DiscoveryDeps): Promise<void> {
  const live: TmuxSessionInfo[] = await deps.tmux.listSessions();
  const liveByName = new Map(live.map((s) => [s.name, s]));

  const known = deps.db.select().from(sessions).all();
  const knownByName = new Map(known.map((s) => [s.tmuxName, s]));

  // Adopt unknown live sessions
  for (const ls of live) {
    if (knownByName.has(ls.name)) continue;
    const inserted = deps.db
      .insert(sessions)
      .values({
        tmuxName: ls.name,
        workspaceId: null,
        cli: inferCli(ls.paneCurrentCommand),
        args: null,
        status: "active",
        lastActivityAt: deps.now,
        createdAt: ls.createdAt > 0 ? ls.createdAt * 1000 : deps.now,
        adopted: 1,
      })
      .returning({ id: sessions.id })
      .all();
    deps.db
      .insert(sessionEvents)
      .values({
        sessionId: inserted[0].id,
        kind: "adopted",
        payloadJson: JSON.stringify({ paneCurrentCommand: ls.paneCurrentCommand }),
        at: deps.now,
      })
      .run();
  }

  // Mark vanished active sessions dead
  const liveNames = Array.from(liveByName.keys());
  const vanished = known
    .filter((s) => s.status === "active" && !liveByName.has(s.tmuxName))
    .map((s) => s.id);
  if (vanished.length > 0) {
    deps.db
      .update(sessions)
      .set({ status: "dead" })
      .where(inArray(sessions.id, vanished))
      .run();
    for (const id of vanished) {
      deps.db
        .insert(sessionEvents)
        .values({
          sessionId: id,
          kind: "killed",
          payloadJson: JSON.stringify({ reason: "vanished" }),
          at: deps.now,
        })
        .run();
    }
  }

  // Suppress unused warning
  void liveNames;
  void and;
  void notInArray;
  void eq;
}
```

- [ ] **Step 3: 테스트 통과 + 디스커버리 스케줄러 추가**

이어서 5초 폴러를 `server.ts` 부트스트랩에 붙인다 — 별도 헬퍼:

```ts
// agent-desk/apps/gateway/src/tmux/discover.ts (파일 하단에 추가)
export function startDiscoveryLoop(deps: {
  db: DbHandle["db"];
  tmux: Pick<TmuxClient, "listSessions">;
  intervalMs?: number;
}): { stop: () => void } {
  const interval = deps.intervalMs ?? 5000;
  let stopped = false;
  let timer: NodeJS.Timeout | undefined;

  const tick = async () => {
    if (stopped) return;
    try {
      await runDiscoveryTick({ db: deps.db, tmux: deps.tmux, now: Date.now() });
    } catch (err) {
      console.error("[discover] tick failed:", err);
    }
    if (!stopped) timer = setTimeout(tick, interval);
  };

  timer = setTimeout(tick, interval);
  return {
    stop: () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    },
  };
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
pnpm --filter @agent-desk/gateway test tests/discover.test.ts
```

Expected: 3 tests PASS.

**제안 커밋 메시지**

```
feat(gateway): discovery loop adopts external tmux sessions and marks vanished as dead
```

---

## Task 9: 워크스페이스 REST

`GET /workspaces`, `POST /workspaces`, `DELETE /workspaces/:id`.

**Files:**
- Create: `agent-desk/apps/gateway/src/routes/workspaces.ts`
- Modify: `agent-desk/apps/gateway/src/server.ts`
- Test: `agent-desk/apps/gateway/tests/workspaces.test.ts`

- [ ] **Step 1: 실패 테스트 (CRUD)**

```ts
// agent-desk/apps/gateway/tests/workspaces.test.ts
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer } from "../src/server";
import { openDatabase, type DbHandle } from "../src/db";

let dir: string;
let handle: DbHandle;
let url: string;
let stop: () => Promise<void>;
const TOKEN = "secret";
const headers = { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" };

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "ad-ws-"));
  handle = openDatabase({ filePath: join(dir, "db.sqlite") });
  const built = await createServer({
    db: handle,
    token: TOKEN,
    cli: [],
    bind: "127.0.0.1",
    port: 0,
  });
  url = built.url;
  stop = built.close;
});

afterAll(async () => {
  await stop();
  handle.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("workspaces 라우트", () => {
  it("처음에는 빈 목록을 반환한다", async () => {
    const res = await fetch(`${url}/workspaces`, { headers });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ workspaces: [] });
  });

  it("워크스페이스를 생성하고 반환한다", async () => {
    const res = await fetch(`${url}/workspaces`, {
      method: "POST",
      headers,
      body: JSON.stringify({ name: "owngo", path: "/workspaces/owngo" }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toMatchObject({
      id: expect.any(Number),
      name: "owngo",
      path: "/workspaces/owngo",
    });
  });

  it("중복 경로를 409로 거부한다", async () => {
    const res = await fetch(`${url}/workspaces`, {
      method: "POST",
      headers,
      body: JSON.stringify({ name: "owngo-2", path: "/workspaces/owngo" }),
    });
    expect(res.status).toBe(409);
  });

  it("잘못된 페이로드를 400으로 거부한다", async () => {
    const res = await fetch(`${url}/workspaces`, {
      method: "POST",
      headers,
      body: JSON.stringify({ name: "x", path: "relative" }),
    });
    expect(res.status).toBe(400);
  });

  it("id로 삭제한다", async () => {
    const list = (await (await fetch(`${url}/workspaces`, { headers })).json()) as {
      workspaces: Array<{ id: number }>;
    };
    const id = list.workspaces[0].id;
    const res = await fetch(`${url}/workspaces/${id}`, { method: "DELETE", headers });
    expect(res.status).toBe(204);
  });
});
```

- [ ] **Step 2: 라우터 구현**

```ts
// agent-desk/apps/gateway/src/routes/workspaces.ts
import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { workspaces, createWorkspaceRequest } from "@agent-desk/shared";
import type { DbHandle } from "../db";

export function workspaceRoutes(db: DbHandle["db"]): Hono {
  const r = new Hono();

  r.get("/", (c) => {
    const rows = db.select().from(workspaces).all();
    return c.json({ workspaces: rows });
  });

  r.post("/", async (c) => {
    const parsed = createWorkspaceRequest.safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json({ error: "invalid_request", details: parsed.error.format() }, 400);
    }
    try {
      const inserted = db
        .insert(workspaces)
        .values({
          name: parsed.data.name,
          path: parsed.data.path,
          createdAt: Date.now(),
        })
        .returning()
        .all();
      return c.json(inserted[0], 201);
    } catch (err) {
      if (String(err).includes("UNIQUE constraint failed")) {
        return c.json({ error: "workspace_exists" }, 409);
      }
      throw err;
    }
  });

  r.delete("/:id", (c) => {
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id)) return c.json({ error: "bad_id" }, 400);
    db.delete(workspaces).where(eq(workspaces.id, id)).run();
    return c.body(null, 204);
  });

  return r;
}
```

- [ ] **Step 3: 라우터를 서버에 마운트**

`agent-desk/apps/gateway/src/server.ts`의 `api` 블록에 추가:

```ts
import { workspaceRoutes } from "./routes/workspaces";
// ...
api.route("/workspaces", workspaceRoutes(opts.db.db));
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
pnpm --filter @agent-desk/gateway test tests/workspaces.test.ts
```

Expected: 5 tests PASS.

**제안 커밋 메시지**

```
feat(gateway): workspaces REST (list, create, delete) with zod validation
```

---

## Task 10: 세션 REST (create / list / kill)

명명 규칙은 `ad-<slug>-<6char>`. tmux 클라이언트는 의존성 주입으로 받는다 (테스트에서 mock 가능).

**Files:**
- Create: `agent-desk/apps/gateway/src/routes/sessions.ts`
- Modify: `agent-desk/apps/gateway/src/server.ts`
- Test: `agent-desk/apps/gateway/tests/sessions.test.ts`

- [ ] **Step 1: 실패 테스트**

```ts
// agent-desk/apps/gateway/tests/sessions.test.ts
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createServer } from "../src/server";
import { openDatabase, type DbHandle } from "../src/db";
import { workspaces } from "@agent-desk/shared/db/schema";

const TOKEN = "secret";
const headers = { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" };

let dir: string;
let handle: DbHandle;
let url: string;
let stop: () => Promise<void>;
let workspaceId: number;
const newSession = vi.fn(async () => {});
const killSession = vi.fn(async () => {});

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "ad-sess-"));
  handle = openDatabase({ filePath: join(dir, "db.sqlite") });
  const inserted = handle.db
    .insert(workspaces)
    .values({ name: "owngo", path: "/workspaces/owngo", createdAt: Date.now() })
    .returning()
    .all();
  workspaceId = inserted[0].id;

  const built = await createServer({
    db: handle,
    token: TOKEN,
    cli: [{ name: "claude", command: "claude", defaultArgs: [] }],
    bind: "127.0.0.1",
    port: 0,
    tmux: {
      listSessions: async () => [],
      newSession,
      killSession,
      hasSession: async () => true,
    },
  });
  url = built.url;
  stop = built.close;
});

afterAll(async () => {
  await stop();
  handle.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("sessions 라우트", () => {
  it("세션을 생성하고 tmux.newSession을 호출한다", async () => {
    const res = await fetch(`${url}/sessions`, {
      method: "POST",
      headers,
      body: JSON.stringify({ workspaceId, cli: "claude", args: [] }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.tmuxName).toMatch(/^ad-owngo-[a-z0-9]{6}$/);
    expect(body.workspaceId).toBe(workspaceId);
    expect(newSession).toHaveBeenCalledWith(
      expect.objectContaining({
        cwd: "/workspaces/owngo",
        command: "claude",
        name: body.tmuxName,
      })
    );
  });

  it("알 수 없는 cli를 400으로 거부한다", async () => {
    const res = await fetch(`${url}/sessions`, {
      method: "POST",
      headers,
      body: JSON.stringify({ workspaceId, cli: "nope", args: [] }),
    });
    expect(res.status).toBe(400);
  });

  it("새로 생성한 세션을 포함해 목록을 반환한다", async () => {
    const res = await fetch(`${url}/sessions`, { headers });
    const body = await res.json();
    expect(body.sessions).toHaveLength(1);
    expect(body.sessions[0].cli).toBe("claude");
  });

  it("세션을 종료하고 status를 dead로 마킹한다", async () => {
    const list = (await (await fetch(`${url}/sessions`, { headers })).json()) as {
      sessions: Array<{ id: number; tmuxName: string }>;
    };
    const id = list.sessions[0].id;
    const res = await fetch(`${url}/sessions/${id}`, { method: "DELETE", headers });
    expect(res.status).toBe(204);
    expect(killSession).toHaveBeenCalledWith(list.sessions[0].tmuxName);
    const after = (await (await fetch(`${url}/sessions`, { headers })).json()) as {
      sessions: Array<{ status: string }>;
    };
    expect(after.sessions[0].status).toBe("dead");
  });
});
```

- [ ] **Step 2: `createServer` 시그니처 확장**

`apps/gateway/src/server.ts`의 `CreateServerOptions`에 tmux 옵션 추가:

```ts
import type { TmuxClient } from "./tmux/commands";
import { createTmuxClient } from "./tmux/commands";
import { sessionRoutes } from "./routes/sessions";

export interface CreateServerOptions {
  db: DbHandle;
  token: string;
  cli: CliEntry[];
  bind: string;
  port: number;
  tmux?: TmuxClient;
}

// inside createServer:
const tmux = opts.tmux ?? createTmuxClient();
api.route("/workspaces", workspaceRoutes(opts.db.db));
api.route("/sessions", sessionRoutes({ db: opts.db.db, tmux, cli: opts.cli }));
```

- [ ] **Step 3: 세션 라우터 구현**

```ts
// agent-desk/apps/gateway/src/routes/sessions.ts
import { Hono } from "hono";
import { and, count, eq } from "drizzle-orm";
import {
  createSessionRequest,
  sessions,
  sessionEvents,
  workspaces,
  type CliEntry,
} from "@agent-desk/shared";
import type { DbHandle } from "../db";
import { generateSessionName } from "../util/slug";
import type { TmuxClient } from "../tmux/commands";

export function sessionRoutes(opts: {
  db: DbHandle["db"];
  tmux: TmuxClient;
  cli: CliEntry[];
}): Hono {
  const r = new Hono();

  r.get("/", (c) => {
    const rows = opts.db.select().from(sessions).all();
    const dto = rows.map((s) => ({
      id: s.id,
      tmuxName: s.tmuxName,
      workspaceId: s.workspaceId,
      cli: s.cli,
      args: s.args,
      status: s.status,
      adopted: s.adopted === 1,
      attachedClients: 0,
      lastActivityAt: s.lastActivityAt,
      createdAt: s.createdAt,
    }));
    return c.json({ sessions: dto });
  });

  r.post("/", async (c) => {
    const parsed = createSessionRequest.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: "invalid_request" }, 400);

    const cliEntry = opts.cli.find((c) => c.name === parsed.data.cli);
    if (!cliEntry) return c.json({ error: "unknown_cli" }, 400);

    const ws = opts.db
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, parsed.data.workspaceId))
      .get();
    if (!ws) return c.json({ error: "unknown_workspace" }, 400);

    const args = [...cliEntry.defaultArgs, ...parsed.data.args];
    const tmuxName = generateSessionName(ws.name);
    const command = [cliEntry.command, ...args].map(shellEscape).join(" ");

    await opts.tmux.newSession({ name: tmuxName, cwd: ws.path, command });

    const now = Date.now();
    const inserted = opts.db
      .insert(sessions)
      .values({
        tmuxName,
        workspaceId: ws.id,
        cli: cliEntry.name,
        args: args.join(" "),
        status: "active",
        lastActivityAt: now,
        createdAt: now,
        adopted: 0,
      })
      .returning()
      .all();
    opts.db
      .insert(sessionEvents)
      .values({
        sessionId: inserted[0].id,
        kind: "created",
        payloadJson: JSON.stringify({ cli: cliEntry.name, args }),
        at: now,
      })
      .run();
    const s = inserted[0];
    return c.json(
      {
        id: s.id,
        tmuxName: s.tmuxName,
        workspaceId: s.workspaceId,
        cli: s.cli,
        args: s.args,
        status: s.status,
        adopted: s.adopted === 1,
        attachedClients: 0,
        lastActivityAt: s.lastActivityAt,
        createdAt: s.createdAt,
      },
      201
    );
  });

  r.delete("/:id", async (c) => {
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id)) return c.json({ error: "bad_id" }, 400);
    const s = opts.db.select().from(sessions).where(eq(sessions.id, id)).get();
    if (!s) return c.json({ error: "not_found" }, 404);
    try {
      await opts.tmux.killSession(s.tmuxName);
    } catch (err) {
      console.warn("[sessions] kill failed (continuing):", err);
    }
    opts.db
      .update(sessions)
      .set({ status: "dead" })
      .where(eq(sessions.id, id))
      .run();
    opts.db
      .insert(sessionEvents)
      .values({
        sessionId: id,
        kind: "killed",
        payloadJson: JSON.stringify({ reason: "api_delete" }),
        at: Date.now(),
      })
      .run();
    return c.body(null, 204);
  });

  return r;
}

function shellEscape(s: string): string {
  if (/^[A-Za-z0-9_.\/=:-]+$/.test(s)) return s;
  return `'${s.replace(/'/g, `'\\''`)}'`;
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
pnpm --filter @agent-desk/gateway test tests/sessions.test.ts
```

Expected: 4 tests PASS.

**제안 커밋 메시지**

```
feat(gateway): sessions REST with tmux create + soft-kill + event log
```

---

## Task 11: WebSocket attach (node-pty ↔ ws 파이프)

브라우저가 `WS /sessions/:id/attach?cols=&rows=`로 연결하면 게이트웨이가 `tmux attach -t <name>`을 node-pty로 spawn하고 양방향 파이프. 출력은 16ms 단위 배치, `bufferedAmount` 초과 시 pause.

**Files:**
- Modify: `agent-desk/apps/gateway/package.json` (add node-pty, ws, @types/ws)
- Create: `agent-desk/apps/gateway/src/tmux/attach.ts`
- Create: `agent-desk/apps/gateway/src/ws/attach-server.ts`
- Modify: `agent-desk/apps/gateway/src/server.ts`
- Test: `agent-desk/apps/gateway/tests/attach.integration.test.ts`

이 태스크는 tmux 실 바이너리가 필요한 통합 테스트를 포함한다. CI에는 tmux 설치 단계가 있어야 한다.

- [ ] **Step 1: deps 추가**

```bash
pnpm --filter @agent-desk/gateway add node-pty ws
pnpm --filter @agent-desk/gateway add -D @types/ws
```

- [ ] **Step 2: tmux가 설치돼 있는지 확인 (없으면 설치 안내만)**

```bash
which tmux || sudo apt-get install -y tmux
tmux -V
```

Expected: `tmux 3.x` 출력. devcontainer에서 sudo 권한이 있으면 자동 설치되고, 없으면 README의 설치 안내로 안내.

- [ ] **Step 3: attach 헬퍼 실패 테스트**

```ts
// agent-desk/apps/gateway/tests/attach.integration.test.ts
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import { createServer } from "../src/server";
import { openDatabase, type DbHandle } from "../src/db";
import { workspaces, sessions } from "@agent-desk/shared/db/schema";

const HAS_TMUX = (() => {
  try {
    execFileSync("tmux", ["-V"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

const maybe = HAS_TMUX ? describe : describe.skip;

const TOKEN = "secret";

maybe("WS attach 통합 테스트", () => {
  let dir: string;
  let handle: DbHandle;
  let url: string;
  let stop: () => Promise<void>;
  let sessionId: number;
  let tmuxName: string;

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), "ad-att-"));
    handle = openDatabase({ filePath: join(dir, "db.sqlite") });
    const ws = handle.db
      .insert(workspaces)
      .values({ name: "tmp", path: dir, createdAt: Date.now() })
      .returning()
      .all();
    tmuxName = `ad-test-${Math.random().toString(36).slice(2, 8)}`;
    execFileSync("tmux", ["new-session", "-d", "-s", tmuxName, "-c", dir, "bash"]);
    const s = handle.db
      .insert(sessions)
      .values({
        tmuxName,
        workspaceId: ws[0].id,
        cli: "bash",
        args: "",
        status: "active",
        lastActivityAt: Date.now(),
        createdAt: Date.now(),
        adopted: 0,
      })
      .returning()
      .all();
    sessionId = s[0].id;

    const built = await createServer({
      db: handle,
      token: TOKEN,
      cli: [],
      bind: "127.0.0.1",
      port: 0,
    });
    url = built.url;
    stop = built.close;
  });

  afterAll(async () => {
    try {
      execFileSync("tmux", ["kill-session", "-t", tmuxName]);
    } catch {}
    await stop();
    handle.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("토큰 없는 WS 연결을 거부한다", async () => {
    const wsUrl = url.replace("http", "ws") + `/sessions/${sessionId}/attach`;
    const sock = new WebSocket(wsUrl);
    await new Promise<void>((resolve) => {
      sock.on("close", (code) => {
        expect(code).toBe(4401);
        resolve();
      });
      sock.on("error", () => {});
    });
  });

  it("입력한 바이트를 PTY가 그대로 에코한다", async () => {
    const wsUrl =
      url.replace("http", "ws") +
      `/sessions/${sessionId}/attach?cols=80&rows=24&token=${TOKEN}`;
    const sock = new WebSocket(wsUrl);
    const chunks: string[] = [];

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("timeout")), 5000);
      sock.on("open", () => {
        sock.send("echo hello-pty\r");
      });
      sock.on("message", (data) => {
        chunks.push(data.toString());
        if (chunks.join("").includes("hello-pty")) {
          clearTimeout(timer);
          sock.close();
          resolve();
        }
      });
      sock.on("error", reject);
    });

    expect(chunks.join("")).toContain("hello-pty");
  });
});
```

- [ ] **Step 4: attach 헬퍼 구현**

```ts
// agent-desk/apps/gateway/src/tmux/attach.ts
import * as pty from "node-pty";
import type { WebSocket } from "ws";

const BATCH_INTERVAL_MS = 16;
const BACKPRESSURE_THRESHOLD = 1 << 20; // 1MB

export interface AttachOptions {
  tmuxName: string;
  cols: number;
  rows: number;
  ws: WebSocket;
  onActivity?: () => void;
  onClose?: () => void;
}

export function attachPtyToSocket(opts: AttachOptions): { dispose: () => void } {
  const term = pty.spawn(
    "tmux",
    ["attach-session", "-t", opts.tmuxName],
    {
      name: "xterm-256color",
      cols: opts.cols,
      rows: opts.rows,
      cwd: process.cwd(),
      env: process.env as Record<string, string>,
    }
  );

  let pending = "";
  let flushTimer: NodeJS.Timeout | undefined;
  let paused = false;

  const flush = () => {
    if (pending.length === 0) return;
    if (opts.ws.readyState !== opts.ws.OPEN) return;
    opts.ws.send(pending);
    pending = "";
    if (opts.ws.bufferedAmount > BACKPRESSURE_THRESHOLD && !paused) {
      paused = true;
      term.pause();
    }
  };

  term.onData((chunk) => {
    pending += chunk;
    opts.onActivity?.();
    if (!flushTimer) flushTimer = setTimeout(() => {
      flushTimer = undefined;
      flush();
    }, BATCH_INTERVAL_MS);
  });

  const drainTimer = setInterval(() => {
    if (paused && opts.ws.bufferedAmount < BACKPRESSURE_THRESHOLD / 2) {
      paused = false;
      term.resume();
    }
  }, 50);

  term.onExit(() => {
    flush();
    if (opts.ws.readyState === opts.ws.OPEN) opts.ws.close(1000);
  });

  opts.ws.on("message", (raw) => {
    try {
      const text = raw.toString();
      if (text.startsWith("{")) {
        const msg = JSON.parse(text);
        if (msg.type === "resize" && Number.isInteger(msg.cols) && Number.isInteger(msg.rows)) {
          term.resize(msg.cols, msg.rows);
          return;
        }
      }
      term.write(text);
    } catch {
      term.write(raw.toString());
    }
  });

  opts.ws.on("close", () => {
    clearInterval(drainTimer);
    if (flushTimer) clearTimeout(flushTimer);
    try {
      term.kill();
    } catch {}
    opts.onClose?.();
  });

  return {
    dispose: () => {
      clearInterval(drainTimer);
      if (flushTimer) clearTimeout(flushTimer);
      try {
        term.kill();
      } catch {}
      if (opts.ws.readyState === opts.ws.OPEN) opts.ws.close(1000);
    },
  };
}
```

- [ ] **Step 5: WS 서버를 HTTP 서버에 부착**

```ts
// agent-desk/apps/gateway/src/ws/attach-server.ts
import { WebSocketServer } from "ws";
import type { IncomingMessage, Server } from "node:http";
import { eq } from "drizzle-orm";
import { sessions, sessionEvents } from "@agent-desk/shared/db/schema";
import type { DbHandle } from "../db";
import { attachPtyToSocket } from "../tmux/attach";

export function attachWsServer(opts: {
  httpServer: Server;
  db: DbHandle["db"];
  token: string;
}): { close: () => Promise<void> } {
  const wss = new WebSocketServer({ noServer: true });

  opts.httpServer.on("upgrade", (req: IncomingMessage, socket, head) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const match = url.pathname.match(/^\/sessions\/(\d+)\/attach$/);
    if (!match) {
      socket.destroy();
      return;
    }
    const tokenFromQuery = url.searchParams.get("token");
    const header = req.headers["authorization"];
    const headerToken =
      typeof header === "string" && header.toLowerCase().startsWith("bearer ")
        ? header.slice(7)
        : null;
    const provided = headerToken ?? tokenFromQuery;
    if (provided !== opts.token) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }
    const id = Number(match[1]);
    const cols = Number(url.searchParams.get("cols") ?? "80");
    const rows = Number(url.searchParams.get("rows") ?? "24");

    const session = opts.db
      .select()
      .from(sessions)
      .where(eq(sessions.id, id))
      .get();
    if (!session || session.status !== "active") {
      socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      opts.db
        .insert(sessionEvents)
        .values({
          sessionId: id,
          kind: "attached",
          payloadJson: JSON.stringify({ cols, rows }),
          at: Date.now(),
        })
        .run();
      let lastActivityFlush = 0;
      attachPtyToSocket({
        tmuxName: session.tmuxName,
        cols,
        rows,
        ws,
        onActivity: () => {
          const now = Date.now();
          if (now - lastActivityFlush > 1000) {
            lastActivityFlush = now;
            opts.db
              .update(sessions)
              .set({ lastActivityAt: now })
              .where(eq(sessions.id, id))
              .run();
          }
        },
        onClose: () => {
          opts.db
            .insert(sessionEvents)
            .values({
              sessionId: id,
              kind: "detached",
              payloadJson: null,
              at: Date.now(),
            })
            .run();
        },
      });
    });
  });

  // Custom 4401 close on bad token: send through handleUpgrade-less path
  return {
    close: async () => {
      wss.close();
    },
  };
}
```

토큰 거절 시 4401 코드 요건을 만족시키기 위해 위 401 응답 대신 WS 핸드셰이크 후 닫도록 조정한다. 위 테스트 첫 케이스(4401)를 만족시키려면 토큰을 핸드셰이크는 통과시키고 곧바로 `ws.close(4401)`로 닫는 형태로 바꾼다:

```ts
// auth 분기 부분 교체
wss.handleUpgrade(req, socket, head, (ws) => {
  if (provided !== opts.token) {
    ws.close(4401, "unauthorized");
    return;
  }
  // ... 기존 로직 계속
});
```

- [ ] **Step 6: `createServer`에서 HTTP 서버 핸들 노출 → WS 서버 부착**

`@hono/node-server`의 `serve`는 `ServerType`(= node http.Server)를 콜백 첫 인자로 준다. 이를 외부로 노출:

```ts
// server.ts 변경
import { attachWsServer } from "./ws/attach-server";

// 안에서 server 생성 직후:
const wsHandle = attachWsServer({
  httpServer: server as unknown as Server,
  db: opts.db.db,
  token: opts.token,
});

return {
  url: `http://${opts.bind}:${addr.port}`,
  port: addr.port,
  close: async () => {
    await wsHandle.close();
    await new Promise<void>((res, rej) =>
      server.close((err) => (err ? rej(err) : res()))
    );
  },
};
```

- [ ] **Step 7: 통합 테스트 실행 (tmux 있을 때만)**

```bash
pnpm --filter @agent-desk/gateway test tests/attach.integration.test.ts
```

Expected: tmux 있을 때 2 tests PASS. 없으면 skip.

**제안 커밋 메시지**

```
feat(gateway): WebSocket attach pipes node-pty<->browser with 16ms batching and backpressure
```

---

## Task 12: 야간 정리 잡 (7일 미활동 → dead)

설계 §10의 고아 세션 완화책. 어돕션된 세션은 절대 자동 종료하지 않는다.

**Files:**
- Create: `agent-desk/apps/gateway/src/jobs/nightly-cleanup.ts`
- Modify: `agent-desk/apps/gateway/src/server.ts` (옵션: 부트 시 인터벌 시작)
- Test: `agent-desk/apps/gateway/tests/nightly-cleanup.test.ts`

- [ ] **Step 1: 실패 테스트**

```ts
// agent-desk/apps/gateway/tests/nightly-cleanup.test.ts
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDatabase, type DbHandle } from "../src/db";
import { runNightlyCleanup } from "../src/jobs/nightly-cleanup";
import { sessions } from "@agent-desk/shared/db/schema";

const DAY = 24 * 60 * 60 * 1000;
let dir: string;
let handle: DbHandle;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ad-clean-"));
  handle = openDatabase({ filePath: join(dir, "db.sqlite") });
});

afterEach(() => {
  handle.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("runNightlyCleanup", () => {
  it("7일 이상 비활성인 비-어돕션 세션을 dead로 마킹한다", () => {
    const now = Date.now();
    handle.db
      .insert(sessions)
      .values([
        {
          tmuxName: "old-self",
          adopted: 0,
          status: "active",
          lastActivityAt: now - 8 * DAY,
          createdAt: now - 8 * DAY,
          cli: "claude",
          args: "",
        },
        {
          tmuxName: "old-adopted",
          adopted: 1,
          status: "active",
          lastActivityAt: now - 8 * DAY,
          createdAt: now - 8 * DAY,
          cli: "claude",
          args: "",
        },
        {
          tmuxName: "fresh",
          adopted: 0,
          status: "active",
          lastActivityAt: now - 1 * DAY,
          createdAt: now - 1 * DAY,
          cli: "claude",
          args: "",
        },
      ])
      .run();
    const result = runNightlyCleanup({ db: handle.db, now, maxInactiveMs: 7 * DAY });
    expect(result.markedDeadIds).toHaveLength(1);
    const all = handle.db.select().from(sessions).all();
    const map = Object.fromEntries(all.map((s) => [s.tmuxName, s.status]));
    expect(map["old-self"]).toBe("dead");
    expect(map["old-adopted"]).toBe("active"); // adopted는 보호
    expect(map["fresh"]).toBe("active");
  });
});
```

- [ ] **Step 2: 정리 잡 구현**

```ts
// agent-desk/apps/gateway/src/jobs/nightly-cleanup.ts
import { and, eq, inArray, lt } from "drizzle-orm";
import { sessions, sessionEvents } from "@agent-desk/shared/db/schema";
import type { DbHandle } from "../db";

export interface NightlyCleanupResult {
  markedDeadIds: number[];
}

export function runNightlyCleanup(opts: {
  db: DbHandle["db"];
  now: number;
  maxInactiveMs: number;
}): NightlyCleanupResult {
  const cutoff = opts.now - opts.maxInactiveMs;
  const stale = opts.db
    .select({ id: sessions.id })
    .from(sessions)
    .where(
      and(
        eq(sessions.status, "active"),
        eq(sessions.adopted, 0),
        lt(sessions.lastActivityAt, cutoff)
      )
    )
    .all();
  const ids = stale.map((s) => s.id);
  if (ids.length > 0) {
    opts.db
      .update(sessions)
      .set({ status: "dead" })
      .where(inArray(sessions.id, ids))
      .run();
    for (const id of ids) {
      opts.db
        .insert(sessionEvents)
        .values({
          sessionId: id,
          kind: "killed",
          payloadJson: JSON.stringify({ reason: "nightly_cleanup" }),
          at: opts.now,
        })
        .run();
    }
  }
  return { markedDeadIds: ids };
}

export function startNightlyCleanupLoop(opts: {
  db: DbHandle["db"];
  intervalMs?: number;
  maxInactiveMs?: number;
}): { stop: () => void } {
  const interval = opts.intervalMs ?? 60 * 60 * 1000; // 매 시간
  const maxInactive = opts.maxInactiveMs ?? 7 * 24 * 60 * 60 * 1000;
  const timer = setInterval(
    () => runNightlyCleanup({ db: opts.db, now: Date.now(), maxInactiveMs: maxInactive }),
    interval
  );
  return { stop: () => clearInterval(timer) };
}
```

- [ ] **Step 3: 테스트 통과 확인**

```bash
pnpm --filter @agent-desk/gateway test tests/nightly-cleanup.test.ts
```

Expected: 1 test PASS.

**제안 커밋 메시지**

```
feat(gateway): nightly cleanup marks inactive non-adopted sessions dead
```

---

## Task 13: 위키 REST (트리/읽기/쓰기/로그어펜드)

활성 워크스페이스의 `wiki/` 디렉터리 범위 내 작업만 허용. 디렉터리 이탈 방어, SCHEMA 프론트매터 검사(레이어 디렉터리 일치).

**Files:**
- Modify: `agent-desk/apps/gateway/package.json` (add gray-matter)
- Create: `agent-desk/apps/gateway/src/routes/wiki.ts`
- Modify: `agent-desk/apps/gateway/src/server.ts`
- Test: `agent-desk/apps/gateway/tests/wiki.test.ts`

- [ ] **Step 1: deps 추가**

```bash
pnpm --filter @agent-desk/gateway add gray-matter
```

- [ ] **Step 2: 실패 테스트**

```ts
// agent-desk/apps/gateway/tests/wiki.test.ts
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer } from "../src/server";
import { openDatabase, type DbHandle } from "../src/db";
import { workspaces } from "@agent-desk/shared/db/schema";

const TOKEN = "secret";
const headers = { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" };

let root: string;
let handle: DbHandle;
let url: string;
let stop: () => Promise<void>;
let wsId: number;

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), "ad-wiki-"));
  mkdirSync(join(root, "wiki/L1-claims"), { recursive: true });
  writeFileSync(
    join(root, "wiki/L1-claims/foo.md"),
    "---\nlayer: L1\nclaim_type: spec\n---\n# foo\n[bar](./bar.md)\n"
  );
  writeFileSync(join(root, "wiki/log.md"), "# log\n");

  handle = openDatabase({ filePath: join(root, "db.sqlite") });
  const ws = handle.db
    .insert(workspaces)
    .values({ name: "tmp", path: root, createdAt: Date.now() })
    .returning()
    .all();
  wsId = ws[0].id;

  const built = await createServer({
    db: handle,
    token: TOKEN,
    cli: [],
    bind: "127.0.0.1",
    port: 0,
  });
  url = built.url;
  stop = built.close;
});

afterAll(async () => {
  await stop();
  handle.close();
  rmSync(root, { recursive: true, force: true });
});

describe("wiki 라우트", () => {
  it("wiki/ 디렉터리의 트리를 반환한다", async () => {
    const res = await fetch(`${url}/workspaces/${wsId}/wiki/tree`, { headers });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.root.children?.map((c: { name: string }) => c.name).sort()).toEqual(
      ["L1-claims", "log.md"]
    );
  });

  it("위키 파일을 파싱된 프론트매터와 함께 읽는다", async () => {
    const res = await fetch(
      `${url}/workspaces/${wsId}/wiki/file?path=L1-claims/foo.md`,
      { headers }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.frontmatter).toMatchObject({ layer: "L1" });
    expect(body.content).toContain("# foo");
  });

  it("경로 탈출을 거부한다", async () => {
    const res = await fetch(
      `${url}/workspaces/${wsId}/wiki/file?path=../escape.md`,
      { headers }
    );
    expect(res.status).toBe(400);
  });

  it("파일을 쓰고 layer-디렉터리 불일치 시 schema 경고를 반환한다", async () => {
    const res = await fetch(`${url}/workspaces/${wsId}/wiki/file`, {
      method: "PUT",
      headers,
      body: JSON.stringify({
        path: "L1-claims/foo.md",
        content: "---\nlayer: L2\nclaim_type: spec\n---\n# foo\n",
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.schemaWarnings.length).toBeGreaterThan(0);
    const onDisk = readFileSync(join(root, "wiki/L1-claims/foo.md"), "utf8");
    expect(onDisk).toContain("layer: L2");
  });

  it("타임스탬프와 함께 로그 엔트리를 추가한다", async () => {
    const before = readFileSync(join(root, "wiki/log.md"), "utf8");
    const res = await fetch(`${url}/workspaces/${wsId}/wiki/log`, {
      method: "POST",
      headers,
      body: JSON.stringify({ body: "did a thing" }),
    });
    expect(res.status).toBe(204);
    const after = readFileSync(join(root, "wiki/log.md"), "utf8");
    expect(after.length).toBeGreaterThan(before.length);
    expect(after).toContain("did a thing");
  });
});
```

- [ ] **Step 3: 위키 라우터 구현**

```ts
// agent-desk/apps/gateway/src/routes/wiki.ts
import { Hono } from "hono";
import {
  appendFileSync,
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, normalize, relative, resolve } from "node:path";
import { eq } from "drizzle-orm";
import matter from "gray-matter";
import {
  appendLogRequest,
  readWikiFileRequest,
  workspaces,
  writeWikiFileRequest,
} from "@agent-desk/shared";
import type { DbHandle } from "../db";

const LAYER_PREFIXES = ["L0-", "L1-", "L2-", "L3-", "L4-", "L5-"];

function wikiRoot(workspacePath: string): string {
  return resolve(workspacePath, "wiki");
}

function safeJoin(root: string, rel: string): string | null {
  const absolute = resolve(root, rel);
  const r = relative(root, absolute);
  if (r.startsWith("..") || resolve(root, r) !== absolute) return null;
  return absolute;
}

function readTree(absRoot: string, absPath: string): unknown {
  const stat = statSync(absPath);
  const name = absPath === absRoot ? "wiki" : absPath.split("/").pop();
  if (stat.isFile()) {
    return {
      name,
      path: relative(absRoot, absPath),
      type: "file" as const,
    };
  }
  const entries = readdirSync(absPath)
    .filter((e) => !e.startsWith("."))
    .map((e) => readTree(absRoot, join(absPath, e)));
  return {
    name,
    path: relative(absRoot, absPath),
    type: "dir" as const,
    children: entries,
  };
}

function schemaWarnings(filePath: string, content: string): string[] {
  const warnings: string[] = [];
  const parsed = matter(content);
  const fm = parsed.data;
  if (!fm || Object.keys(fm).length === 0) {
    warnings.push("missing frontmatter");
    return warnings;
  }
  const layer = typeof fm.layer === "string" ? fm.layer : null;
  if (!layer) warnings.push("frontmatter missing 'layer'");
  const segments = filePath.split("/");
  const top = segments[0];
  if (top && LAYER_PREFIXES.some((p) => top.startsWith(p))) {
    const dirLayer = top.slice(0, 2); // "L1"
    if (layer && layer !== dirLayer) {
      warnings.push(
        `frontmatter layer '${layer}' does not match directory '${top}'`
      );
    }
  }
  return warnings;
}

export function wikiRoutes(db: DbHandle["db"]): Hono {
  const r = new Hono();

  r.get("/:wsId/wiki/tree", (c) => {
    const wsId = Number(c.req.param("wsId"));
    const ws = db.select().from(workspaces).where(eq(workspaces.id, wsId)).get();
    if (!ws) return c.json({ error: "not_found" }, 404);
    const root = wikiRoot(ws.path);
    if (!existsSync(root)) return c.json({ root: null });
    return c.json({ root: readTree(root, root) });
  });

  r.get("/:wsId/wiki/file", (c) => {
    const wsId = Number(c.req.param("wsId"));
    const parsed = readWikiFileRequest.safeParse({ path: c.req.query("path") });
    if (!parsed.success) return c.json({ error: "invalid_path" }, 400);
    const ws = db.select().from(workspaces).where(eq(workspaces.id, wsId)).get();
    if (!ws) return c.json({ error: "not_found" }, 404);
    const root = wikiRoot(ws.path);
    const abs = safeJoin(root, parsed.data.path);
    if (!abs) return c.json({ error: "path_traversal" }, 400);
    if (!existsSync(abs)) return c.json({ error: "not_found" }, 404);
    const content = readFileSync(abs, "utf8");
    const fm = matter(content);
    return c.json({
      path: parsed.data.path,
      content,
      frontmatter: Object.keys(fm.data).length ? fm.data : null,
      schemaWarnings: schemaWarnings(parsed.data.path, content),
    });
  });

  r.put("/:wsId/wiki/file", async (c) => {
    const wsId = Number(c.req.param("wsId"));
    const parsed = writeWikiFileRequest.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: "invalid_request" }, 400);
    const ws = db.select().from(workspaces).where(eq(workspaces.id, wsId)).get();
    if (!ws) return c.json({ error: "not_found" }, 404);
    const root = wikiRoot(ws.path);
    const abs = safeJoin(root, parsed.data.path);
    if (!abs) return c.json({ error: "path_traversal" }, 400);
    writeFileSync(abs, parsed.data.content, "utf8");
    return c.json({
      path: parsed.data.path,
      schemaWarnings: schemaWarnings(parsed.data.path, parsed.data.content),
    });
  });

  r.post("/:wsId/wiki/log", async (c) => {
    const wsId = Number(c.req.param("wsId"));
    const parsed = appendLogRequest.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: "invalid_request" }, 400);
    const ws = db.select().from(workspaces).where(eq(workspaces.id, wsId)).get();
    if (!ws) return c.json({ error: "not_found" }, 404);
    const root = wikiRoot(ws.path);
    const logFile = join(root, "log.md");
    const ts = new Date().toISOString();
    const line = `\n\n## ${ts}\n\n${parsed.data.body}\n`;
    appendFileSync(logFile, line, "utf8");
    return c.body(null, 204);
  });

  // suppress unused
  void dirname;
  void normalize;

  return r;
}
```

- [ ] **Step 4: 라우터 마운트**

```ts
// server.ts 안 api 블록
import { wikiRoutes } from "./routes/wiki";
api.route("/workspaces", wikiRoutes(opts.db.db));
```

— `wikiRoutes`는 `/:wsId/wiki/...` 구조라서 `/workspaces`에 마운트하면 `/workspaces/:wsId/wiki/...` 경로가 된다. `workspaceRoutes`의 `:id` 라우트와 prefix가 다르므로 충돌하지 않는다.

- [ ] **Step 5: 테스트 통과 확인**

```bash
pnpm --filter @agent-desk/gateway test tests/wiki.test.ts
```

Expected: 5 tests PASS.

**제안 커밋 메시지**

```
feat(gateway): wiki REST (tree, read, write with schema warnings, log append)
```

---

## Task 14: 게이트웨이 부트 통합 (디스커버리·정리 잡 시작)

`bootstrap`에서 디스커버리·야간 정리 루프를 실제로 시작한다.

**Files:**
- Modify: `agent-desk/apps/gateway/src/server.ts` (옵션 노출)
- Modify: `agent-desk/apps/gateway/src/main.ts`

- [ ] **Step 1: 서버 핸들에서 디스커버리 시작/중단 노출**

```ts
// server.ts 변경 일부
import { startDiscoveryLoop } from "./tmux/discover";
import { startNightlyCleanupLoop } from "./jobs/nightly-cleanup";

export interface CreateServerOptions {
  // ...
  startBackgroundJobs?: boolean;
}

// 안에서:
let disposers: Array<() => void> = [];
if (opts.startBackgroundJobs) {
  const disc = startDiscoveryLoop({ db: opts.db.db, tmux });
  const clean = startNightlyCleanupLoop({ db: opts.db.db });
  disposers.push(disc.stop, clean.stop);
}

return {
  url: ...,
  port: ...,
  close: async () => {
    for (const d of disposers) d();
    await wsHandle.close();
    await new Promise<void>((res, rej) =>
      server.close((err) => (err ? rej(err) : res()))
    );
  },
};
```

- [ ] **Step 2: `main.ts`에서 옵션 활성화**

```ts
const server = await createServer({
  db,
  token: config.token,
  cli: config.cli,
  bind: config.server.bind,
  port: config.server.gatewayPort,
  startBackgroundJobs: true,
});
```

- [ ] **Step 3: 수동 스모크 — 실제 부트**

```bash
cd /workspaces/owngo/agent-desk
AGENT_DESK_TOKEN=devtoken pnpm --filter @agent-desk/gateway dev &
sleep 2
curl -s http://127.0.0.1:3334/health
curl -s -H "Authorization: Bearer devtoken" http://127.0.0.1:3334/cli
kill %1
```

Expected: `{"ok":true}`, `{"cli":[...3 entries...]}`.

**제안 커밋 메시지**

```
feat(gateway): wire discovery + nightly cleanup into bootstrap
```

---

## Task 15: 웹 → 게이트웨이 프록시 라우트 + 클라이언트 훅

Next.js의 `app/api/proxy/[...path]/route.ts`가 베어러 토큰을 서버 사이드에서 부착해 게이트웨이로 패스스루. 브라우저는 토큰을 만지지 않는다.

**Files:**
- Create: `agent-desk/apps/web/app/api/proxy/[...path]/route.ts`
- Create: `agent-desk/apps/web/lib/env.ts`
- Create: `agent-desk/apps/web/lib/gateway-client.ts`
- Create: `agent-desk/apps/web/hooks/use-gateway.ts`
- Test: `agent-desk/apps/web/tests/proxy.test.ts`

- [ ] **Step 1: vitest 셋업 (web)**

`agent-desk/apps/web/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: [],
    include: ["tests/**/*.test.{ts,tsx}"],
  },
});
```

- [ ] **Step 2: env 로더**

```ts
// agent-desk/apps/web/lib/env.ts
const required = (k: string) => {
  const v = process.env[k];
  if (!v) throw new Error(`${k} is required`);
  return v;
};

export function getServerEnv() {
  return {
    gatewayUrl: process.env.AGENT_DESK_GATEWAY_URL ?? "http://127.0.0.1:3334",
    gatewayToken: required("AGENT_DESK_TOKEN"),
  };
}
```

- [ ] **Step 3: 실패 프록시 테스트**

```ts
// agent-desk/apps/web/tests/proxy.test.ts
import { describe, expect, it, vi, beforeEach } from "vitest";

beforeEach(() => {
  process.env.AGENT_DESK_TOKEN = "tkn";
  process.env.AGENT_DESK_GATEWAY_URL = "http://gateway.test";
  vi.resetModules();
});

describe("proxy 라우트 핸들러", () => {
  it("GET 요청을 bearer 토큰과 함께 전달하고 본문을 반환한다", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ workspaces: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const { GET } = await import("../app/api/proxy/[...path]/route");
    const req = new Request("http://web.test/api/proxy/workspaces");
    const res = await GET(req, { params: Promise.resolve({ path: ["workspaces"] }) });
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://gateway.test/workspaces",
      expect.objectContaining({
        headers: expect.objectContaining({ authorization: "Bearer tkn" }),
      })
    );
  });
});
```

- [ ] **Step 4: 프록시 라우트 구현**

```ts
// agent-desk/apps/web/app/api/proxy/[...path]/route.ts
import { NextResponse } from "next/server";
import { getServerEnv } from "@/lib/env";

const METHODS = ["GET", "POST", "PUT", "DELETE", "PATCH"] as const;

async function forward(
  req: Request,
  params: Promise<{ path: string[] }>
): Promise<Response> {
  const { path } = await params;
  const { gatewayUrl, gatewayToken } = getServerEnv();
  const url = new URL(req.url);
  const target = `${gatewayUrl}/${path.join("/")}${url.search}`;
  const headers: Record<string, string> = {
    authorization: `Bearer ${gatewayToken}`,
  };
  const ct = req.headers.get("content-type");
  if (ct) headers["content-type"] = ct;

  const init: RequestInit = {
    method: req.method,
    headers,
  };
  if (req.method !== "GET" && req.method !== "HEAD") {
    init.body = await req.text();
  }
  const upstream = await fetch(target, init);
  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers: upstream.headers,
  });
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ path: string[] }> }
) {
  return forward(req, ctx.params);
}
export const POST = GET;
export const PUT = GET;
export const DELETE = GET;
export const PATCH = GET;

// suppress unused
void METHODS;
```

- [ ] **Step 5: 브라우저 클라이언트 + 훅**

```ts
// agent-desk/apps/web/lib/gateway-client.ts
import type {
  CreateSessionRequest,
  CreateWorkspaceRequest,
  WorkspaceDto,
  SessionDto,
} from "@agent-desk/shared";

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/proxy/${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

export const gateway = {
  workspaces: {
    list: () => call<{ workspaces: WorkspaceDto[] }>(`workspaces`),
    create: (input: CreateWorkspaceRequest) =>
      call<WorkspaceDto>(`workspaces`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    remove: (id: number) =>
      fetch(`/api/proxy/workspaces/${id}`, { method: "DELETE" }),
  },
  sessions: {
    list: () => call<{ sessions: SessionDto[] }>(`sessions`),
    create: (input: CreateSessionRequest) =>
      call<SessionDto>(`sessions`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    remove: (id: number) =>
      fetch(`/api/proxy/sessions/${id}`, { method: "DELETE" }),
  },
  cli: () => call<{ cli: Array<{ name: string; command: string; defaultArgs: string[] }> }>(`cli`),
};
```

```ts
// agent-desk/apps/web/hooks/use-gateway.ts
"use client";
import { useEffect, useState } from "react";

export function usePolling<T>(fetcher: () => Promise<T>, intervalMs = 2000) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let stop = false;
    const tick = async () => {
      try {
        const v = await fetcher();
        if (!stop) setData(v);
      } catch (e) {
        if (!stop) setError(e as Error);
      } finally {
        if (!stop) setTimeout(tick, intervalMs);
      }
    };
    tick();
    return () => {
      stop = true;
    };
  }, [fetcher, intervalMs]);

  return { data, error };
}
```

- [ ] **Step 6: 테스트 통과 확인**

```bash
pnpm --filter @agent-desk/web test
```

Expected: 1 test PASS.

**제안 커밋 메시지**

```
feat(web): Next.js proxy route + gateway client + polling hook
```

---

## Task 16: 웹 레이아웃 + 워크스페이스 스위처/CRUD

3-영역 셸 (헤더, 사이드바, 메인) 마크업 + 워크스페이스 리스트/생성 UI.

**Files:**
- Modify: `agent-desk/apps/web/app/layout.tsx`
- Modify: `agent-desk/apps/web/app/page.tsx`
- Create: `agent-desk/apps/web/components/app-shell.tsx`
- Create: `agent-desk/apps/web/components/workspace-switcher.tsx`
- Create: `agent-desk/apps/web/components/workspace-form.tsx`
- Test: `agent-desk/apps/web/tests/workspace-switcher.test.tsx`

- [ ] **Step 1: 기존 page.tsx/layout.tsx 정리 — 신규 셸을 마운트하도록**

```tsx
// agent-desk/apps/web/app/layout.tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "agent-desk",
  description: "browser-based tmux session manager for AI coding CLIs",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
        {children}
      </body>
    </html>
  );
}
```

```tsx
// agent-desk/apps/web/app/page.tsx
import { AppShell } from "@/components/app-shell";

export default function Home() {
  return <AppShell />;
}
```

- [ ] **Step 2: 실패하는 컴포넌트 테스트**

```tsx
// agent-desk/apps/web/tests/workspace-switcher.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { WorkspaceSwitcher } from "../components/workspace-switcher";

describe("<WorkspaceSwitcher>", () => {
  it("활성 워크스페이스 이름을 렌더링한다", () => {
    render(
      <WorkspaceSwitcher
        workspaces={[
          { id: 1, name: "owngo", path: "/workspaces/owngo", createdAt: 0 },
          { id: 2, name: "side", path: "/tmp/side", createdAt: 0 },
        ]}
        activeId={2}
        onSelect={() => {}}
      />
    );
    expect(screen.getByRole("button", { name: /side/i })).toBeTruthy();
  });

  it("목록이 비었을 때 'no workspace'를 렌더링한다", () => {
    render(<WorkspaceSwitcher workspaces={[]} activeId={null} onSelect={() => {}} />);
    expect(screen.getByText(/no workspace/i)).toBeTruthy();
  });
});
```

- [ ] **Step 3: 컴포넌트 구현**

```tsx
// agent-desk/apps/web/components/workspace-switcher.tsx
"use client";
import type { WorkspaceDto } from "@agent-desk/shared";

export function WorkspaceSwitcher(props: {
  workspaces: WorkspaceDto[];
  activeId: number | null;
  onSelect: (id: number) => void;
}) {
  const active = props.workspaces.find((w) => w.id === props.activeId);
  if (props.workspaces.length === 0) {
    return <div className="text-sm text-zinc-500">no workspace yet</div>;
  }
  return (
    <details className="relative">
      <summary className="cursor-pointer list-none">
        <button className="rounded border px-3 py-1 text-sm">
          {active?.name ?? "select workspace"}
        </button>
      </summary>
      <ul className="absolute top-full left-0 z-10 mt-1 w-48 rounded border bg-white shadow dark:bg-zinc-900">
        {props.workspaces.map((w) => (
          <li key={w.id}>
            <button
              className="block w-full px-3 py-1 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
              onClick={() => props.onSelect(w.id)}
            >
              {w.name}
              <span className="ml-2 text-xs text-zinc-500">{w.path}</span>
            </button>
          </li>
        ))}
      </ul>
    </details>
  );
}
```

```tsx
// agent-desk/apps/web/components/workspace-form.tsx
"use client";
import { useState } from "react";
import { gateway } from "@/lib/gateway-client";

export function WorkspaceForm(props: { onCreated: () => void }) {
  const [name, setName] = useState("");
  const [path, setPath] = useState("");
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="flex gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        try {
          await gateway.workspaces.create({ name, path });
          setName("");
          setPath("");
          props.onCreated();
        } catch (err) {
          setError((err as Error).message);
        }
      }}
    >
      <input
        className="rounded border px-2 py-1 text-sm"
        placeholder="name"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <input
        className="rounded border px-2 py-1 text-sm flex-1"
        placeholder="/absolute/path"
        value={path}
        onChange={(e) => setPath(e.target.value)}
      />
      <button className="rounded border px-3 py-1 text-sm">add</button>
      {error && <div className="text-sm text-red-600">{error}</div>}
    </form>
  );
}
```

```tsx
// agent-desk/apps/web/components/app-shell.tsx
"use client";
import { useCallback, useEffect, useState } from "react";
import type { SessionDto, WorkspaceDto } from "@agent-desk/shared";
import { gateway } from "@/lib/gateway-client";
import { WorkspaceSwitcher } from "./workspace-switcher";
import { WorkspaceForm } from "./workspace-form";

export function AppShell() {
  const [workspaces, setWorkspaces] = useState<WorkspaceDto[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    const { workspaces } = await gateway.workspaces.list();
    setWorkspaces(workspaces);
    if (workspaces.length > 0 && activeId == null) setActiveId(workspaces[0].id);
  }, [activeId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <div className="grid h-screen grid-rows-[auto_1fr] grid-cols-[16rem_1fr_24rem]">
      <header className="col-span-3 flex items-center gap-4 border-b px-4 py-2">
        <h1 className="font-semibold">agent-desk</h1>
        <WorkspaceSwitcher
          workspaces={workspaces}
          activeId={activeId}
          onSelect={setActiveId}
        />
        <div className="flex-1" />
        <span className="text-xs text-zinc-500">v0.1</span>
      </header>
      <aside className="border-r p-3 flex flex-col gap-3">
        <WorkspaceForm onCreated={refresh} />
        <section className="text-xs uppercase text-zinc-500 mt-2">sessions</section>
        {/* Task 17 mounts session list here */}
        <div id="session-list-slot" />
      </aside>
      <main className="overflow-hidden bg-black text-zinc-100" id="terminal-slot">
        {/* Task 18 mounts terminal here */}
      </main>
      <section className="border-l p-3 overflow-y-auto" id="wiki-slot">
        {/* Task 19-20 mount wiki here */}
      </section>
    </div>
  );
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
pnpm --filter @agent-desk/web test tests/workspace-switcher.test.tsx
```

Expected: 2 tests PASS.

**제안 커밋 메시지**

```
feat(web): app shell layout with workspace switcher and add form
```

---

## Task 17: 세션 리스트 + New Session 다이얼로그

`SessionList`와 `NewSessionDialog`를 만들고 `AppShell`의 사이드바에 마운트.

**Files:**
- Create: `agent-desk/apps/web/components/session-list.tsx`
- Create: `agent-desk/apps/web/components/new-session-dialog.tsx`
- Modify: `agent-desk/apps/web/components/app-shell.tsx`
- Test: `agent-desk/apps/web/tests/session-list.test.tsx`

- [ ] **Step 1: 실패 테스트**

```tsx
// agent-desk/apps/web/tests/session-list.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SessionList } from "../components/session-list";

describe("<SessionList>", () => {
  it("기본적으로 active 상태인 세션만 렌더링한다", () => {
    render(
      <SessionList
        sessions={[
          {
            id: 1,
            tmuxName: "ad-foo-aaaaaa",
            workspaceId: 1,
            cli: "claude",
            args: "",
            status: "active",
            adopted: false,
            attachedClients: 1,
            lastActivityAt: 0,
            createdAt: 0,
          },
          {
            id: 2,
            tmuxName: "ad-bar-bbbbbb",
            workspaceId: 1,
            cli: "gemini",
            args: "",
            status: "dead",
            adopted: false,
            attachedClients: 0,
            lastActivityAt: 0,
            createdAt: 0,
          },
        ]}
        activeWorkspaceId={1}
        selectedId={null}
        onSelect={() => {}}
        onKill={() => {}}
      />
    );
    expect(screen.queryByText(/ad-foo/)).toBeTruthy();
    expect(screen.queryByText(/ad-bar/)).toBeNull();
  });
});
```

- [ ] **Step 2: 컴포넌트 구현**

```tsx
// agent-desk/apps/web/components/session-list.tsx
"use client";
import type { SessionDto } from "@agent-desk/shared";

export function SessionList(props: {
  sessions: SessionDto[];
  activeWorkspaceId: number | null;
  selectedId: number | null;
  onSelect: (id: number) => void;
  onKill: (id: number) => void;
}) {
  const scoped = props.sessions
    .filter((s) => s.status === "active")
    .filter((s) => props.activeWorkspaceId == null || s.workspaceId === props.activeWorkspaceId);

  if (scoped.length === 0) {
    return <div className="text-xs text-zinc-500">no active sessions</div>;
  }

  return (
    <ul className="flex flex-col gap-1">
      {scoped.map((s) => (
        <li
          key={s.id}
          className={`flex items-center justify-between rounded px-2 py-1 text-sm ${
            props.selectedId === s.id ? "bg-zinc-200 dark:bg-zinc-800" : ""
          }`}
        >
          <button
            className="flex-1 text-left"
            onClick={() => props.onSelect(s.id)}
            title={`${s.cli ?? "?"} • ${s.attachedClients} client(s)`}
          >
            <span className="font-mono">{s.tmuxName}</span>
            <span className="ml-2 text-xs text-zinc-500">
              {s.cli}
              {s.adopted ? " (adopted)" : ""}
            </span>
          </button>
          <button
            className="ml-2 text-xs text-red-600"
            onClick={() => props.onKill(s.id)}
          >
            kill
          </button>
        </li>
      ))}
    </ul>
  );
}
```

```tsx
// agent-desk/apps/web/components/new-session-dialog.tsx
"use client";
import { useEffect, useState } from "react";
import { gateway } from "@/lib/gateway-client";

export function NewSessionDialog(props: {
  workspaceId: number;
  onCreated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [cliList, setCliList] = useState<Array<{ name: string }>>([]);
  const [cli, setCli] = useState("claude");
  const [args, setArgs] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    gateway
      .cli()
      .then((r) => {
        setCliList(r.cli);
        if (r.cli[0]) setCli(r.cli[0].name);
      })
      .catch(() => {});
  }, []);

  if (!open) {
    return (
      <button
        className="rounded border px-2 py-1 text-sm"
        onClick={() => setOpen(true)}
      >
        + new session
      </button>
    );
  }

  return (
    <form
      className="flex flex-col gap-2 rounded border p-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        try {
          await gateway.sessions.create({
            workspaceId: props.workspaceId,
            cli,
            args: args.trim() === "" ? [] : args.trim().split(/\s+/),
          });
          setOpen(false);
          setArgs("");
          props.onCreated();
        } catch (err) {
          setError((err as Error).message);
        }
      }}
    >
      <label className="text-xs">cli</label>
      <select
        className="rounded border px-2 py-1 text-sm"
        value={cli}
        onChange={(e) => setCli(e.target.value)}
      >
        {cliList.map((c) => (
          <option key={c.name}>{c.name}</option>
        ))}
      </select>
      <label className="text-xs">args (space separated)</label>
      <input
        className="rounded border px-2 py-1 text-sm font-mono"
        value={args}
        onChange={(e) => setArgs(e.target.value)}
      />
      <div className="flex gap-2">
        <button className="rounded border px-2 py-1 text-sm">create</button>
        <button
          type="button"
          className="rounded border px-2 py-1 text-sm"
          onClick={() => setOpen(false)}
        >
          cancel
        </button>
      </div>
      {error && <div className="text-xs text-red-600">{error}</div>}
    </form>
  );
}
```

- [ ] **Step 3: AppShell에 마운트 + 폴링**

```tsx
// agent-desk/apps/web/components/app-shell.tsx (변경 부분만)
import { SessionList } from "./session-list";
import { NewSessionDialog } from "./new-session-dialog";
import type { SessionDto } from "@agent-desk/shared";

// 컴포넌트 안에:
const [sessions, setSessions] = useState<SessionDto[]>([]);
const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null);

const refreshSessions = useCallback(async () => {
  const { sessions } = await gateway.sessions.list();
  setSessions(sessions);
}, []);

useEffect(() => {
  refreshSessions();
  const t = setInterval(refreshSessions, 3000);
  return () => clearInterval(t);
}, [refreshSessions]);

// 사이드바 슬롯 부분:
<section className="text-xs uppercase text-zinc-500 mt-2 flex items-center justify-between">
  sessions
  {activeId && (
    <NewSessionDialog workspaceId={activeId} onCreated={refreshSessions} />
  )}
</section>
<SessionList
  sessions={sessions}
  activeWorkspaceId={activeId}
  selectedId={selectedSessionId}
  onSelect={setSelectedSessionId}
  onKill={async (id) => {
    await gateway.sessions.remove(id);
    refreshSessions();
  }}
/>
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
pnpm --filter @agent-desk/web test tests/session-list.test.tsx
```

Expected: 1 test PASS.

**제안 커밋 메시지**

```
feat(web): session list + new session dialog wired to gateway
```

---

## Task 18: 터미널 패널 (xterm.js + WebSocket)

`TerminalPanel`은 selectedSessionId가 있을 때 WS를 열고 xterm.js에 연결한다. Unicode 11 애드온 + fit + web-links. 리사이즈 메시지 송신. 브라우저 탈취 단축키 차단.

**Files:**
- Modify: `agent-desk/apps/web/package.json` (add xterm, xterm-addon-fit, xterm-addon-web-links, xterm-addon-unicode11)
- Create: `agent-desk/apps/web/hooks/use-terminal-socket.ts`
- Create: `agent-desk/apps/web/components/terminal-panel.tsx`
- Modify: `agent-desk/apps/web/components/app-shell.tsx`

- [ ] **Step 1: deps**

```bash
pnpm --filter @agent-desk/web add @xterm/xterm @xterm/addon-fit @xterm/addon-web-links @xterm/addon-unicode11
```

- [ ] **Step 2: 훅 구현 (테스트 없음 — DOM/WS 무거움; 수동 확인)**

```ts
// agent-desk/apps/web/hooks/use-terminal-socket.ts
"use client";
import { useEffect, useRef } from "react";

export interface TerminalSocketHandlers {
  onData: (chunk: string) => void;
  onClose: () => void;
}

export function useTerminalSocket(
  sessionId: number | null,
  cols: number,
  rows: number,
  handlers: TerminalSocketHandlers
) {
  const sockRef = useRef<WebSocket | null>(null);
  const reconnectAttempt = useRef(0);

  useEffect(() => {
    if (sessionId == null) return;
    let stopped = false;

    const connect = () => {
      if (stopped) return;
      const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
      // proxy strategy: route WS through Next? In v0.1 we connect directly to gateway
      // The browser must reach :3334 with a token in the query string.
      // For dev we hardcode 127.0.0.1:3334; production users tunnel.
      const url = `${proto}//${window.location.hostname}:3334/sessions/${sessionId}/attach?cols=${cols}&rows=${rows}&token=${encodeURIComponent(window.AGENT_DESK_BROWSER_TOKEN ?? "")}`;
      const ws = new WebSocket(url);
      sockRef.current = ws;
      ws.onopen = () => {
        reconnectAttempt.current = 0;
      };
      ws.onmessage = (ev) => handlers.onData(typeof ev.data === "string" ? ev.data : "");
      ws.onclose = () => {
        handlers.onClose();
        if (stopped) return;
        const delay = Math.min(5000, 250 * 2 ** reconnectAttempt.current++);
        setTimeout(connect, delay);
      };
    };
    connect();
    return () => {
      stopped = true;
      sockRef.current?.close();
    };
  }, [sessionId, cols, rows, handlers]);

  return {
    send: (chunk: string) => sockRef.current?.send(chunk),
    resize: (c: number, r: number) =>
      sockRef.current?.send(JSON.stringify({ type: "resize", cols: c, rows: r })),
  };
}

declare global {
  interface Window {
    AGENT_DESK_BROWSER_TOKEN?: string;
  }
}
```

**브라우저 토큰 부트스트랩**: 베어러 토큰을 브라우저에 노출하지 않는 게 이상적이지만, WS 직결 시점에서 토큰을 어떻게든 전달해야 한다. v0.1에서는 Next 서버 액션이 짧은 수명의 WS 토큰을 발급(또는 동일한 토큰을 SSR 시 `window`에 주입)하는 두 선택지가 있고, §12의 열린 항목이다. 단순화를 위해 **SSR 시 `window.AGENT_DESK_BROWSER_TOKEN`에 동일 토큰을 주입**하는 경로로 가고, 보안 강화는 v0.2로 미룬다.

`apps/web/app/layout.tsx`에 토큰 주입:

```tsx
import { getServerEnv } from "@/lib/env";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const { gatewayToken } = getServerEnv();
  return (
    <html lang="en" className="h-full">
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `window.AGENT_DESK_BROWSER_TOKEN=${JSON.stringify(gatewayToken)};`,
          }}
        />
      </head>
      <body className="min-h-full bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
        {children}
      </body>
    </html>
  );
}
```

- [ ] **Step 3: 터미널 패널 구현**

```tsx
// agent-desk/apps/web/components/terminal-panel.tsx
"use client";
import { useEffect, useMemo, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import "@xterm/xterm/css/xterm.css";
import { useTerminalSocket } from "@/hooks/use-terminal-socket";

const HIJACK_KEYS = new Set(["w", "t", "n"]);

export function TerminalPanel(props: { sessionId: number | null }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);

  const handlers = useMemo(
    () => ({
      onData: (chunk: string) => termRef.current?.write(chunk),
      onClose: () => termRef.current?.writeln("\r\n[disconnected, reconnecting…]"),
    }),
    []
  );

  const { send, resize } = useTerminalSocket(
    props.sessionId,
    termRef.current?.cols ?? 80,
    termRef.current?.rows ?? 24,
    handlers
  );

  useEffect(() => {
    if (!containerRef.current) return;
    const term = new Terminal({
      allowProposedApi: true,
      convertEol: false,
      cursorBlink: true,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.loadAddon(new WebLinksAddon());
    term.loadAddon(new Unicode11Addon());
    term.unicode.activeVersion = "11";
    term.open(containerRef.current);
    fit.fit();

    term.attachCustomKeyEventHandler((ev) => {
      const k = ev.key.toLowerCase();
      if ((ev.ctrlKey || ev.metaKey) && HIJACK_KEYS.has(k)) {
        ev.preventDefault();
        return false;
      }
      return true;
    });

    term.onData((data) => send(data));
    termRef.current = term;
    fitRef.current = fit;

    const ro = new ResizeObserver(() => {
      fit.fit();
      resize(term.cols, term.rows);
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      term.dispose();
      termRef.current = null;
    };
  }, [send, resize]);

  if (props.sessionId == null) {
    return (
      <div className="flex h-full items-center justify-center text-zinc-500">
        select or create a session
      </div>
    );
  }
  return <div ref={containerRef} className="h-full w-full" />;
}
```

- [ ] **Step 4: AppShell의 메인 영역에 마운트**

```tsx
// app-shell.tsx main 영역 변경
import { TerminalPanel } from "./terminal-panel";

<main className="overflow-hidden bg-black text-zinc-100">
  <TerminalPanel sessionId={selectedSessionId} />
</main>
```

- [ ] **Step 5: 수동 스모크 — 양 프로세스 띄우고 브라우저 확인**

```bash
cd /workspaces/owngo/agent-desk
AGENT_DESK_TOKEN=devtoken pnpm dev
```

브라우저에서 http://localhost:3333 열어 워크스페이스 추가 → 세션 생성 → 터미널에 echo/ls 입력 확인.

**제안 커밋 메시지**

```
feat(web): xterm.js terminal panel with WS attach, fit, unicode11, key hijack guard
```

---

## Task 19: 위키 트리 + 마크다운 뷰어

`WikiPanel`의 1단계: 활성 워크스페이스의 `wiki/` 트리 + 클릭 시 마크다운 뷰어 (프론트매터 메타데이터 스트립 포함).

**Files:**
- Modify: `agent-desk/apps/web/package.json` (add gray-matter, marked)
- Create: `agent-desk/apps/web/components/wiki-panel.tsx`
- Create: `agent-desk/apps/web/components/wiki-tree.tsx`
- Create: `agent-desk/apps/web/components/wiki-viewer.tsx`
- Modify: `agent-desk/apps/web/components/app-shell.tsx`
- Test: `agent-desk/apps/web/tests/wiki-tree.test.tsx`

- [ ] **Step 1: deps**

```bash
pnpm --filter @agent-desk/web add gray-matter marked
```

- [ ] **Step 2: 실패 테스트 (트리)**

```tsx
// agent-desk/apps/web/tests/wiki-tree.test.tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { WikiTree } from "../components/wiki-tree";

const tree = {
  name: "wiki",
  path: "",
  type: "dir" as const,
  children: [
    {
      name: "L1-claims",
      path: "L1-claims",
      type: "dir" as const,
      children: [
        { name: "foo.md", path: "L1-claims/foo.md", type: "file" as const },
      ],
    },
    { name: "log.md", path: "log.md", type: "file" as const },
  ],
};

describe("<WikiTree>", () => {
  it("L-prefix 디렉터리에 layer 라벨을 렌더링한다", () => {
    render(<WikiTree node={tree} onOpen={() => {}} />);
    expect(screen.getByText("L1-claims")).toBeTruthy();
  });

  it("파일 클릭 시 상대 경로로 onOpen을 호출한다", () => {
    const onOpen = vi.fn();
    render(<WikiTree node={tree} onOpen={onOpen} />);
    fireEvent.click(screen.getByText("foo.md"));
    expect(onOpen).toHaveBeenCalledWith("L1-claims/foo.md");
  });
});
```

- [ ] **Step 3: 컴포넌트 구현**

```tsx
// agent-desk/apps/web/components/wiki-tree.tsx
"use client";

export interface WikiNode {
  name: string;
  path: string;
  type: "dir" | "file";
  children?: WikiNode[];
}

export function WikiTree(props: { node: WikiNode; onOpen: (path: string) => void }) {
  if (props.node.type === "file") {
    return (
      <li>
        <button
          className="text-sm hover:underline"
          onClick={() => props.onOpen(props.node.path)}
        >
          {props.node.name}
        </button>
      </li>
    );
  }
  const layerLabel = /^L[0-5]-/.test(props.node.name)
    ? props.node.name.slice(0, 2)
    : null;
  return (
    <li>
      <details open>
        <summary className="cursor-pointer text-sm font-medium">
          {props.node.name}
          {layerLabel && (
            <span className="ml-2 rounded bg-zinc-200 px-1 text-xs text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200">
              {layerLabel}
            </span>
          )}
        </summary>
        <ul className="ml-4 mt-1 flex flex-col gap-1 border-l pl-2">
          {(props.node.children ?? []).map((c) => (
            <WikiTree key={c.path} node={c} onOpen={props.onOpen} />
          ))}
        </ul>
      </details>
    </li>
  );
}
```

```tsx
// agent-desk/apps/web/components/wiki-viewer.tsx
"use client";
import matter from "gray-matter";
import { marked } from "marked";

export function WikiViewer(props: {
  path: string;
  content: string;
  schemaWarnings: string[];
  brokenLinks?: string[];
}) {
  const fm = matter(props.content);
  const html = marked.parse(fm.content, { breaks: true }) as string;
  return (
    <article className="prose prose-sm max-w-none dark:prose-invert">
      <div className="mb-3 rounded border bg-zinc-100 p-2 text-xs dark:bg-zinc-900">
        <div className="font-mono">{props.path}</div>
        <div className="mt-1 flex flex-wrap gap-2">
          {Object.entries(fm.data).map(([k, v]) => (
            <span key={k} className="rounded bg-zinc-200 px-1 dark:bg-zinc-800">
              {k}: {String(v)}
            </span>
          ))}
        </div>
        {props.schemaWarnings.length > 0 && (
          <ul className="mt-2 text-xs text-amber-700">
            {props.schemaWarnings.map((w) => (
              <li key={w}>⚠ {w}</li>
            ))}
          </ul>
        )}
        {props.brokenLinks && props.brokenLinks.length > 0 && (
          <ul className="mt-2 text-xs text-red-600">
            {props.brokenLinks.map((l) => (
              <li key={l}>↯ broken link: {l}</li>
            ))}
          </ul>
        )}
      </div>
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </article>
  );
}
```

- [ ] **Step 4: 패널 컨테이너 (트리 + 뷰어; 편집기는 Task 20)**

```tsx
// agent-desk/apps/web/components/wiki-panel.tsx
"use client";
import { useCallback, useEffect, useState } from "react";
import { WikiTree, type WikiNode } from "./wiki-tree";
import { WikiViewer } from "./wiki-viewer";

interface WikiFile {
  path: string;
  content: string;
  schemaWarnings: string[];
}

export function WikiPanel(props: { workspaceId: number | null }) {
  const [tree, setTree] = useState<WikiNode | null>(null);
  const [openFile, setOpenFile] = useState<WikiFile | null>(null);

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

  const open = useCallback(
    async (path: string) => {
      if (props.workspaceId == null) return;
      const res = await fetch(
        `/api/proxy/workspaces/${props.workspaceId}/wiki/file?path=${encodeURIComponent(path)}`
      );
      if (res.ok) setOpenFile(await res.json());
    },
    [props.workspaceId]
  );

  if (props.workspaceId == null) {
    return <div className="text-sm text-zinc-500">no workspace selected</div>;
  }
  if (!tree) {
    return <div className="text-sm text-zinc-500">no wiki/ in workspace</div>;
  }

  return (
    <div className="flex flex-col gap-3 text-sm">
      <ul>
        <WikiTree node={tree} onOpen={open} />
      </ul>
      {openFile && (
        <WikiViewer
          path={openFile.path}
          content={openFile.content}
          schemaWarnings={openFile.schemaWarnings}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 5: AppShell의 위키 슬롯에 마운트**

```tsx
// app-shell.tsx 위키 슬롯
import { WikiPanel } from "./wiki-panel";
<section className="border-l p-3 overflow-y-auto">
  <WikiPanel workspaceId={activeId} />
</section>
```

- [ ] **Step 6: 테스트 통과 확인**

```bash
pnpm --filter @agent-desk/web test tests/wiki-tree.test.tsx
```

Expected: 2 tests PASS.

**제안 커밋 메시지**

```
feat(web): wiki panel — tree + markdown viewer with frontmatter strip and schema warnings
```

---

## Task 20: 위키 편집기 (CodeMirror 6) + 저장 + 로그 컴포저

뷰어 옆에 토글 가능한 CodeMirror 6 편집기. 저장 시 gateway PUT 호출, 응답의 schemaWarnings를 비차단으로 표시. `log.md` 어펜드 컴포저는 별도 컴포넌트.

**Files:**
- Modify: `agent-desk/apps/web/package.json` (add @codemirror/* + codemirror)
- Create: `agent-desk/apps/web/components/wiki-editor.tsx`
- Create: `agent-desk/apps/web/components/wiki-log-composer.tsx`
- Modify: `agent-desk/apps/web/components/wiki-panel.tsx`

- [ ] **Step 1: deps**

```bash
pnpm --filter @agent-desk/web add codemirror @codemirror/lang-markdown @codemirror/state @codemirror/view @codemirror/theme-one-dark
```

- [ ] **Step 2: 편집기 구현**

```tsx
// agent-desk/apps/web/components/wiki-editor.tsx
"use client";
import { useEffect, useRef, useState } from "react";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap, lineNumbers } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { oneDark } from "@codemirror/theme-one-dark";

export function WikiEditor(props: {
  initialContent: string;
  onSave: (next: string) => Promise<{ schemaWarnings: string[] }>;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  useEffect(() => {
    if (!hostRef.current) return;
    const state = EditorState.create({
      doc: props.initialContent,
      extensions: [
        lineNumbers(),
        history(),
        markdown(),
        oneDark,
        keymap.of([...defaultKeymap, ...historyKeymap]),
      ],
    });
    const view = new EditorView({ state, parent: hostRef.current });
    viewRef.current = view;
    return () => view.destroy();
  }, [props.initialContent]);

  return (
    <div className="flex flex-col gap-2">
      <div ref={hostRef} className="rounded border" style={{ minHeight: 240 }} />
      <div className="flex items-center gap-2">
        <button
          className="rounded border px-2 py-1 text-sm"
          onClick={async () => {
            const content = viewRef.current?.state.doc.toString() ?? "";
            setStatus("saving…");
            try {
              const r = await props.onSave(content);
              setWarnings(r.schemaWarnings);
              setStatus("saved");
            } catch (err) {
              setStatus(`error: ${(err as Error).message}`);
            }
          }}
        >
          save
        </button>
        {status && <span className="text-xs text-zinc-500">{status}</span>}
      </div>
      {warnings.length > 0 && (
        <ul className="text-xs text-amber-700">
          {warnings.map((w) => (
            <li key={w}>⚠ {w}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 3: 로그 컴포저**

```tsx
// agent-desk/apps/web/components/wiki-log-composer.tsx
"use client";
import { useState } from "react";

export function WikiLogComposer(props: { workspaceId: number }) {
  const [body, setBody] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  return (
    <form
      className="flex flex-col gap-2 rounded border p-2"
      onSubmit={async (e) => {
        e.preventDefault();
        if (body.trim() === "") return;
        setStatus("posting…");
        const res = await fetch(
          `/api/proxy/workspaces/${props.workspaceId}/wiki/log`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ body }),
          }
        );
        setStatus(res.ok ? "posted" : `error ${res.status}`);
        if (res.ok) setBody("");
      }}
    >
      <textarea
        className="rounded border px-2 py-1 text-sm"
        rows={3}
        placeholder="append to wiki/log.md…"
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />
      <div className="flex items-center gap-2">
        <button className="rounded border px-2 py-1 text-sm">post</button>
        {status && <span className="text-xs text-zinc-500">{status}</span>}
      </div>
    </form>
  );
}
```

- [ ] **Step 4: WikiPanel에 편집기·컴포저·깨진 링크 배지 통합**

```tsx
// wiki-panel.tsx 갱신 (요지)
import { WikiEditor } from "./wiki-editor";
import { WikiLogComposer } from "./wiki-log-composer";

// indexMd 처리 — 트리 fetch와 동시에 index.md를 읽어 ![[X]] / [X](Y) 링크 중 트리에 없는 경로를 brokenLinks로 계산
const [brokenLinksByPath, setBrokenLinksByPath] = useState<Record<string, string[]>>({});

// 트리가 갱신되면 index.md를 시도
useEffect(() => {
  (async () => {
    if (!tree || props.workspaceId == null) return;
    try {
      const r = await fetch(
        `/api/proxy/workspaces/${props.workspaceId}/wiki/file?path=index.md`
      );
      if (!r.ok) return;
      const f = (await r.json()) as { content: string };
      const known = new Set<string>();
      const collect = (n: WikiNode) => {
        if (n.type === "file") known.add(n.path);
        n.children?.forEach(collect);
      };
      collect(tree);
      const broken = Array.from(
        f.content.matchAll(/\[[^\]]+\]\(([^)\s]+\.md)\)/g)
      )
        .map((m) => m[1])
        .filter((t) => !known.has(t.replace(/^\.?\//, "")));
      setBrokenLinksByPath({ "index.md": broken });
    } catch {}
  })();
}, [tree, props.workspaceId]);

// 렌더에서 openFile?.path === "index.md"일 때 viewer에 brokenLinks 넘기기
// 그리고 viewer 아래에 토글 가능한 편집기 추가
{openFile && (
  <>
    <WikiViewer
      path={openFile.path}
      content={openFile.content}
      schemaWarnings={openFile.schemaWarnings}
      brokenLinks={brokenLinksByPath[openFile.path]}
    />
    <details>
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
          setOpenFile({ ...openFile, content: next, schemaWarnings: body.schemaWarnings });
          await refresh();
          return body;
        }}
      />
    </details>
    {openFile.path === "log.md" && (
      <WikiLogComposer workspaceId={props.workspaceId!} />
    )}
  </>
)}
```

- [ ] **Step 5: 수동 스모크**

브라우저에서 마크다운 파일 클릭 → edit 펼치고 수정 → save → schemaWarnings 표시 확인 → log.md 클릭 → composer로 항목 추가.

**제안 커밋 메시지**

```
feat(web): wiki editor (CodeMirror 6), log composer, broken-link badges for index.md
```

---

## Task 21: 개발 오케스트레이션 + 환경 부트스트랩 문서

`pnpm dev`가 양 앱을 띄우고, devcontainer/host에서 tmux/토큰 부트스트랩 안내.

**Files:**
- Modify: `agent-desk/README.md`
- Create: `agent-desk/.env.example`
- Modify: `agent-desk/package.json` (검증)

- [ ] **Step 1: `.env.example` 작성**

```
# agent-desk runtime
AGENT_DESK_TOKEN=replace-me-with-long-random-string
# (Optional) override gateway URL when web and gateway run on different hosts
AGENT_DESK_GATEWAY_URL=http://127.0.0.1:3334
```

- [ ] **Step 2: README 재작성**

```markdown
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
```

- [ ] **Step 3: `agent-desk/.nvmrc` 추가**

```
22
```

- [ ] **Step 4: 스모크 — 전체 부트**

```bash
cd /workspaces/owngo/agent-desk
pnpm install
export AGENT_DESK_TOKEN=$(openssl rand -hex 24)
pnpm build
pnpm test
pnpm typecheck
```

Expected: 빌드/타입체크/테스트 모두 통과.

**제안 커밋 메시지**

```
docs(agent-desk): README + .env.example + .nvmrc for v0.1 dev loop
```

---

## Self-Review

체크리스트 결과:

**1. Spec coverage**

- §3 환경 무관성 → Task 5, 6 (DEFAULT_DB_PATH로 상대 경로 사용)
- §4.1 프로세스 구성 → Task 1 (apps/web + apps/gateway 분리), Task 6 (gateway 서버), Task 21 (`pnpm dev` 병렬 실행)
- §4.2 분리 근거 (네이티브 격리) → Task 1 (web에 node-pty/better-sqlite3 금지), Task 11 (gateway만 node-pty)
- §4.3 패키지 구조 → Task 1 (apps/* + packages/shared, transpilePackages, composite refs, .vscode)
- §5.1 Gateway 책임 → Task 7 (tmux 명령), Task 8 (디스커버리·어돕션), Task 9-10 (REST), Task 11 (WS attach), Task 6 (auth), Task 6 (127.0.0.1 바인드), Task 14 (영속 활성도 갱신은 attach onActivity)
- §5.2 웹 UI → Task 16 (레이아웃), Task 17 (세션 리스트·다이얼로그), Task 18 (xterm fit/web-links/unicode11, 키 차단, 리사이즈)
- §5.3 위키 패널 → Task 19 (트리·뷰어), Task 20 (CodeMirror·SCHEMA 경고·index 깨진 링크·log 컴포저)
- §6.1 DB 위치 → Task 5 (DEFAULT_DB_PATH = agent-desk/data/agent-desk.sqlite, WAL)
- §6.2-6.3 스키마 → Task 2
- §7 세션 라이프사이클 → 모든 단계 커버: Discover/Adopt Task 8, Create/Kill Task 10, Attach/Detach Task 11
- §8 설정 (TOML + AGENT_DESK_TOKEN) → Task 4
- §10 리스크 (한글 IME, 빌드, 고아 세션, 백프레셔, 추정) → Task 11 (16ms 배칭 + 백프레셔), Task 12 (야간 정리, adopted 보호), README (한글 IME 한계 명시, 빌드툴 안내)
- §11 v0.2+ 보류 → 별도 처리 없음, 모두 의식적으로 미구현
- §12 열린 항목 → Task 15 (프록시 패스스루 선택), Task 18 (토큰 부트스트랩 — SSR 주입 선택)

빈틈 없음.

**2. Placeholder scan**

- "TBD" / "later" / "fill in" — 모두 없음
- 모든 step에 실제 코드/명령/페이로드 포함
- "Similar to Task N" 같은 게으른 참조 없음

**3. Type consistency**

- `CreateServerOptions`의 `tmux` 필드는 Task 10에서 도입, Task 14에서 `startBackgroundJobs` 추가
- `SessionDto`/`WorkspaceDto`는 Task 3에서 정의, web/gateway 양쪽에서 일관되게 import
- `attachPtyToSocket`의 `onActivity`/`onClose` 콜백 시그니처는 Task 11에서 정의되고 그대로 사용
- `runDiscoveryTick` / `startDiscoveryLoop` 의 deps 모양은 Task 8에서 정의되고 Task 14에서 동일 시그니처로 호출
- 위키 페이로드(`writeWikiFileRequest`)의 path 검증은 Task 3 정의가 Task 13 라우터에서 사용되며, 추가로 라우터 내부 `safeJoin`이 이중 방어

이상 없음.

---

**Plan complete and saved to `agent-desk/docs/superpowers/plans/2026-05-19-agent-desk-v0.1.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — 태스크당 fresh subagent를 디스패치해 빠른 반복과 태스크 간 리뷰 체크포인트를 둠.

**2. Inline Execution** — 이 세션에서 `executing-plans` 스킬로 배치 실행, 체크포인트마다 리뷰.

**Which approach?**
