import type { TmuxClient } from "./commands";

/**
 * tmux send-keys 기반 초기 prompt 주입.
 *
 * timing race 와 shell-wrap 인계 케이스를 다루기 위해:
 *   1) pane 내용이 stableMs 동안 변하지 않을 때까지 대기 (CLI 가 입력 받을 준비됨)
 *   2) pane_current_command 가 쉘이 아닌지 확인 (CLI 즉시 실패로 wrap shell 인계 케이스 차단)
 *   3) send-keys 로 prompt 발사
 */

export type InjectFailureReason =
  | "timeout"
  | "cli_exited_to_shell"
  | "tmux_error";

export interface InjectResult {
  injected: boolean;
  reason?: InjectFailureReason;
  detail?: string;
}

const DEFAULT_SHELL_DENYLIST = new Set([
  "bash",
  "sh",
  "zsh",
  "fish",
  "dash",
  "ksh",
]);

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export interface WaitForPaneStableOptions {
  tmux: Pick<TmuxClient, "capturePane">;
  name: string;
  stableMs?: number;
  timeoutMs?: number;
  pollIntervalMs?: number;
  now?: () => number;
  sleepFn?: (ms: number) => Promise<void>;
}

export async function waitForPaneStable(
  opts: WaitForPaneStableOptions,
): Promise<boolean> {
  const stableMs = opts.stableMs ?? 300;
  const timeoutMs = opts.timeoutMs ?? 5000;
  const pollIntervalMs = opts.pollIntervalMs ?? 100;
  const now = opts.now ?? (() => Date.now());
  const wait = opts.sleepFn ?? sleep;

  const start = now();
  let lastContent: string | null = null;
  let stableSince = 0;

  while (now() - start < timeoutMs) {
    let content: string;
    try {
      content = await opts.tmux.capturePane(opts.name);
    } catch {
      return false;
    }
    if (content === lastContent) {
      if (stableSince === 0) stableSince = now();
      if (now() - stableSince >= stableMs) return true;
    } else {
      lastContent = content;
      stableSince = 0;
    }
    await wait(pollIntervalMs);
  }
  return false;
}

export interface InjectPromptOptions {
  tmux: Pick<
    TmuxClient,
    "capturePane" | "paneCurrentCommand" | "paneChildren" | "sendKeys"
  >;
  name: string;
  prompt: string;
  /** Override the default `(bash|sh|zsh|fish|dash|ksh)` shell denylist. */
  shellDenylist?: ReadonlySet<string>;
  /** Skip the stability wait. Use when caller knows CLI is well-past boot. */
  skipStabilityWait?: boolean;
  waitOptions?: Omit<WaitForPaneStableOptions, "tmux" | "name">;
}

export async function injectPrompt(
  opts: InjectPromptOptions,
): Promise<InjectResult> {
  if (!opts.skipStabilityWait) {
    const stable = await waitForPaneStable({
      tmux: opts.tmux,
      name: opts.name,
      ...opts.waitOptions,
    });
    if (!stable) return { injected: false, reason: "timeout" };
  }

  const denylist = opts.shellDenylist ?? DEFAULT_SHELL_DENYLIST;
  let current: string | null;
  try {
    current = await opts.tmux.paneCurrentCommand(opts.name);
  } catch (err) {
    return {
      injected: false,
      reason: "tmux_error",
      detail: (err as Error).message,
    };
  }
  // Wrap shell (`bash -c "env … cli; …; exec bash"`) 아래에서는 pane_current_command
  // 가 wrap 쉘로 보고된다. 그 경우 자식 프로세스를 봐서 non-shell CLI 가 살아 있는지
  // 한 번 더 검증한다. 자식 중 non-shell 이 있으면 inject 허용.
  if (current && denylist.has(current.toLowerCase())) {
    let children: string[] = [];
    try {
      children = await opts.tmux.paneChildren(opts.name);
    } catch {
      // 자식 조회 실패는 안전 측면에서 "shell only" 로 간주
    }
    const cliAlive = children.some((c) => !denylist.has(c.toLowerCase()));
    if (!cliAlive) {
      return {
        injected: false,
        reason: "cli_exited_to_shell",
        detail: children.length
          ? `${current} (children: ${children.join(", ")})`
          : current,
      };
    }
  }

  try {
    await opts.tmux.sendKeys(opts.name, opts.prompt, true);
    return { injected: true };
  } catch (err) {
    return {
      injected: false,
      reason: "tmux_error",
      detail: (err as Error).message,
    };
  }
}
