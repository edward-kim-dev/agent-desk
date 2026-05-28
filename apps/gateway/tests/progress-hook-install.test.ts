import { mkdtempSync, rmSync, existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, afterEach } from "vitest";
import {
  ensureProgressHookInstalled,
  ensureProgressHookRemoved,
} from "../src/skills/install";

let tmp: string;

afterEach(() => {
  if (tmp) rmSync(tmp, { recursive: true, force: true });
});

describe("ensureProgressHookInstalled", () => {
  it("wp-progress.js를 .claude/hooks/에 복사하고 settings.json에 훅 등록", async () => {
    tmp = mkdtempSync(join(tmpdir(), "ad-hook-install-"));
    await ensureProgressHookInstalled(tmp);

    const hookPath = join(tmp, ".claude", "hooks", "wp-progress.js");
    expect(existsSync(hookPath)).toBe(true);

    const settings = JSON.parse(
      readFileSync(join(tmp, ".claude", "settings.json"), "utf8"),
    );
    const postHooks = settings.hooks?.PostToolUse ?? [];
    expect(
      postHooks.some((h: { hooks: { command: string }[] }) =>
        h.hooks?.some((hh) => hh.command?.includes("wp-progress.js")),
      ),
    ).toBe(true);
    const stopHooks = settings.hooks?.Stop ?? [];
    expect(
      stopHooks.some((h: { hooks: { command: string }[] }) =>
        h.hooks?.some((hh) => hh.command?.includes("wp-progress.js")),
      ),
    ).toBe(true);
  });

  it("idempotent — 두 번 호출해도 중복 항목 없음", async () => {
    tmp = mkdtempSync(join(tmpdir(), "ad-hook-install-"));
    await ensureProgressHookInstalled(tmp);
    await ensureProgressHookInstalled(tmp);

    const settings = JSON.parse(
      readFileSync(join(tmp, ".claude", "settings.json"), "utf8"),
    );
    const postHooks = settings.hooks?.PostToolUse ?? [];
    const wpEntries = postHooks.filter((h: { hooks: { command: string }[] }) =>
      h.hooks?.some((hh) => hh.command?.includes("wp-progress.js")),
    );
    expect(wpEntries).toHaveLength(1);
  });

  it("기존 settings.json에 다른 훅이 있으면 보존", async () => {
    tmp = mkdtempSync(join(tmpdir(), "ad-hook-install-"));
    mkdirSync(join(tmp, ".claude"), { recursive: true });
    writeFileSync(
      join(tmp, ".claude", "settings.json"),
      JSON.stringify({
        hooks: {
          PostToolUse: [
            { matcher: "Bash", hooks: [{ type: "command", command: "other.sh" }] },
          ],
        },
      }),
    );
    await ensureProgressHookInstalled(tmp);

    const settings = JSON.parse(readFileSync(join(tmp, ".claude", "settings.json"), "utf8"));
    const postHooks = settings.hooks?.PostToolUse ?? [];
    expect(postHooks).toHaveLength(2);
    expect(postHooks.some((h: { matcher: string }) => h.matcher === "Bash")).toBe(true);
  });
});

describe("ensureProgressHookRemoved", () => {
  it("wp-progress.js 삭제 + settings.json에서 항목 제거", async () => {
    tmp = mkdtempSync(join(tmpdir(), "ad-hook-install-"));
    await ensureProgressHookInstalled(tmp);
    await ensureProgressHookRemoved(tmp);

    expect(existsSync(join(tmp, ".claude", "hooks", "wp-progress.js"))).toBe(false);

    const settings = JSON.parse(
      readFileSync(join(tmp, ".claude", "settings.json"), "utf8"),
    );
    const postHooks = settings.hooks?.PostToolUse ?? [];
    expect(
      postHooks.some((h: { hooks: { command: string }[] }) =>
        h.hooks?.some((hh) => hh.command?.includes("wp-progress.js")),
      ),
    ).toBe(false);

    const stopHooks = settings.hooks?.Stop ?? [];
    expect(
      stopHooks.some((h: { hooks: { command: string }[] }) =>
        h.hooks?.some((hh) => hh.command?.includes("wp-progress.js")),
      ),
    ).toBe(false);
  });

  it("이미 없어도 에러 없음", async () => {
    tmp = mkdtempSync(join(tmpdir(), "ad-hook-install-"));
    await expect(ensureProgressHookRemoved(tmp)).resolves.not.toThrow();
  });

  it("워크스페이스 경로 자체가 없어도 에러 없음", async () => {
    const nonExistent = join(tmpdir(), "does-not-exist-" + Date.now());
    await expect(ensureProgressHookRemoved(nonExistent)).resolves.not.toThrow();
  });
});
