import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileP = promisify(execFile);

const DEBUG_ENV_KEYS = [
  "NODE_OPTIONS",
  "NODE_INSPECT_PUBLISH_UID",
  "VSCODE_INSPECTOR_OPTIONS",
];

export function envWithoutDebug(
  source: NodeJS.ProcessEnv = process.env
): NodeJS.ProcessEnv {
  const clean: NodeJS.ProcessEnv = { ...source };
  for (const k of DEBUG_ENV_KEYS) delete clean[k];
  return clean;
}

function shellQuoteValue(v: string): string {
  if (/^[A-Za-z0-9_.\/=:+-]+$/.test(v)) return v;
  return `'${v.replace(/'/g, `'\\''`)}'`;
}

function envPrefix(env: Record<string, string> | undefined): string {
  if (!env) return "";
  const pairs: string[] = [];
  for (const [k, v] of Object.entries(env)) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(k)) {
      throw new Error(`invalid env key: ${k}`);
    }
    pairs.push(`${k}=${shellQuoteValue(v)}`);
  }
  return pairs.length ? pairs.join(" ") + " " : "";
}

export interface ExecLike {
  (cmd: string, args: string[]): Promise<{ stdout: string; stderr: string }>;
}

export interface TmuxSessionInfo {
  name: string;
  createdAt: number;
  attachedClients: number;
  paneCurrentCommand: string;
}

export interface NewSessionInput {
  name: string;
  cwd: string;
  command: string;
  /** Extra env vars to prepend to the wrapped command (KEY=VAL form). */
  env?: Record<string, string>;
}

export interface TmuxClient {
  listSessions(): Promise<TmuxSessionInfo[]>;
  newSession(input: NewSessionInput): Promise<void>;
  killSession(name: string): Promise<void>;
  hasSession(name: string): Promise<boolean>;
  sendKeys(name: string, text: string, withEnter: boolean): Promise<void>;
  capturePane(name: string): Promise<string>;
  paneCurrentCommand(name: string): Promise<string | null>;
  /** Immediate children (comm names) of the pane's leading process. */
  paneChildren(name: string): Promise<string[]>;
}

const LIST_FORMAT =
  "#{session_name}|#{session_created}|#{session_attached}|#{pane_current_command}";

function isNoServer(err: unknown): boolean {
  const msg =
    (err as { stderr?: string; message?: string }).stderr ??
    (err as Error).message ??
    "";
  return /no server running/.test(msg);
}

export function createTmuxClient(opts: { exec?: ExecLike } = {}): TmuxClient {
  const exec: ExecLike =
    opts.exec ??
    ((cmd, args) =>
      execFileP(cmd, args, { encoding: "utf8", env: envWithoutDebug() }));

  async function listSessions(): Promise<TmuxSessionInfo[]> {
    try {
      const { stdout } = await exec("tmux", ["list-sessions", "-F", LIST_FORMAT]);
      return stdout
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .map((line) => {
          const [name, createdAt, attached, paneCurrentCommand] =
            line.split("|");
          return {
            name,
            createdAt: Number(createdAt),
            attachedClients: Number(attached),
            paneCurrentCommand,
          };
        });
    } catch (err) {
      if (isNoServer(err)) return [];
      throw err;
    }
  }

  async function newSession(input: NewSessionInput): Promise<void> {
    const unsetPrefix = DEBUG_ENV_KEYS.map((k) => `-u ${k}`).join(" ");
    // Keep the tmux session alive after the CLI exits so the user can see
    // failure output (e.g. "command not found"). Without this wrap, a fast
    // CLI exit kills the tmux session immediately and the UI shows only a
    // silent reconnect loop.
    const setPrefix = envPrefix(input.env);
    const wrapped = `env ${unsetPrefix} ${setPrefix}${input.command}; ec=$?; printf '\\n[CLI exited (%d). Press Ctrl-D to close the session.]\\n' "$ec"; exec "${'$'}{SHELL:-/bin/bash}"`;
    await exec("tmux", [
      "new-session",
      "-d",
      "-s",
      input.name,
      "-c",
      input.cwd,
      wrapped,
    ]);
  }

  async function killSession(name: string): Promise<void> {
    await exec("tmux", ["kill-session", "-t", name]);
  }

  async function hasSession(name: string): Promise<boolean> {
    try {
      await exec("tmux", ["has-session", "-t", name]);
      return true;
    } catch {
      return false;
    }
  }

  async function sendKeys(name: string, text: string, withEnter: boolean): Promise<void> {
    // text 와 Enter 를 같은 send-keys 호출로 보내면 tmux 가 두 키를 거의 동시에 PTY 에
    // 쏟아붓는다. 그러면 Claude/codex CLI 의 paste-detection 휴리스틱이 트리거되어
    // Enter 가 paste 의 일부로 흡수되고 submit 되지 않는다 (특히 long prompt + multi-byte).
    // 두 호출로 분리하고 사이에 작은 delay 를 둬서 paste 휴리스틱을 회피한다.
    await exec("tmux", ["send-keys", "-t", name, "--", text]);
    if (withEnter) {
      await new Promise((r) => setTimeout(r, 80));
      await exec("tmux", ["send-keys", "-t", name, "Enter"]);
    }
  }

  async function capturePane(name: string): Promise<string> {
    const { stdout } = await exec("tmux", ["capture-pane", "-p", "-t", name]);
    return stdout;
  }

  async function paneCurrentCommand(name: string): Promise<string | null> {
    try {
      const { stdout } = await exec("tmux", [
        "list-panes",
        "-t",
        name,
        "-F",
        "#{pane_current_command}",
      ]);
      const cmd = stdout.split("\n")[0]?.trim();
      return cmd ? cmd : null;
    } catch {
      return null;
    }
  }

  async function paneChildren(name: string): Promise<string[]> {
    try {
      const { stdout: pidOut } = await exec("tmux", [
        "list-panes",
        "-t",
        name,
        "-F",
        "#{pane_pid}",
      ]);
      const pid = pidOut.split("\n")[0]?.trim();
      if (!pid) return [];
      // Linux: ps --ppid <pid> -o comm=  → 직접 자식들의 comm.
      // Wrap shell 아래 실제 CLI 가 살아 있을 때 이 목록에 나타남.
      const { stdout } = await exec("ps", ["--ppid", pid, "-o", "comm="]);
      return stdout
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
    } catch {
      return [];
    }
  }

  return {
    listSessions,
    newSession,
    killSession,
    hasSession,
    sendKeys,
    capturePane,
    paneCurrentCommand,
    paneChildren,
  };
}
