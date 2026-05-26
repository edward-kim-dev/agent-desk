import { promises as fs } from "node:fs";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ensureAllSkillsInstalled,
  ensureSkillInstalled,
} from "../src/skills/install";

let root: string;
let vendorSkillsDir: string;
let workspacePath: string;

beforeEach(async () => {
  root = mkdtempSync(path.join(tmpdir(), "ad-skills-"));
  vendorSkillsDir = path.join(root, "vendor", "skills");
  workspacePath = path.join(root, "workspace");
  await fs.mkdir(vendorSkillsDir, { recursive: true });
  await fs.mkdir(workspacePath, { recursive: true });
  // vendor 에 가짜 brainstorming 스킬 디렉토리 + SKILL.md
  await fs.mkdir(path.join(vendorSkillsDir, "brainstorming"), {
    recursive: true,
  });
  await fs.writeFile(
    path.join(vendorSkillsDir, "brainstorming", "SKILL.md"),
    "---\nname: brainstorming\n---\nhi\n",
  );
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("ensureSkillInstalled", () => {
  it("symlink 이 없으면 새로 만들고 'installed' 반환", async () => {
    const r = await ensureSkillInstalled({
      workspacePath,
      skillName: "brainstorming",
      vendorSkillsDir,
    });
    expect(r.status).toBe("installed");

    const linkPath = path.join(workspacePath, ".claude", "skills", "brainstorming");
    const stat = await fs.lstat(linkPath);
    expect(stat.isSymbolicLink()).toBe(true);
    const target = await fs.readlink(linkPath);
    expect(path.resolve(path.dirname(linkPath), target)).toBe(
      path.join(vendorSkillsDir, "brainstorming"),
    );
    // symlink 너머의 SKILL.md 도 읽힌다
    const content = await fs.readFile(path.join(linkPath, "SKILL.md"), "utf8");
    expect(content).toContain("name: brainstorming");
  });

  it("이미 우리 vendor 를 가리키는 symlink 가 있으면 'already_linked'", async () => {
    await fs.mkdir(path.join(workspacePath, ".claude", "skills"), {
      recursive: true,
    });
    await fs.symlink(
      path.join(vendorSkillsDir, "brainstorming"),
      path.join(workspacePath, ".claude", "skills", "brainstorming"),
      "dir",
    );
    const r = await ensureSkillInstalled({
      workspacePath,
      skillName: "brainstorming",
      vendorSkillsDir,
    });
    expect(r.status).toBe("already_linked");
  });

  it("외부 경로를 가리키는 symlink 는 'exists_external' (사용자 커스텀 존중)", async () => {
    await fs.mkdir(path.join(workspacePath, ".claude", "skills"), {
      recursive: true,
    });
    const externalSource = path.join(root, "external", "brainstorming");
    await fs.mkdir(externalSource, { recursive: true });
    await fs.symlink(
      externalSource,
      path.join(workspacePath, ".claude", "skills", "brainstorming"),
      "dir",
    );
    const r = await ensureSkillInstalled({
      workspacePath,
      skillName: "brainstorming",
      vendorSkillsDir,
    });
    expect(r.status).toBe("exists_external");
  });

  it("사용자가 직접 디렉토리를 만들어두면 그대로 둠 ('exists_external')", async () => {
    const userDir = path.join(workspacePath, ".claude", "skills", "brainstorming");
    await fs.mkdir(userDir, { recursive: true });
    await fs.writeFile(path.join(userDir, "SKILL.md"), "user-defined");
    const r = await ensureSkillInstalled({
      workspacePath,
      skillName: "brainstorming",
      vendorSkillsDir,
    });
    expect(r.status).toBe("exists_external");
    // 사용자 파일은 그대로
    const content = await fs.readFile(path.join(userDir, "SKILL.md"), "utf8");
    expect(content).toBe("user-defined");
  });

  it("vendor 에 스킬이 없으면 'missing_source'", async () => {
    const r = await ensureSkillInstalled({
      workspacePath,
      skillName: "nonexistent-skill",
      vendorSkillsDir,
    });
    expect(r.status).toBe("missing_source");
  });
});

describe("ensureAllSkillsInstalled", () => {
  it("vendor 내 모든 디렉토리 스킬을 한꺼번에 symlink 한다", async () => {
    // 추가 스킬 fixture 두 개 더 만들어 둠
    for (const name of ["foo-skill", "bar-skill"]) {
      await fs.mkdir(path.join(vendorSkillsDir, name), { recursive: true });
      await fs.writeFile(
        path.join(vendorSkillsDir, name, "SKILL.md"),
        `---\nname: ${name}\n---\n`,
      );
    }
    // 숨김 디렉토리와 파일은 무시되어야 한다
    await fs.mkdir(path.join(vendorSkillsDir, ".hidden"), { recursive: true });
    await fs.writeFile(path.join(vendorSkillsDir, "README.md"), "ignore me");

    const r = await ensureAllSkillsInstalled({
      workspacePath,
      vendorSkillsDir,
    });
    const names = r.results.map((x) => x.skillName).sort();
    expect(names).toEqual(["bar-skill", "brainstorming", "foo-skill"]);
    for (const item of r.results) {
      expect(item.status).toBe("installed");
      const stat = await fs.lstat(
        path.join(workspacePath, ".claude", "skills", item.skillName),
      );
      expect(stat.isSymbolicLink()).toBe(true);
    }
  });

  it("vendor 디렉토리가 없으면 빈 결과를 반환한다", async () => {
    const r = await ensureAllSkillsInstalled({
      workspacePath,
      vendorSkillsDir: path.join(root, "no-such-dir"),
    });
    expect(r.results).toEqual([]);
  });
});
