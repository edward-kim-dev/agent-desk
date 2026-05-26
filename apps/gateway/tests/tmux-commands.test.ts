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

  it("cwd와 command를 지정해 detached 세션을 생성하고, CLI 종료 후에도 셸이 살아남도록 래핑한다", async () => {
    const calls: { cmd: string; args: string[] }[] = [];
    const exec: ExecLike = vi.fn(async (cmd: string, args: string[]) => {
      calls.push({ cmd, args });
      return { stdout: "", stderr: "" };
    }) as unknown as ExecLike;
    const client = createTmuxClient({ exec });
    await client.newSession({
      name: "ad-owngo-aaa111",
      cwd: "/workspaces/owngo",
      command: "claude",
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].cmd).toBe("tmux");
    expect(calls[0].args.slice(0, 6)).toEqual([
      "new-session",
      "-d",
      "-s",
      "ad-owngo-aaa111",
      "-c",
      "/workspaces/owngo",
    ]);
    const wrapped = calls[0].args[6];
    // debug env vars must be unset
    expect(wrapped).toMatch(/^env -u NODE_OPTIONS -u NODE_INSPECT_PUBLISH_UID -u VSCODE_INSPECTOR_OPTIONS claude;/);
    // exit guard keeps the session alive
    expect(wrapped).toContain("ec=$?");
    expect(wrapped).toContain("CLI exited");
    expect(wrapped).toContain("exec ");
    expect(wrapped).toContain("${SHELL:-/bin/bash}");
  });

  it("이름으로 세션을 종료한다", async () => {
    const exec = mockExec({
      "tmux kill-session -t ad-foo": { stdout: "" },
    });
    const client = createTmuxClient({ exec });
    await client.killSession("ad-foo");
  });
});
