import { describe, expect, it, vi } from "vitest";
import { injectPrompt, waitForPaneStable } from "../src/tmux/inject";
import type { TmuxClient } from "../src/tmux/commands";

type CaptureClient = Pick<TmuxClient, "capturePane">;
type FullClient = Pick<
  TmuxClient,
  "capturePane" | "paneCurrentCommand" | "paneChildren" | "sendKeys"
>;

function fakeClock() {
  let t = 0;
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms;
    },
  };
}

describe("waitForPaneStable", () => {
  it("내용이 stableMs 동안 변하지 않으면 true 를 반환한다", async () => {
    const clock = fakeClock();
    const seq = ["hi", "hi welcome", "hi welcome", "hi welcome", "hi welcome"];
    let i = 0;
    const tmux: CaptureClient = {
      capturePane: vi.fn(async () => {
        const v = seq[Math.min(i, seq.length - 1)];
        i += 1;
        return v;
      }),
    };
    const result = await waitForPaneStable({
      tmux,
      name: "x",
      stableMs: 300,
      timeoutMs: 5000,
      pollIntervalMs: 100,
      now: clock.now,
      sleepFn: async (ms) => clock.advance(ms),
    });
    expect(result).toBe(true);
  });

  it("내용이 계속 변하면 timeout 시 false 를 반환한다", async () => {
    const clock = fakeClock();
    let counter = 0;
    const tmux: CaptureClient = {
      capturePane: vi.fn(async () => `frame-${counter++}`),
    };
    const result = await waitForPaneStable({
      tmux,
      name: "x",
      stableMs: 300,
      timeoutMs: 500,
      pollIntervalMs: 100,
      now: clock.now,
      sleepFn: async (ms) => clock.advance(ms),
    });
    expect(result).toBe(false);
  });

  it("capturePane 실패 시 false 로 종료", async () => {
    const clock = fakeClock();
    const tmux: CaptureClient = {
      capturePane: vi.fn(async () => {
        throw new Error("tmux gone");
      }),
    };
    const result = await waitForPaneStable({
      tmux,
      name: "x",
      now: clock.now,
      sleepFn: async (ms) => clock.advance(ms),
    });
    expect(result).toBe(false);
  });
});

describe("injectPrompt", () => {
  function buildTmux(opts: {
    paneContents: string[];
    currentCommand: string | null;
    paneChildren?: string[];
  }): { tmux: FullClient; calls: { sendKeys: unknown[][] } } {
    let i = 0;
    const calls = { sendKeys: [] as unknown[][] };
    const tmux: FullClient = {
      capturePane: vi.fn(async () => {
        const v = opts.paneContents[Math.min(i, opts.paneContents.length - 1)];
        i += 1;
        return v;
      }),
      paneCurrentCommand: vi.fn(async () => opts.currentCommand),
      paneChildren: vi.fn(async () => opts.paneChildren ?? []),
      sendKeys: vi.fn(async (...args) => {
        calls.sendKeys.push(args);
      }),
    };
    return { tmux, calls };
  }

  it("stable + CLI 가 쉘이 아니면 send-keys 발사", async () => {
    const clock = fakeClock();
    const { tmux, calls } = buildTmux({
      paneContents: Array(20).fill("stable"),
      currentCommand: "claude",
    });
    const result = await injectPrompt({
      tmux,
      name: "x",
      prompt: "/brainstorming Topic: foo",
      waitOptions: {
        stableMs: 200,
        pollIntervalMs: 100,
        now: clock.now,
        sleepFn: async (ms) => clock.advance(ms),
      },
    });
    expect(result.injected).toBe(true);
    expect(calls.sendKeys).toEqual([
      ["x", "/brainstorming Topic: foo", true],
    ]);
  });

  it("pane_current_command 가 bash 이고 자식도 모두 쉘이면 주입을 거부한다", async () => {
    const clock = fakeClock();
    const { tmux, calls } = buildTmux({
      paneContents: Array(20).fill("stable"),
      currentCommand: "bash",
      paneChildren: [],
    });
    const result = await injectPrompt({
      tmux,
      name: "x",
      prompt: "/brainstorming foo",
      waitOptions: {
        stableMs: 200,
        pollIntervalMs: 100,
        now: clock.now,
        sleepFn: async (ms) => clock.advance(ms),
      },
    });
    expect(result.injected).toBe(false);
    expect(result.reason).toBe("cli_exited_to_shell");
    expect(calls.sendKeys).toEqual([]);
  });

  it("pane_current_command 가 bash 라도 자식에 non-shell CLI 가 있으면 wrap 아래 살아있다고 보고 발사한다", async () => {
    const clock = fakeClock();
    const { tmux, calls } = buildTmux({
      paneContents: Array(20).fill("stable"),
      currentCommand: "bash",
      paneChildren: ["claude"],
    });
    const result = await injectPrompt({
      tmux,
      name: "x",
      prompt: "/brainstorming foo",
      waitOptions: {
        stableMs: 200,
        pollIntervalMs: 100,
        now: clock.now,
        sleepFn: async (ms) => clock.advance(ms),
      },
    });
    expect(result.injected).toBe(true);
    expect(calls.sendKeys).toEqual([["x", "/brainstorming foo", true]]);
  });

  it("타임아웃 시 timeout reason 으로 실패한다", async () => {
    const clock = fakeClock();
    let counter = 0;
    const tmux: FullClient = {
      capturePane: vi.fn(async () => `f-${counter++}`),
      paneCurrentCommand: vi.fn(async () => "claude"),
      sendKeys: vi.fn(async () => {}),
    };
    const result = await injectPrompt({
      tmux,
      name: "x",
      prompt: "x",
      waitOptions: {
        stableMs: 200,
        timeoutMs: 300,
        pollIntervalMs: 100,
        now: clock.now,
        sleepFn: async (ms) => clock.advance(ms),
      },
    });
    expect(result.injected).toBe(false);
    expect(result.reason).toBe("timeout");
    expect(tmux.sendKeys).not.toHaveBeenCalled();
  });

  it("skipStabilityWait 면 capturePane 호출 없이 바로 검사·발사", async () => {
    const { tmux, calls } = buildTmux({
      paneContents: ["x"],
      currentCommand: "node",
    });
    const result = await injectPrompt({
      tmux,
      name: "x",
      prompt: "ping",
      skipStabilityWait: true,
    });
    expect(result.injected).toBe(true);
    expect(tmux.capturePane).not.toHaveBeenCalled();
    expect(calls.sendKeys).toEqual([["x", "ping", true]]);
  });

  it("sendKeys 가 에러를 던지면 tmux_error 로 잡힌다", async () => {
    const clock = fakeClock();
    const tmux: FullClient = {
      capturePane: vi.fn(async () => "stable"),
      paneCurrentCommand: vi.fn(async () => "claude"),
      sendKeys: vi.fn(async () => {
        throw new Error("session gone");
      }),
    };
    const result = await injectPrompt({
      tmux,
      name: "x",
      prompt: "y",
      waitOptions: {
        stableMs: 100,
        pollIntervalMs: 100,
        now: clock.now,
        sleepFn: async (ms) => clock.advance(ms),
      },
    });
    expect(result.injected).toBe(false);
    expect(result.reason).toBe("tmux_error");
    expect(result.detail).toContain("session gone");
  });
});
