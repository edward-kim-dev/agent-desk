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
    ensureAllSkillsFn: async () => ({ results: [] }),
    installSkillsOnStartup: false,
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
