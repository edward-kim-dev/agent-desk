import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

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
  briefedAt: integer("briefed_at"),
});

export const sessionEvents = sqliteTable("session_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  sessionId: integer("session_id")
    .notNull()
    .references(() => sessions.id),
  kind: text("kind", {
    enum: [
      "created",
      "attached",
      "detached",
      "killed",
      "adopted",
      "briefed",
      "brief-failed",
    ],
  }).notNull(),
  payloadJson: text("payload_json"),
  at: integer("at").notNull(),
});
