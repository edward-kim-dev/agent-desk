import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const workspaces = sqliteTable("workspaces", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  path: text("path").notNull().unique(),
  name: text("name").notNull(),
  createdAt: integer("created_at").notNull(),
  deletedAt: integer("deleted_at"),
  harnessEnabled: integer("harness_enabled").notNull().default(0),
});

export const sessions = sqliteTable("sessions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  tmuxName: text("tmux_name").notNull().unique(),
  workspaceId: integer("workspace_id").references(() => workspaces.id),
  cli: text("cli"),
  args: text("args"),
  status: text("status", { enum: ["active", "dead"] }).notNull(),
  lastActivityAt: integer("last_activity_at").notNull(),
  createdAt: integer("created_at").notNull(),
  adopted: integer("adopted").notNull().default(0),
});

export const sessionEvents = sqliteTable("session_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  sessionId: integer("session_id")
    .notNull()
    .references(() => sessions.id),
  kind: text("kind", {
    enum: ["created", "attached", "detached", "killed", "adopted"],
  }).notNull(),
  payloadJson: text("payload_json"),
  at: integer("at").notNull(),
});

export const workPackages = sqliteTable("work_packages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  sessionId: integer("session_id")
    .notNull()
    .references(() => sessions.id),
  packageId: text("package_id").notNull(),
  currentStep: integer("current_step").notNull().default(0),
  status: text("status", { enum: ["active", "completed", "abandoned"] }).notNull(),
  inputsJson: text("inputs_json").notNull(),
  baselineJson: text("baseline_json").notNull(),
  createdAt: integer("created_at").notNull(),
  advancedAt: integer("advanced_at").notNull(),
  completedAt: integer("completed_at"),
});

export const workPackageEvents = sqliteTable("work_package_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  workPackageId: integer("work_package_id")
    .notNull()
    .references(() => workPackages.id),
  kind: text("kind", {
    enum: [
      "started",
      "step-injected",
      "step-inject-failed",
      "advanced",
      "completed",
      "abandoned",
    ],
  }).notNull(),
  payloadJson: text("payload_json"),
  at: integer("at").notNull(),
});

export const workPackageArtifacts = sqliteTable(
  "work_package_artifacts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    workPackageId: integer("work_package_id")
      .notNull()
      .references(() => workPackages.id),
    stepIndex: integer("step_index").notNull(),
    filePath: text("file_path").notNull(),
    sha256: text("sha256").notNull(),
    size: integer("size").notNull(),
    recordedAt: integer("recorded_at").notNull(),
    lastSeenSha256: text("last_seen_sha256").notNull(),
    lastSeenAt: integer("last_seen_at").notNull(),
    driftDetected: integer("drift_detected").notNull().default(0),
  },
  (t) => ({
    wpFileUnique: uniqueIndex("work_package_artifacts_wp_file_unique").on(
      t.workPackageId,
      t.filePath,
    ),
  }),
);
