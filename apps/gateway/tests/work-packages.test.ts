import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { eq } from "drizzle-orm";
import {
  sessions,
  workPackageArtifacts,
  workPackages,
  workspaces,
} from "@agent-desk/shared";
import { createServer } from "../src/server";
import { openDatabase, type DbHandle } from "../src/db";

const TOKEN = "secret";
const headers = {
  authorization: `Bearer ${TOKEN}`,
  "content-type": "application/json",
};

let dir: string;
let fsRoot: string;
let handle: DbHandle;
let url: string;
let stop: () => Promise<void>;
let workspaceId: number;
let claudeSessionId: number;
let codexSessionId: number;

const newSession = vi.fn(async () => {});
const injectFn = vi.fn(async () => ({ injected: true }));
const ensureSkillFn = vi.fn(async () => ({
  status: "installed" as const,
  linkPath: "/tmp/ws/.claude/skills/brainstorming",
  sourcePath: "/tmp/vendor/skills/brainstorming",
}));

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "ad-wp-"));
  fsRoot = mkdtempSync(join(tmpdir(), "ad-wp-fs-"));
  mkdirSync(join(fsRoot, "docs/superpowers/specs"), { recursive: true });
  mkdirSync(join(fsRoot, "docs/superpowers/plans"), { recursive: true });

  handle = openDatabase({ filePath: join(dir, "db.sqlite") });
  const w = handle.db
    .insert(workspaces)
    .values({ name: "owngo", path: fsRoot, createdAt: Date.now() })
    .returning()
    .all();
  workspaceId = w[0].id;
  const sClaude = handle.db
    .insert(sessions)
    .values({
      tmuxName: "ad-wp-claude",
      workspaceId,
      cli: "claude",
      args: "",
      status: "active",
      lastActivityAt: Date.now(),
      createdAt: Date.now(),
      adopted: 0,
    })
    .returning()
    .all();
  claudeSessionId = sClaude[0].id;
  const sCodex = handle.db
    .insert(sessions)
    .values({
      tmuxName: "ad-wp-codex",
      workspaceId,
      cli: "codex",
      args: "",
      status: "active",
      lastActivityAt: Date.now(),
      createdAt: Date.now(),
      adopted: 0,
    })
    .returning()
    .all();
  codexSessionId = sCodex[0].id;

  const built = await createServer({
    db: handle,
    token: TOKEN,
    cli: [
      { name: "claude", command: "claude", defaultArgs: [] },
      { name: "codex", command: "codex", defaultArgs: [] },
    ],
    bind: "127.0.0.1",
    port: 0,
    tmux: {
      listSessions: async () => [],
      newSession,
      killSession: async () => {},
      hasSession: async () => true,
      sendKeys: async () => {},
      capturePane: async () => "",
      capturePaneHistory: async () => "",
      paneCurrentCommand: async () => "claude",
      paneChildren: async () => [],
    },
    injectFn,
    ensureSkillFn,
    ensureAllSkillsFn: async () => ({ results: [] }),
    installSkillsOnStartup: false,
  });
  url = built.url;
  stop = built.close;
});

afterAll(async () => {
  await stop();
  handle.close();
  rmSync(dir, { recursive: true, force: true });
  rmSync(fsRoot, { recursive: true, force: true });
});

beforeEach(() => {
  injectFn.mockClear();
  ensureSkillFn.mockClear();
  injectFn.mockImplementation(async () => ({ injected: true }));
});

describe("GET /packages", () => {
  it("planning · develop · freeform 패키지를 반환한다", async () => {
    const res = await fetch(`${url}/packages`, { headers });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      packages: Array<{
        id: string;
        stepTitles: string[];
        fields: Array<{ name: string; kind: string; optionsSource?: string }>;
      }>;
    };
    expect(body.packages.map((p) => p.id)).toEqual([
      "freeform",
      "planning",
      "develop",
    ]);
    const planning = body.packages.find((p) => p.id === "planning")!;
    expect(planning.stepTitles).toEqual(["Brainstorm", "Write plan"]);
    // develop 의 plan select 필드가 optionsSource 와 함께 직렬화된다
    const develop = body.packages.find((p) => p.id === "develop")!;
    expect(develop.fields[0]).toMatchObject({
      name: "planPath",
      kind: "select",
      optionsSource: "plans",
    });
  });
});

describe("POST /sessions/:id/work-packages — start", () => {
  it("Step 1 prompt 주입 + row + baseline + 기존 .md 캡처", async () => {
    writeFileSync(
      join(fsRoot, "docs/superpowers/specs/preexisting.md"),
      "old",
    );

    const res = await fetch(`${url}/sessions/${claudeSessionId}/work-packages`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        packageId: "planning",
        inputs: { topic: "T", context: "C" },
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      instance: { id: number; currentStep: number };
      step: { index: number; title: string };
    };
    expect(body.instance.currentStep).toBe(1);
    expect(body.step).toEqual({ index: 1, title: "Brainstorm" });
    expect(injectFn).toHaveBeenCalledTimes(1);
    const firstCall = injectFn.mock.calls[0][0] as { prompt: string };
    expect(firstCall.prompt).toBe("/brainstorming Topic: T · Context: C");

    const arts = handle.db.select().from(workPackageArtifacts).all();
    expect(arts).toHaveLength(0);

    const row = handle.db
      .select()
      .from(workPackages)
      .where(eq(workPackages.id, body.instance.id))
      .get();
    const baseline = JSON.parse(row!.baselineJson) as Record<string, string>;
    expect(baseline["docs/superpowers/specs/preexisting.md"]).toMatch(
      /^[a-f0-9]{64}$/,
    );
  });

  it("unknown_package → 400", async () => {
    const res = await fetch(`${url}/sessions/${claudeSessionId}/work-packages`, {
      method: "POST",
      headers,
      body: JSON.stringify({ packageId: "nope", inputs: { topic: "t" } }),
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("unknown_package");
  });

  it("invalid_inputs (topic 누락) → 400", async () => {
    // abandon active first
    const active = handle.db
      .select()
      .from(workPackages)
      .where(eq(workPackages.status, "active"))
      .get();
    if (active) {
      await fetch(`${url}/work-packages/${active.id}/complete`, {
        method: "POST",
        headers,
        body: JSON.stringify({ outcome: "abandoned" }),
      });
    }
    const res = await fetch(`${url}/sessions/${claudeSessionId}/work-packages`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        packageId: "planning",
        inputs: { context: "no topic" },
      }),
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_inputs");
  });

  it("cli != claude → 409", async () => {
    const res = await fetch(`${url}/sessions/${codexSessionId}/work-packages`, {
      method: "POST",
      headers,
      body: JSON.stringify({ packageId: "planning", inputs: { topic: "t" } }),
    });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("session_cli_mismatch");
  });

  it("inject 실패 → 502, work_packages row 미작성", async () => {
    injectFn.mockResolvedValueOnce({ injected: false, reason: "timeout" });
    const s = handle.db
      .insert(sessions)
      .values({
        tmuxName: "ad-wp-fail",
        workspaceId,
        cli: "claude",
        args: "",
        status: "active",
        lastActivityAt: Date.now(),
        createdAt: Date.now(),
        adopted: 0,
      })
      .returning()
      .all();
    const before = handle.db.select().from(workPackages).all().length;
    const res = await fetch(`${url}/sessions/${s[0].id}/work-packages`, {
      method: "POST",
      headers,
      body: JSON.stringify({ packageId: "planning", inputs: { topic: "t" } }),
    });
    expect(res.status).toBe(502);
    const after = handle.db.select().from(workPackages).all().length;
    expect(after).toBe(before);
  });
});

describe("POST /work-packages/:id/advance", () => {
  let wpId: number;

  beforeAll(async () => {
    // 이전 활성 abandon
    const active = handle.db
      .select()
      .from(workPackages)
      .where(eq(workPackages.status, "active"))
      .get();
    if (active) {
      await fetch(`${url}/work-packages/${active.id}/complete`, {
        method: "POST",
        headers,
        body: JSON.stringify({ outcome: "abandoned" }),
      });
    }
    const s = handle.db
      .insert(sessions)
      .values({
        tmuxName: "ad-wp-adv",
        workspaceId,
        cli: "claude",
        args: "",
        status: "active",
        lastActivityAt: Date.now(),
        createdAt: Date.now(),
        adopted: 0,
      })
      .returning()
      .all();
    const startRes = await fetch(
      `${url}/sessions/${s[0].id}/work-packages`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          packageId: "planning",
          inputs: { topic: "X" },
        }),
      },
    );
    const body = (await startRes.json()) as { instance: { id: number } };
    wpId = body.instance.id;
  });

  it("step 1 → 2 + 새 spec.md 를 artifact 로 인덱싱", async () => {
    writeFileSync(
      join(fsRoot, "docs/superpowers/specs/new-design.md"),
      "design body",
    );
    injectFn.mockClear();
    const res = await fetch(`${url}/work-packages/${wpId}/advance`, {
      method: "POST",
      headers,
      body: JSON.stringify({ expectedCurrentStep: 1 }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      instance: { currentStep: number };
    };
    expect(body.instance.currentStep).toBe(2);
    const firstCall = injectFn.mock.calls[0][0] as { prompt: string };
    expect(firstCall.prompt).toBe("/writing-plans");

    const arts = handle.db
      .select()
      .from(workPackageArtifacts)
      .where(eq(workPackageArtifacts.workPackageId, wpId))
      .all();
    const newDesign = arts.find(
      (a) => a.filePath === "docs/superpowers/specs/new-design.md",
    );
    expect(newDesign).toBeTruthy();
    expect(newDesign!.stepIndex).toBe(1);
  });

  it("expected_step_mismatch → 409", async () => {
    const res = await fetch(`${url}/work-packages/${wpId}/advance`, {
      method: "POST",
      headers,
      body: JSON.stringify({ expectedCurrentStep: 99 }),
    });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("expected_step_mismatch");
  });

  it("마지막 step 에서 no_next_step → 409", async () => {
    const res = await fetch(`${url}/work-packages/${wpId}/advance`, {
      method: "POST",
      headers,
      body: JSON.stringify({ expectedCurrentStep: 2 }),
    });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("no_next_step");
  });
});

describe("POST /work-packages/:id/complete", () => {
  it("status=completed + 마지막 step 산출물 인덱싱", async () => {
    const s = handle.db
      .insert(sessions)
      .values({
        tmuxName: "ad-wp-cmp",
        workspaceId,
        cli: "claude",
        args: "",
        status: "active",
        lastActivityAt: Date.now(),
        createdAt: Date.now(),
        adopted: 0,
      })
      .returning()
      .all();
    const start = await fetch(
      `${url}/sessions/${s[0].id}/work-packages`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          packageId: "planning",
          inputs: { topic: "T" },
        }),
      },
    );
    const startBody = (await start.json()) as { instance: { id: number } };
    const wpId = startBody.instance.id;

    writeFileSync(
      join(fsRoot, "docs/superpowers/plans/p.md"),
      "plan body",
    );
    const res = await fetch(`${url}/work-packages/${wpId}/complete`, {
      method: "POST",
      headers,
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      instance: { status: string; completedAt: number };
    };
    expect(body.instance.status).toBe("completed");
    expect(body.instance.completedAt).toBeGreaterThan(0);

    const arts = handle.db
      .select()
      .from(workPackageArtifacts)
      .where(eq(workPackageArtifacts.workPackageId, wpId))
      .all();
    expect(
      arts.some((a) => a.filePath === "docs/superpowers/plans/p.md"),
    ).toBe(true);
  });

  it("abandoned outcome", async () => {
    const s = handle.db
      .insert(sessions)
      .values({
        tmuxName: "ad-wp-abd",
        workspaceId,
        cli: "claude",
        args: "",
        status: "active",
        lastActivityAt: Date.now(),
        createdAt: Date.now(),
        adopted: 0,
      })
      .returning()
      .all();
    const start = await fetch(
      `${url}/sessions/${s[0].id}/work-packages`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          packageId: "planning",
          inputs: { topic: "T" },
        }),
      },
    );
    const wpId = (
      (await start.json()) as { instance: { id: number } }
    ).instance.id;
    const res = await fetch(`${url}/work-packages/${wpId}/complete`, {
      method: "POST",
      headers,
      body: JSON.stringify({ outcome: "abandoned" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { instance: { status: string } };
    expect(body.instance.status).toBe("abandoned");
  });

  it("이미 완료된 인스턴스는 409", async () => {
    const done = handle.db
      .select()
      .from(workPackages)
      .where(eq(workPackages.status, "completed"))
      .get();
    if (!done) throw new Error("no completed row");
    const res = await fetch(`${url}/work-packages/${done.id}/complete`, {
      method: "POST",
      headers,
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("already_completed");
  });
});

describe("POST /work-packages/:id/scan — 수동 디스커버리", () => {
  it("inject 없이 디스크 reconcile 만 호출 + 신규 파일 INSERT", async () => {
    const s = handle.db
      .insert(sessions)
      .values({
        tmuxName: "ad-wp-scan",
        workspaceId,
        cli: "claude",
        args: "",
        status: "active",
        lastActivityAt: Date.now(),
        createdAt: Date.now(),
        adopted: 0,
      })
      .returning()
      .all();
    const start = await fetch(
      `${url}/sessions/${s[0].id}/work-packages`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          packageId: "planning",
          inputs: { topic: "scan-test" },
        }),
      },
    );
    const wpId = ((await start.json()) as { instance: { id: number } })
      .instance.id;

    writeFileSync(
      join(fsRoot, "docs/superpowers/specs/scan-target.md"),
      "scan body",
    );

    injectFn.mockClear();
    const res = await fetch(`${url}/work-packages/${wpId}/scan`, {
      method: "POST",
      headers,
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      artifactsDelta: { inserted: number; updatedDrift: number };
    };
    expect(body.artifactsDelta.inserted).toBeGreaterThanOrEqual(1);
    expect(injectFn).not.toHaveBeenCalled();

    const arts = handle.db
      .select()
      .from(workPackageArtifacts)
      .where(eq(workPackageArtifacts.workPackageId, wpId))
      .all();
    expect(
      arts.some(
        (a) => a.filePath === "docs/superpowers/specs/scan-target.md",
      ),
    ).toBe(true);
  });

  it("completed 인스턴스는 409", async () => {
    const done = handle.db
      .select()
      .from(workPackages)
      .where(eq(workPackages.status, "completed"))
      .get();
    if (!done) throw new Error("expected completed row");
    const res = await fetch(`${url}/work-packages/${done.id}/scan`, {
      method: "POST",
      headers,
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(409);
  });
});

describe("list endpoints", () => {
  it("GET /sessions/:id/work-packages 가 인스턴스 배열을 반환", async () => {
    const res = await fetch(
      `${url}/sessions/${claudeSessionId}/work-packages`,
      { headers },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { instances: unknown[] };
    expect(Array.isArray(body.instances)).toBe(true);
  });

  it("GET /work-packages/:id/artifacts 가 artifact 배열을 반환", async () => {
    const wp = handle.db.select().from(workPackages).get();
    if (!wp) throw new Error("no wp");
    const res = await fetch(`${url}/work-packages/${wp.id}/artifacts`, {
      headers,
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { artifacts: unknown[] };
    expect(Array.isArray(body.artifacts)).toBe(true);
  });
});

describe("GET /sessions/:id/plans", () => {
  it("docs/superpowers/plans/ 의 .md 만 최신순으로 반환", async () => {
    writeFileSync(join(fsRoot, "docs/superpowers/plans/2026-01-01-a.md"), "a");
    writeFileSync(join(fsRoot, "docs/superpowers/plans/2026-02-02-b.md"), "b");
    writeFileSync(join(fsRoot, "docs/superpowers/specs/ignore-me.md"), "s");

    const res = await fetch(`${url}/sessions/${claudeSessionId}/plans`, {
      headers,
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { plans: string[] };
    expect(body.plans).toContain("docs/superpowers/plans/2026-01-01-a.md");
    expect(body.plans).toContain("docs/superpowers/plans/2026-02-02-b.md");
    expect(
      body.plans.every((p) => p.startsWith("docs/superpowers/plans/")),
    ).toBe(true);
    // 최신순 (역정렬)
    expect(
      body.plans.indexOf("docs/superpowers/plans/2026-02-02-b.md"),
    ).toBeLessThan(body.plans.indexOf("docs/superpowers/plans/2026-01-01-a.md"));
  });

  it("없는 세션 → 404", async () => {
    const res = await fetch(`${url}/sessions/999999/plans`, { headers });
    expect(res.status).toBe(404);
  });
});

describe("freeform 패키지 start", () => {
  it("skillName 이 비어 skill install 없이 prompt 를 그대로 주입한다", async () => {
    const s = handle.db
      .insert(sessions)
      .values({
        tmuxName: "ad-wp-free",
        workspaceId,
        cli: "claude",
        args: "",
        status: "active",
        lastActivityAt: Date.now(),
        createdAt: Date.now(),
        adopted: 0,
      })
      .returning()
      .all();
    injectFn.mockClear();
    ensureSkillFn.mockClear();
    const res = await fetch(`${url}/sessions/${s[0].id}/work-packages`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        packageId: "freeform",
        inputs: { prompt: "do the thing" },
      }),
    });
    expect(res.status).toBe(200);
    expect(ensureSkillFn).not.toHaveBeenCalled();
    const firstCall = injectFn.mock.calls[0][0] as { prompt: string };
    expect(firstCall.prompt).toBe("do the thing");

    // 생성한 인스턴스는 정리해 다른 테스트의 active 가정과 충돌하지 않게 한다
    const body = (await res.json()) as { instance: { id: number } };
    await fetch(`${url}/work-packages/${body.instance.id}/complete`, {
      method: "POST",
      headers,
      body: JSON.stringify({ outcome: "abandoned" }),
    });
  });
});
