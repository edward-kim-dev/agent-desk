import { Hono } from "hono";
import { eq, and } from "drizzle-orm";
import path from "node:path";
import {
  PACKAGES,
  reportProgressRequest,
  sessions,
  workPackageEvents,
  workPackages,
  workspaces,
} from "@agent-desk/shared";
import type { DbHandle } from "../db";

// Broadcast function type — will be implemented in Task 5 (progress-server.ts)
// For now, define inline so progress.ts has no dependency on a non-existent file
export interface StepReadyPayload {
  sessionId: number;
  workPackageId: number;
  stepIndex: number;
  stepTitle: string;
}

export function progressRoutes(opts: {
  db: DbHandle["db"];
  broadcast: (event: StepReadyPayload) => void;
}): Hono {
  const r = new Hono();

  r.post("/:id/progress", async (c) => {
    const sessionId = Number(c.req.param("id"));
    if (!Number.isInteger(sessionId))
      return c.json({ error: "bad_id" }, 400);

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid_request" }, 400);
    }
    const parsed = reportProgressRequest.safeParse(body);
    if (!parsed.success)
      return c.json({ error: "invalid_request" }, 400);

    // session lookup
    const session = opts.db
      .select()
      .from(sessions)
      .where(eq(sessions.id, sessionId))
      .get();
    if (!session || session.status !== "active")
      return c.json({ recorded: false });

    // active work_package lookup
    const wp = opts.db
      .select()
      .from(workPackages)
      .where(
        and(
          eq(workPackages.sessionId, sessionId),
          eq(workPackages.status, "active"),
        ),
      )
      .get();
    if (!wp) return c.json({ recorded: false });

    // workspace lookup
    const ws = opts.db
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, session.workspaceId!))
      .get();
    if (!ws) return c.json({ recorded: false });

    const definition = PACKAGES[wp.packageId];
    if (!definition) return c.json({ recorded: false });

    const step = definition.steps.find((s) => s.index === wp.currentStep);
    if (!step) return c.json({ recorded: false });

    const now = Date.now();
    const data = parsed.data;
    let markerMatched = false;

    if ("filePath" in data) {
      // completionArtifactDir prefix matching
      // Claude Code sends relative paths (e.g. "docs/foo/bar.md") — resolve against
      // workspace path so we can compare with the absolute absDir.
      const absDir = path.join(ws.path, step.completionArtifactDir);
      const absFile = path.isAbsolute(data.filePath)
        ? path.normalize(data.filePath)
        : path.normalize(path.join(ws.path, data.filePath));
      markerMatched = absFile.startsWith(path.normalize(absDir));

      opts.db
        .insert(workPackageEvents)
        .values({
          workPackageId: wp.id,
          kind: "hook-file",
          payloadJson: JSON.stringify({
            stepIndex: wp.currentStep,
            filePath: data.filePath,
            markerMatched,
          }),
          at: now,
        })
        .run();

      if (markerMatched) {
        opts.broadcast({
          sessionId,
          workPackageId: wp.id,
          stepIndex: wp.currentStep,
          stepTitle: step.title,
        });
      }
    } else {
      // lastMessage — record only, never triggers step_ready
      opts.db
        .insert(workPackageEvents)
        .values({
          workPackageId: wp.id,
          kind: "hook-turn",
          payloadJson: JSON.stringify({
            stepIndex: wp.currentStep,
            lastMessage: data.lastMessage,
            markerMatched: false,
          }),
          at: now,
        })
        .run();
    }

    return c.json({ recorded: true, stepReady: markerMatched });
  });

  return r;
}
