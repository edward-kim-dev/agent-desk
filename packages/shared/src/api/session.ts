import { z } from "zod";

export const createSessionRequest = z.object({
  workspaceId: z.number().int().positive(),
  cli: z.string().min(1),
  args: z.array(z.string()).default([]),
});
export type CreateSessionRequest = z.infer<typeof createSessionRequest>;

export const sessionStatus = z.enum(["active", "dead"]);
export const sessionEventKind = z.enum([
  "created",
  "attached",
  "detached",
  "killed",
  "adopted",
]);

export const sessionDto = z.object({
  id: z.number().int(),
  tmuxName: z.string(),
  workspaceId: z.number().int().nullable(),
  cli: z.string().nullable(),
  args: z.string().nullable(),
  status: sessionStatus,
  adopted: z.boolean(),
  attachedClients: z.number().int().nonnegative(),
  lastActivityAt: z.number().int(),
  createdAt: z.number().int(),
});
export type SessionDto = z.infer<typeof sessionDto>;

export const sessionListDto = z.object({
  sessions: z.array(sessionDto),
});
