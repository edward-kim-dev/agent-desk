import { and, eq, inArray, lt } from "drizzle-orm";
import { sessions, sessionEvents } from "@agent-desk/shared/db/schema";
import type { DbHandle } from "../db";

export interface NightlyCleanupResult {
  markedDeadIds: number[];
}

export function runNightlyCleanup(opts: {
  db: DbHandle["db"];
  now: number;
  maxInactiveMs: number;
}): NightlyCleanupResult {
  const cutoff = opts.now - opts.maxInactiveMs;
  const stale = opts.db
    .select({ id: sessions.id })
    .from(sessions)
    .where(
      and(
        eq(sessions.status, "active"),
        eq(sessions.adopted, 0),
        lt(sessions.lastActivityAt, cutoff)
      )
    )
    .all();
  const ids = stale.map((s) => s.id);
  if (ids.length > 0) {
    opts.db
      .update(sessions)
      .set({ status: "dead" })
      .where(inArray(sessions.id, ids))
      .run();
    for (const id of ids) {
      opts.db
        .insert(sessionEvents)
        .values({
          sessionId: id,
          kind: "killed",
          payloadJson: JSON.stringify({ reason: "nightly_cleanup" }),
          at: opts.now,
        })
        .run();
    }
  }
  return { markedDeadIds: ids };
}

export function startNightlyCleanupLoop(opts: {
  db: DbHandle["db"];
  intervalMs?: number;
  maxInactiveMs?: number;
}): { stop: () => void } {
  const interval = opts.intervalMs ?? 60 * 60 * 1000;
  const maxInactive = opts.maxInactiveMs ?? 7 * 24 * 60 * 60 * 1000;
  const timer = setInterval(
    () => runNightlyCleanup({ db: opts.db, now: Date.now(), maxInactiveMs: maxInactive }),
    interval
  );
  return { stop: () => clearInterval(timer) };
}
