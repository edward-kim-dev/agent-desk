import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { sessionEvents, sessions, workspaces } from "./schema";

export type Workspace = InferSelectModel<typeof workspaces>;
export type WorkspaceInsert = InferInsertModel<typeof workspaces>;

export type Session = InferSelectModel<typeof sessions>;
export type SessionInsert = InferInsertModel<typeof sessions>;

export type SessionEvent = InferSelectModel<typeof sessionEvents>;
export type SessionEventInsert = InferInsertModel<typeof sessionEvents>;

export type SessionStatus = Session["status"];
export type SessionEventKind = SessionEvent["kind"];
