import { and, eq, inArray, notInArray } from "drizzle-orm";
import { sessionEvents, sessions } from "@agent-desk/shared/db/schema";
import type { DbHandle } from "../db";
import type { TmuxClient, TmuxSessionInfo } from "./commands";

const KNOWN_CLIS = new Set(["claude", "gemini", "codex", "aider", "opencode"]);

function inferCli(paneCurrentCommand: string): string {
  return KNOWN_CLIS.has(paneCurrentCommand) ? paneCurrentCommand : "unknown";
}

export interface DiscoveryDeps {
  db: DbHandle["db"];
  tmux: Pick<TmuxClient, "listSessions">;
  now: number;
}

export async function runDiscoveryTick(deps: DiscoveryDeps): Promise<void> {
  const live: TmuxSessionInfo[] = await deps.tmux.listSessions();
  const liveByName = new Map(live.map((s) => [s.name, s]));

  const known = deps.db.select().from(sessions).all();
  const knownByName = new Map(known.map((s) => [s.tmuxName, s]));

  for (const ls of live) {
    if (knownByName.has(ls.name)) continue;
    const inserted = deps.db
      .insert(sessions)
      .values({
        tmuxName: ls.name,
        workspaceId: null,
        cli: inferCli(ls.paneCurrentCommand),
        args: null,
        status: "active",
        lastActivityAt: deps.now,
        createdAt: ls.createdAt > 0 ? ls.createdAt * 1000 : deps.now,
        adopted: 1,
      })
      .returning({ id: sessions.id })
      .all();
    deps.db
      .insert(sessionEvents)
      .values({
        sessionId: inserted[0].id,
        kind: "adopted",
        payloadJson: JSON.stringify({ paneCurrentCommand: ls.paneCurrentCommand }),
        at: deps.now,
      })
      .run();
  }

  const liveNames = Array.from(liveByName.keys());
  const vanished = known
    .filter((s) => s.status === "active" && !liveByName.has(s.tmuxName))
    .map((s) => s.id);
  if (vanished.length > 0) {
    deps.db
      .update(sessions)
      .set({ status: "dead" })
      .where(inArray(sessions.id, vanished))
      .run();
    for (const id of vanished) {
      deps.db
        .insert(sessionEvents)
        .values({
          sessionId: id,
          kind: "killed",
          payloadJson: JSON.stringify({ reason: "vanished" }),
          at: deps.now,
        })
        .run();
    }
  }

  void liveNames;
  void and;
  void notInArray;
  void eq;
}

export function startDiscoveryLoop(deps: {
  db: DbHandle["db"];
  tmux: Pick<TmuxClient, "listSessions">;
  intervalMs?: number;
}): { stop: () => void } {
  const interval = deps.intervalMs ?? 5000;
  let stopped = false;
  let timer: NodeJS.Timeout | undefined;

  const tick = async () => {
    if (stopped) return;
    try {
      await runDiscoveryTick({ db: deps.db, tmux: deps.tmux, now: Date.now() });
    } catch (err) {
      console.error("[discover] tick failed:", err);
    }
    if (!stopped) timer = setTimeout(tick, interval);
  };

  timer = setTimeout(tick, interval);
  return {
    stop: () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    },
  };
}
