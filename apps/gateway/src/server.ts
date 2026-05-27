import { serve, type ServerType } from "@hono/node-server";
import { Hono } from "hono";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { bearerAuth } from "./auth";
import type { DbHandle } from "./db";
import type { CliEntry } from "@agent-desk/shared";
import { workspaceRoutes } from "./routes/workspaces";
import { sessionRoutes } from "./routes/sessions";
import { wikiRoutes } from "./routes/wiki";
import { createTmuxClient, type TmuxClient } from "./tmux/commands";
import { attachWsServer } from "./ws/attach-server";
import { startDiscoveryLoop } from "./tmux/discover";
import { startNightlyCleanupLoop } from "./jobs/nightly-cleanup";
import type { injectPrompt } from "./tmux/inject";
import {
  ensureAllSkillsInstalled,
  ensureHarnessInstalled,
  type ensureSkillInstalled,
} from "./skills/install";
import { isNull } from "drizzle-orm";
import { workspaces as workspacesTable } from "@agent-desk/shared/db/schema";

export interface CreateServerOptions {
  db: DbHandle;
  token: string;
  cli: CliEntry[];
  bind: string;
  port: number;
  tmux?: TmuxClient;
  startBackgroundJobs?: boolean;
  /** Override the prompt-injection runner. Tests use this to bypass real tmux. */
  injectFn?: typeof injectPrompt;
  /** Override skill installer. Tests use this to bypass filesystem. */
  ensureSkillFn?: typeof ensureSkillInstalled;
  /** Override bulk skill installer. Tests use this to bypass filesystem. */
  ensureAllSkillsFn?: typeof ensureAllSkillsInstalled;
  /** Override harness single-skill installer. Tests use this to bypass filesystem. */
  ensureHarnessFn?: typeof ensureHarnessInstalled;
  /** Skip the boot-time bulk skill install. Defaults to running. */
  installSkillsOnStartup?: boolean;
}

export interface RunningServer {
  url: string;
  port: number;
  close: () => Promise<void>;
}

export async function createServer(
  opts: CreateServerOptions
): Promise<RunningServer> {
  const app = new Hono();

  app.get("/health", (c) => c.json({ ok: true }));

  const tmux = opts.tmux ?? createTmuxClient();

  const api = new Hono();
  api.use("*", bearerAuth(opts.token));
  api.get("/cli", (c) => c.json({ cli: opts.cli }));
  const ensureAllSkills = opts.ensureAllSkillsFn ?? ensureAllSkillsInstalled;
  api.route(
    "/workspaces",
    workspaceRoutes({
      db: opts.db.db,
      tmux,
      ensureAllSkillsFn: ensureAllSkills,
      ensureHarnessFn: opts.ensureHarnessFn,
    }),
  );
  // 활성 워크스페이스에 vendored 스킬을 일괄 symlink (idempotent).
  // 기동을 지연시키지 않도록 background 로 디스패치.
  if (opts.installSkillsOnStartup !== false) {
    const ensureHarness = opts.ensureHarnessFn ?? ensureHarnessInstalled;
    void (async () => {
      const rows = opts.db.db
        .select({
          path: workspacesTable.path,
          harnessEnabled: workspacesTable.harnessEnabled,
        })
        .from(workspacesTable)
        .where(isNull(workspacesTable.deletedAt))
        .all();
      for (const ws of rows) {
        try {
          await ensureAllSkills({ workspacePath: ws.path });
        } catch (err) {
          console.warn("[startup] skill install failed for", ws.path, err);
        }
        if (ws.harnessEnabled === 1) {
          try {
            await ensureHarness({ workspacePath: ws.path });
          } catch (err) {
            console.warn("[startup] harness install failed for", ws.path, err);
          }
        }
      }
    })();
  }
  api.route("/workspaces", wikiRoutes(opts.db.db));
  api.route(
    "/sessions",
    sessionRoutes({
      db: opts.db.db,
      tmux,
      cli: opts.cli,
      injectFn: opts.injectFn,
      ensureSkillFn: opts.ensureSkillFn,
    }),
  );
  app.route("/", api);

  const server = await new Promise<ServerType>((resolve) => {
    const s = serve(
      { fetch: app.fetch, hostname: opts.bind, port: opts.port },
      () => resolve(s)
    );
  });

  const wsHandle = attachWsServer({
    httpServer: server as unknown as Server,
    db: opts.db.db,
    token: opts.token,
  });

  const disposers: Array<() => void> = [];
  if (opts.startBackgroundJobs) {
    const disc = startDiscoveryLoop({ db: opts.db.db, tmux });
    const clean = startNightlyCleanupLoop({ db: opts.db.db });
    disposers.push(disc.stop, clean.stop);
  }

  const addr = server.address() as AddressInfo;
  return {
    url: `http://${opts.bind}:${addr.port}`,
    port: addr.port,
    close: async () => {
      for (const d of disposers) d();
      await wsHandle.close();
      await new Promise<void>((res, rej) =>
        server.close((err) => (err ? rej(err) : res()))
      );
    },
  };
}
