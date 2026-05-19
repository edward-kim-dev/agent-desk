import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileP = promisify(execFile);

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
}

export interface TmuxClient {
  listSessions(): Promise<TmuxSessionInfo[]>;
  newSession(input: NewSessionInput): Promise<void>;
  killSession(name: string): Promise<void>;
  hasSession(name: string): Promise<boolean>;
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
    opts.exec ?? ((cmd, args) => execFileP(cmd, args, { encoding: "utf8" }));

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
    await exec("tmux", [
      "new-session",
      "-d",
      "-s",
      input.name,
      "-c",
      input.cwd,
      input.command,
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

  return { listSessions, newSession, killSession, hasSession };
}
