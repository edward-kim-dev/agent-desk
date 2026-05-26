import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Just-in-time skill 설치 — 워크스페이스의 `.claude/skills/<name>` 을 vendored
 * 스킬 디렉토리(`vendor/superpowers/skills/<name>`)로 symlink 한다.
 *
 * 동작:
 * - 이미 symlink/디렉토리/파일이 있고 올바른 곳을 가리키면 no-op
 * - 다른 곳을 가리키는 symlink 면 그대로 둠 (사용자 커스터마이즈 존중)
 * - 일반 파일/디렉토리(사용자 직접 작성)면 그대로 둠
 * - 없으면 symlink 생성
 */

export type InstallStatus =
  | "installed"
  | "already_linked"
  | "exists_external"
  | "missing_source"
  | "error";

export interface EnsureSkillResult {
  status: InstallStatus;
  linkPath: string;
  sourcePath: string;
  detail?: string;
}

export interface EnsureSkillOptions {
  /** Absolute workspace path (used as the base for `.claude/skills/<name>`). */
  workspacePath: string;
  /** Skill name (e.g. `brainstorming`). */
  skillName: string;
  /**
   * Absolute path to the directory that holds *all* vendored skill folders.
   * Defaults to `<repo>/vendor/superpowers/skills` resolved relative to this module.
   */
  vendorSkillsDir?: string;
}

function defaultVendorSkillsDir(): string {
  const env = process.env.AGENT_DESK_SKILLS_VENDOR_DIR;
  if (env) return env;
  // <gateway>/dist/skills/install.js → <gateway>/dist/skills → <gateway> → <agent-desk>
  // <gateway>/src/skills/install.ts → analogous (vitest 가 ts 그대로 실행)
  const here = fileURLToPath(import.meta.url);
  const gatewayDir = path.resolve(path.dirname(here), "..", "..");
  // <gateway>/.. → apps, <apps>/.. → agent-desk
  const agentDeskRoot = path.resolve(gatewayDir, "..", "..");
  return path.join(agentDeskRoot, "vendor", "superpowers", "skills");
}

export async function ensureSkillInstalled(
  opts: EnsureSkillOptions,
): Promise<EnsureSkillResult> {
  const vendorDir = opts.vendorSkillsDir ?? defaultVendorSkillsDir();
  const sourcePath = path.join(vendorDir, opts.skillName);
  const linkParent = path.join(opts.workspacePath, ".claude", "skills");
  const linkPath = path.join(linkParent, opts.skillName);

  try {
    await fs.access(sourcePath);
  } catch {
    return {
      status: "missing_source",
      linkPath,
      sourcePath,
      detail: `vendor source not found: ${sourcePath}`,
    };
  }

  let existing: { kind: "symlink" | "file" | "dir"; target?: string } | null;
  try {
    const stat = await fs.lstat(linkPath);
    if (stat.isSymbolicLink()) {
      const target = await fs.readlink(linkPath);
      existing = { kind: "symlink", target };
    } else if (stat.isDirectory()) {
      existing = { kind: "dir" };
    } else {
      existing = { kind: "file" };
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") existing = null;
    else throw err;
  }

  if (existing) {
    if (existing.kind === "symlink") {
      // symlink 가 우리 vendor source 를 가리키는지 확인 (절대/상대 모두 허용)
      const resolved = path.resolve(linkParent, existing.target ?? "");
      if (resolved === sourcePath) {
        return { status: "already_linked", linkPath, sourcePath };
      }
      return {
        status: "exists_external",
        linkPath,
        sourcePath,
        detail: `symlink → ${existing.target}`,
      };
    }
    return {
      status: "exists_external",
      linkPath,
      sourcePath,
      detail: `${existing.kind} owned by user`,
    };
  }

  try {
    await fs.mkdir(linkParent, { recursive: true });
    await fs.symlink(sourcePath, linkPath, "dir");
    return { status: "installed", linkPath, sourcePath };
  } catch (err) {
    return {
      status: "error",
      linkPath,
      sourcePath,
      detail: (err as Error).message,
    };
  }
}

export interface EnsureAllSkillsResult {
  results: Array<EnsureSkillResult & { skillName: string }>;
}

/**
 * vendor 디렉토리에 존재하는 모든 스킬을 워크스페이스에 symlink. 워크스페이스
 * 생성 시점 및 게이트웨이 기동 시점에 한꺼번에 호출한다.
 */
export async function ensureAllSkillsInstalled(opts: {
  workspacePath: string;
  vendorSkillsDir?: string;
}): Promise<EnsureAllSkillsResult> {
  const vendorDir = opts.vendorSkillsDir ?? defaultVendorSkillsDir();
  let entries: string[];
  try {
    entries = await fs.readdir(vendorDir);
  } catch {
    return { results: [] };
  }
  const dirs: string[] = [];
  for (const name of entries) {
    if (name.startsWith(".")) continue;
    try {
      const stat = await fs.stat(path.join(vendorDir, name));
      if (stat.isDirectory()) dirs.push(name);
    } catch {
      // skip unreadable entries
    }
  }
  const results = await Promise.all(
    dirs.map(async (skillName) => {
      const r = await ensureSkillInstalled({
        workspacePath: opts.workspacePath,
        skillName,
        vendorSkillsDir: vendorDir,
      });
      return { ...r, skillName };
    }),
  );
  return { results };
}
