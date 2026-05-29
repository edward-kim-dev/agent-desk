import { Hono } from "hono";
import { and, desc, eq } from "drizzle-orm";
import {
  PACKAGES,
  advanceWorkPackageRequest,
  completeWorkPackageRequest,
  sessions,
  startWorkPackageRequest,
  toCatalogEntry,
  workPackageArtifacts,
  workPackageEvents,
  workPackages,
  workspaces,
  type StepContext,
  type WorkPackageArtifactDto,
  type WorkPackageDto,
} from "@agent-desk/shared";
import type { DbHandle } from "../db";
import type { TmuxClient } from "../tmux/commands";
import { injectPrompt, type InjectResult } from "../tmux/inject";
import {
  ensureSkillInstalled,
  type EnsureSkillResult,
} from "../skills/install";
import {
  baselineFromSnapshot,
  reconcileArtifacts,
  scanArtifactDirs,
} from "../work-packages/artifacts";

type WorkPackageRow = typeof workPackages.$inferSelect;
type ArtifactRow = typeof workPackageArtifacts.$inferSelect;

function rowToDto(r: WorkPackageRow): WorkPackageDto {
  return {
    id: r.id,
    sessionId: r.sessionId,
    packageId: r.packageId,
    currentStep: r.currentStep,
    status: r.status as WorkPackageDto["status"],
    inputs: JSON.parse(r.inputsJson) as Record<string, unknown>,
    createdAt: r.createdAt,
    advancedAt: r.advancedAt,
    completedAt: r.completedAt,
  };
}

function artifactToDto(r: ArtifactRow): WorkPackageArtifactDto {
  return {
    id: r.id,
    stepIndex: r.stepIndex,
    filePath: r.filePath,
    sha256: r.sha256,
    size: r.size,
    recordedAt: r.recordedAt,
    lastSeenSha256: r.lastSeenSha256,
    lastSeenAt: r.lastSeenAt,
    driftDetected: r.driftDetected === 1,
  };
}

export interface WorkPackageRouteOptions {
  db: DbHandle["db"];
  tmux: TmuxClient;
  injectFn?: typeof injectPrompt;
  ensureSkillFn?: typeof ensureSkillInstalled;
  scanFn?: typeof scanArtifactDirs;
  reconcileFn?: typeof reconcileArtifacts;
  now?: () => number;
}

export function workPackageRoutes(opts: WorkPackageRouteOptions): {
  sessionScoped: Hono;
  instanceScoped: Hono;
  catalog: Hono;
} {
  const inject = opts.injectFn ?? injectPrompt;
  const ensureSkill = opts.ensureSkillFn ?? ensureSkillInstalled;
  const scan = opts.scanFn ?? scanArtifactDirs;
  const reconcile = opts.reconcileFn ?? reconcileArtifacts;
  const now = opts.now ?? (() => Date.now());

  const sessionScoped = new Hono();
  const instanceScoped = new Hono();
  const catalog = new Hono();

  // GET /packages
  catalog.get("/", (c) => {
    return c.json({
      packages: Object.values(PACKAGES).map(toCatalogEntry),
    });
  });

  // GET /sessions/:sessionId/plans — develop 패키지의 plan select 옵션 소스
  sessionScoped.get("/:sessionId/plans", async (c) => {
    const sid = Number(c.req.param("sessionId"));
    if (!Number.isInteger(sid)) return c.json({ error: "bad_id" }, 400);

    const sessionRow = opts.db
      .select()
      .from(sessions)
      .where(eq(sessions.id, sid))
      .get();
    if (!sessionRow) return c.json({ error: "unknown_session" }, 404);
    const ws = opts.db
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, sessionRow.workspaceId!))
      .get();
    if (!ws) return c.json({ error: "workspace_missing" }, 500);

    const snap = await scan(ws.path);
    const plans = snap
      .map((s) => s.relPath)
      .filter((p) => p.startsWith("docs/superpowers/plans/"))
      .sort()
      .reverse();
    return c.json({ plans });
  });

  // POST /sessions/:sessionId/work-packages
  sessionScoped.post("/:sessionId/work-packages", async (c) => {
    const sid = Number(c.req.param("sessionId"));
    if (!Number.isInteger(sid)) return c.json({ error: "bad_id" }, 400);

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid_request" }, 400);
    }
    const parsed = startWorkPackageRequest.safeParse(body);
    if (!parsed.success) return c.json({ error: "invalid_request" }, 400);

    const def = PACKAGES[parsed.data.packageId];
    if (!def) return c.json({ error: "unknown_package" }, 400);

    const sessionRow = opts.db
      .select()
      .from(sessions)
      .where(eq(sessions.id, sid))
      .get();
    if (!sessionRow) return c.json({ error: "unknown_session" }, 400);
    if (sessionRow.status !== "active")
      return c.json({ error: "session_dead" }, 409);
    if (def.cliRequirement === "claude" && sessionRow.cli !== "claude") {
      return c.json({ error: "session_cli_mismatch" }, 409);
    }

    const existing = opts.db
      .select()
      .from(workPackages)
      .where(
        and(
          eq(workPackages.sessionId, sid),
          eq(workPackages.status, "active"),
        ),
      )
      .get();
    if (existing)
      return c.json({ error: "already_has_active_package" }, 409);

    const inputsParsed = def.startForm.schema.safeParse(parsed.data.inputs);
    if (!inputsParsed.success)
      return c.json({ error: "invalid_inputs" }, 400);

    const ws = opts.db
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, sessionRow.workspaceId!))
      .get();
    if (!ws) return c.json({ error: "workspace_missing" }, 500);

    let installResult: EnsureSkillResult | null = null;
    if (def.steps[0].skillName) {
      try {
        installResult = await ensureSkill({
          workspacePath: ws.path,
          skillName: def.steps[0].skillName,
        });
      } catch (err) {
        installResult = {
          status: "error",
          linkPath: "",
          sourcePath: "",
          detail: (err as Error).message,
        };
      }
    }

    const baselineSnap = await scan(ws.path);
    const baseline = baselineFromSnapshot(baselineSnap);

    const ctx: StepContext = {
      workspacePath: ws.path,
      packageInstanceId: -1,
    };
    const prompt = def.steps[0].promptTemplate(inputsParsed.data, ctx);

    let injectResult: InjectResult;
    try {
      injectResult = await inject({
        tmux: opts.tmux,
        name: sessionRow.tmuxName,
        prompt,
      });
    } catch (err) {
      injectResult = {
        injected: false,
        reason: "tmux_error",
        detail: (err as Error).message,
      };
    }
    if (!injectResult.injected) {
      return c.json(
        {
          error: "inject_failed",
          result: injectResult,
          install: installResult,
        },
        502,
      );
    }

    const t = now();
    const inserted = opts.db
      .insert(workPackages)
      .values({
        sessionId: sid,
        packageId: def.id,
        currentStep: 1,
        status: "active",
        inputsJson: JSON.stringify(inputsParsed.data),
        baselineJson: JSON.stringify(baseline),
        createdAt: t,
        advancedAt: t,
      })
      .returning()
      .all();
    const row = inserted[0];

    opts.db
      .insert(workPackageEvents)
      .values({
        workPackageId: row.id,
        kind: "started",
        payloadJson: JSON.stringify({
          packageId: def.id,
          install: installResult,
        }),
        at: t,
      })
      .run();
    opts.db
      .insert(workPackageEvents)
      .values({
        workPackageId: row.id,
        kind: "step-injected",
        payloadJson: JSON.stringify({ step: 1, install: installResult }),
        at: t,
      })
      .run();
    opts.db
      .update(sessions)
      .set({ lastActivityAt: t })
      .where(eq(sessions.id, sid))
      .run();

    return c.json(
      {
        instance: rowToDto(row),
        step: { index: 1, title: def.steps[0].title },
        inject: injectResult,
        install: installResult,
      },
      200,
    );
  });

  // GET /sessions/:sessionId/work-packages
  sessionScoped.get("/:sessionId/work-packages", (c) => {
    const sid = Number(c.req.param("sessionId"));
    if (!Number.isInteger(sid)) return c.json({ error: "bad_id" }, 400);
    const rows = opts.db
      .select()
      .from(workPackages)
      .where(eq(workPackages.sessionId, sid))
      .orderBy(desc(workPackages.createdAt))
      .all();
    return c.json({ instances: rows.map(rowToDto) });
  });

  // POST /work-packages/:id/advance
  instanceScoped.post("/:id/advance", async (c) => {
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id)) return c.json({ error: "bad_id" }, 400);

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid_request" }, 400);
    }
    const parsed = advanceWorkPackageRequest.safeParse(body);
    if (!parsed.success) return c.json({ error: "invalid_request" }, 400);

    const row = opts.db
      .select()
      .from(workPackages)
      .where(eq(workPackages.id, id))
      .get();
    if (!row) return c.json({ error: "not_found" }, 404);
    if (row.status !== "active")
      return c.json({ error: "already_completed" }, 409);
    if (row.currentStep !== parsed.data.expectedCurrentStep) {
      return c.json(
        { error: "expected_step_mismatch", actual: row.currentStep },
        409,
      );
    }

    const def = PACKAGES[row.packageId];
    if (!def) return c.json({ error: "unknown_package" }, 500);
    const nextStep = def.steps[row.currentStep];
    if (!nextStep) return c.json({ error: "no_next_step" }, 409);

    const sessionRow = opts.db
      .select()
      .from(sessions)
      .where(eq(sessions.id, row.sessionId))
      .get();
    if (!sessionRow) return c.json({ error: "session_missing" }, 500);
    const ws = opts.db
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, sessionRow.workspaceId!))
      .get();
    if (!ws) return c.json({ error: "workspace_missing" }, 500);

    const previousBaseline = JSON.parse(row.baselineJson) as Record<
      string,
      string
    >;
    const t = now();
    const recon = await reconcile({
      db: opts.db,
      workPackageId: row.id,
      stepIndex: row.currentStep,
      workspacePath: ws.path,
      previousBaseline,
      now: t,
    });

    let installResult: EnsureSkillResult | null = null;
    if (nextStep.skillName) {
      try {
        installResult = await ensureSkill({
          workspacePath: ws.path,
          skillName: nextStep.skillName,
        });
      } catch (err) {
        installResult = {
          status: "error",
          linkPath: "",
          sourcePath: "",
          detail: (err as Error).message,
        };
      }
    }

    const inputs = JSON.parse(row.inputsJson) as Record<string, unknown>;
    const ctx: StepContext = {
      workspacePath: ws.path,
      packageInstanceId: row.id,
    };
    const prompt = nextStep.promptTemplate(inputs, ctx);

    let injectResult: InjectResult;
    try {
      injectResult = await inject({
        tmux: opts.tmux,
        name: sessionRow.tmuxName,
        prompt,
      });
    } catch (err) {
      injectResult = {
        injected: false,
        reason: "tmux_error",
        detail: (err as Error).message,
      };
    }

    if (!injectResult.injected) {
      opts.db
        .insert(workPackageEvents)
        .values({
          workPackageId: row.id,
          kind: "step-inject-failed",
          payloadJson: JSON.stringify({
            step: nextStep.index,
            reason: injectResult.reason,
            detail: injectResult.detail,
          }),
          at: t,
        })
        .run();
      return c.json(
        {
          error: "inject_failed",
          result: injectResult,
          install: installResult,
        },
        502,
      );
    }

    opts.db
      .update(workPackages)
      .set({
        currentStep: nextStep.index,
        advancedAt: t,
        baselineJson: JSON.stringify(recon.newBaseline),
      })
      .where(eq(workPackages.id, row.id))
      .run();
    opts.db
      .insert(workPackageEvents)
      .values({
        workPackageId: row.id,
        kind: "advanced",
        payloadJson: JSON.stringify({
          from: row.currentStep,
          to: nextStep.index,
          inserted: recon.inserted,
          updatedDrift: recon.updatedDrift,
        }),
        at: t,
      })
      .run();
    opts.db
      .insert(workPackageEvents)
      .values({
        workPackageId: row.id,
        kind: "step-injected",
        payloadJson: JSON.stringify({
          step: nextStep.index,
          install: installResult,
        }),
        at: t,
      })
      .run();
    opts.db
      .update(sessions)
      .set({ lastActivityAt: t })
      .where(eq(sessions.id, row.sessionId))
      .run();

    const updated = opts.db
      .select()
      .from(workPackages)
      .where(eq(workPackages.id, row.id))
      .get();
    return c.json(
      {
        instance: rowToDto(updated!),
        step: { index: nextStep.index, title: nextStep.title },
        inject: injectResult,
        install: installResult,
        artifactsDelta: {
          inserted: recon.inserted,
          updatedDrift: recon.updatedDrift,
        },
      },
      200,
    );
  });

  // POST /work-packages/:id/complete
  instanceScoped.post("/:id/complete", async (c) => {
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id)) return c.json({ error: "bad_id" }, 400);

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      body = {};
    }
    const parsed = completeWorkPackageRequest.safeParse(body);
    if (!parsed.success) return c.json({ error: "invalid_request" }, 400);

    const row = opts.db
      .select()
      .from(workPackages)
      .where(eq(workPackages.id, id))
      .get();
    if (!row) return c.json({ error: "not_found" }, 404);
    if (row.status !== "active")
      return c.json({ error: "already_completed" }, 409);

    const sessionRow = opts.db
      .select()
      .from(sessions)
      .where(eq(sessions.id, row.sessionId))
      .get();
    const ws = sessionRow
      ? opts.db
          .select()
          .from(workspaces)
          .where(eq(workspaces.id, sessionRow.workspaceId!))
          .get()
      : null;
    const t = now();
    if (ws) {
      const previousBaseline = JSON.parse(row.baselineJson) as Record<
        string,
        string
      >;
      await reconcile({
        db: opts.db,
        workPackageId: row.id,
        stepIndex: row.currentStep,
        workspacePath: ws.path,
        previousBaseline,
        now: t,
      });
    }

    const newStatus =
      parsed.data.outcome === "abandoned" ? "abandoned" : "completed";
    opts.db
      .update(workPackages)
      .set({ status: newStatus, completedAt: t })
      .where(eq(workPackages.id, id))
      .run();
    opts.db
      .insert(workPackageEvents)
      .values({
        workPackageId: id,
        kind: newStatus,
        payloadJson: JSON.stringify({ at: t }),
        at: t,
      })
      .run();

    const updated = opts.db
      .select()
      .from(workPackages)
      .where(eq(workPackages.id, id))
      .get();
    return c.json({ instance: rowToDto(updated!) }, 200);
  });

  // POST /work-packages/:id/scan — inject 없이 디스크 reconcile 만 (수동 ↻)
  instanceScoped.post("/:id/scan", async (c) => {
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id)) return c.json({ error: "bad_id" }, 400);

    const row = opts.db
      .select()
      .from(workPackages)
      .where(eq(workPackages.id, id))
      .get();
    if (!row) return c.json({ error: "not_found" }, 404);
    if (row.status !== "active")
      return c.json({ error: "already_completed" }, 409);

    const sessionRow = opts.db
      .select()
      .from(sessions)
      .where(eq(sessions.id, row.sessionId))
      .get();
    if (!sessionRow) return c.json({ error: "session_missing" }, 500);
    const ws = opts.db
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, sessionRow.workspaceId!))
      .get();
    if (!ws) return c.json({ error: "workspace_missing" }, 500);

    const previousBaseline = JSON.parse(row.baselineJson) as Record<string, string>;
    const t = now();
    const recon = await reconcile({
      db: opts.db,
      workPackageId: row.id,
      stepIndex: row.currentStep,
      workspacePath: ws.path,
      previousBaseline,
      now: t,
    });

    return c.json({
      artifactsDelta: {
        inserted: recon.inserted,
        updatedDrift: recon.updatedDrift,
      },
    }, 200);
  });

  // GET /work-packages/:id/artifacts
  instanceScoped.get("/:id/artifacts", (c) => {
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id)) return c.json({ error: "bad_id" }, 400);
    const rows = opts.db
      .select()
      .from(workPackageArtifacts)
      .where(eq(workPackageArtifacts.workPackageId, id))
      .all();
    return c.json({ artifacts: rows.map(artifactToDto) });
  });

  return { sessionScoped, instanceScoped, catalog };
}
