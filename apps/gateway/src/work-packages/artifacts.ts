import { createHash } from "node:crypto";
import { readFile, readdir, lstat } from "node:fs/promises";
import { join, relative } from "node:path";
import { and, eq } from "drizzle-orm";
import * as schema from "@agent-desk/shared/db/schema";
import { workPackageArtifacts } from "@agent-desk/shared/db/schema";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";

export interface ArtifactSnapshot {
  relPath: string;
  sha256: string;
  size: number;
}

const ART_DIRS: ReadonlyArray<readonly string[]> = [
  ["docs", "superpowers", "specs"],
  ["docs", "superpowers", "plans"],
];

export async function scanArtifactDirs(
  workspacePath: string,
): Promise<ArtifactSnapshot[]> {
  const out: ArtifactSnapshot[] = [];
  for (const segs of ART_DIRS) {
    const abs = join(workspacePath, ...segs);
    let entries: string[];
    try {
      entries = await readdir(abs);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw err;
    }
    for (const name of entries) {
      if (!name.endsWith(".md") || name.startsWith(".")) continue;
      const full = join(abs, name);
      let stat;
      try {
        stat = await lstat(full);
      } catch {
        continue;
      }
      if (!stat.isFile()) continue;
      const buf = await readFile(full);
      const sha = createHash("sha256").update(buf).digest("hex");
      out.push({
        relPath: relative(workspacePath, full).replace(/\\/g, "/"),
        sha256: sha,
        size: stat.size,
      });
    }
  }
  return out;
}

export interface ReconcileOptions {
  db: BetterSQLite3Database<typeof schema>;
  workPackageId: number;
  stepIndex: number;
  workspacePath: string;
  previousBaseline: Record<string, string>;
  now: number;
}

export interface ReconcileResult {
  newBaseline: Record<string, string>;
  inserted: number;
  updatedDrift: number;
}

export async function reconcileArtifacts(
  opts: ReconcileOptions,
): Promise<ReconcileResult> {
  const snapshot = await scanArtifactDirs(opts.workspacePath);
  const newBaseline: Record<string, string> = {};
  let inserted = 0;
  let updatedDrift = 0;

  for (const s of snapshot) {
    newBaseline[s.relPath] = s.sha256;

    const existing = opts.db
      .select()
      .from(workPackageArtifacts)
      .where(
        and(
          eq(workPackageArtifacts.workPackageId, opts.workPackageId),
          eq(workPackageArtifacts.filePath, s.relPath),
        ),
      )
      .get();

    if (!existing) {
      opts.db
        .insert(workPackageArtifacts)
        .values({
          workPackageId: opts.workPackageId,
          stepIndex: opts.stepIndex,
          filePath: s.relPath,
          sha256: s.sha256,
          size: s.size,
          recordedAt: opts.now,
          lastSeenSha256: s.sha256,
          lastSeenAt: opts.now,
          driftDetected: 0,
        })
        .run();
      inserted++;
      continue;
    }

    const drift = existing.sha256 !== s.sha256 ? 1 : 0;
    opts.db
      .update(workPackageArtifacts)
      .set({
        lastSeenSha256: s.sha256,
        lastSeenAt: opts.now,
        driftDetected: drift,
      })
      .where(eq(workPackageArtifacts.id, existing.id))
      .run();
    if (drift) updatedDrift++;
  }

  return { newBaseline, inserted, updatedDrift };
}

export function baselineFromSnapshot(
  snap: ArtifactSnapshot[],
): Record<string, string> {
  return Object.fromEntries(snap.map((s) => [s.relPath, s.sha256]));
}
