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

function defaultVendorHarnessSkillDir(): string {
  const env = process.env.AGENT_DESK_HARNESS_SKILL_DIR;
  if (env) return env;
  const here = fileURLToPath(import.meta.url);
  const gatewayDir = path.resolve(path.dirname(here), "..", "..");
  const agentDeskRoot = path.resolve(gatewayDir, "..", "..");
  return path.join(agentDeskRoot, "vendor", "harness", "skills", "harness");
}

export interface EnsureHarnessOptions {
  workspacePath: string;
  /** Absolute path to vendor/harness/skills/harness (the skill directory itself). */
  vendorHarnessSkillDir?: string;
}

/**
 * Harness 단일 스킬을 워크스페이스의 .claude/skills/harness 로 symlink.
 * 일반 ensureSkillInstalled 와 동일한 상태 머신을 사용하지만 vendor 디렉토리
 * 모양이 다르다 (vendor/harness/skills/harness 가 곧 스킬 디렉토리).
 */
export async function ensureHarnessInstalled(
  opts: EnsureHarnessOptions,
): Promise<EnsureSkillResult> {
  const skillDir = opts.vendorHarnessSkillDir ?? defaultVendorHarnessSkillDir();
  // ensureSkillInstalled 는 vendorSkillsDir/<name> 형태로 결합하므로,
  // skillDir 의 부모를 vendorSkillsDir 로 넘기고 name 은 "harness".
  const parentDir = path.dirname(skillDir);
  const skillName = path.basename(skillDir);
  return ensureSkillInstalled({
    workspacePath: opts.workspacePath,
    skillName,
    vendorSkillsDir: parentDir,
  });
}

export type RemoveStatus = "removed" | "not_present" | "exists_external" | "error";

export interface EnsureHarnessRemovedResult {
  status: RemoveStatus;
  linkPath: string;
  sourcePath: string;
  detail?: string;
}

/**
 * 우리 vendor 를 가리키는 .claude/skills/harness symlink 면 제거.
 * 외부 symlink·사용자 디렉토리는 건드리지 않는다 (install 의 미러).
 */
export async function ensureHarnessRemoved(
  opts: EnsureHarnessOptions,
): Promise<EnsureHarnessRemovedResult> {
  const skillDir = opts.vendorHarnessSkillDir ?? defaultVendorHarnessSkillDir();
  const linkParent = path.join(opts.workspacePath, ".claude", "skills");
  const linkPath = path.join(linkParent, path.basename(skillDir));

  let stat;
  try {
    stat = await fs.lstat(linkPath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return { status: "not_present", linkPath, sourcePath: skillDir };
    }
    return {
      status: "error",
      linkPath,
      sourcePath: skillDir,
      detail: (err as Error).message,
    };
  }

  if (!stat.isSymbolicLink()) {
    return {
      status: "exists_external",
      linkPath,
      sourcePath: skillDir,
      detail: "non-symlink (user owned)",
    };
  }

  const target = await fs.readlink(linkPath);
  const resolved = path.resolve(linkParent, target);
  if (resolved !== skillDir) {
    return {
      status: "exists_external",
      linkPath,
      sourcePath: skillDir,
      detail: `symlink → ${target}`,
    };
  }

  try {
    await fs.unlink(linkPath);
    return { status: "removed", linkPath, sourcePath: skillDir };
  } catch (err) {
    return {
      status: "error",
      linkPath,
      sourcePath: skillDir,
      detail: (err as Error).message,
    };
  }
}

// ---------------------------------------------------------------------------
// Progress hook install/remove
// ---------------------------------------------------------------------------

const HOOK_SCRIPT_SRC = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../hooks/wp-progress.js",
);

type HookEntry = { matcher?: string; hooks?: { type?: string; command?: string }[] };

function isWpHookEntry(h: HookEntry): boolean {
  return h.hooks?.some((hh) => hh.command?.includes("wp-progress.js")) ?? false;
}

/**
 * Copy wp-progress.js into <workspacePath>/.claude/hooks/ and register it in
 * <workspacePath>/.claude/settings.json (PostToolUse + Stop). Idempotent.
 */
export async function ensureProgressHookInstalled(workspacePath: string): Promise<void> {
  // 1. Ensure hooks dir exists and copy script
  const hooksDir = path.join(workspacePath, ".claude", "hooks");
  await fs.mkdir(hooksDir, { recursive: true });
  await fs.copyFile(HOOK_SCRIPT_SRC, path.join(hooksDir, "wp-progress.js"));

  // 2. Read settings.json (default {} if missing)
  const settingsPath = path.join(workspacePath, ".claude", "settings.json");
  let settings: Record<string, unknown> = {};
  try {
    const raw = await fs.readFile(settingsPath, "utf8");
    try {
      settings = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      // Malformed JSON — treat as empty (don't corrupt further)
      settings = {};
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }

  if (typeof settings.hooks !== "object" || settings.hooks === null) {
    settings.hooks = {};
  }
  const hooks = settings.hooks as Record<string, HookEntry[]>;

  // 3. Register in PostToolUse (idempotent)
  if (!Array.isArray(hooks.PostToolUse)) hooks.PostToolUse = [];
  if (!hooks.PostToolUse.some(isWpHookEntry)) {
    hooks.PostToolUse.push({
      matcher: "Write|Edit",
      hooks: [{ type: "command", command: "node .claude/hooks/wp-progress.js" }],
    });
  }

  // 4. Register in Stop (idempotent)
  if (!Array.isArray(hooks.Stop)) hooks.Stop = [];
  if (!hooks.Stop.some(isWpHookEntry)) {
    hooks.Stop.push({
      hooks: [{ type: "command", command: "node .claude/hooks/wp-progress.js" }],
    });
  }

  // 5. Write back
  await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2));
}

/**
 * Remove wp-progress.js from <workspacePath>/.claude/hooks/ and unregister it
 * from settings.json. Safe to call when already absent.
 */
export async function ensureProgressHookRemoved(workspacePath: string): Promise<void> {
  // 1. Delete hook script (no-op if missing)
  const hookFilePath = path.join(workspacePath, ".claude", "hooks", "wp-progress.js");
  await fs.rm(hookFilePath, { force: true });

  // 2. Read settings.json — return silently if missing
  const settingsPath = path.join(workspacePath, ".claude", "settings.json");
  let settings: Record<string, unknown>;
  try {
    const raw = await fs.readFile(settingsPath, "utf8");
    settings = JSON.parse(raw) as Record<string, unknown>;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
    throw err;
  }

  if (typeof settings.hooks !== "object" || settings.hooks === null) return;
  const hooks = settings.hooks as Record<string, HookEntry[]>;

  // 3. Filter out wp-progress entries
  if (Array.isArray(hooks.PostToolUse)) {
    hooks.PostToolUse = hooks.PostToolUse.filter((h) => !isWpHookEntry(h));
  }
  if (Array.isArray(hooks.Stop)) {
    hooks.Stop = hooks.Stop.filter((h) => !isWpHookEntry(h));
  }

  // 4. Write back
  await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2));
}
