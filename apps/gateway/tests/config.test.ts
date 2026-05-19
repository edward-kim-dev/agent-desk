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
