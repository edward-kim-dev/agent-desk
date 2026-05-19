import { z } from "zod";

export const createWorkspaceRequest = z.object({
  name: z.string().min(1).max(120),
  path: z.string().startsWith("/"),
});
export type CreateWorkspaceRequest = z.infer<typeof createWorkspaceRequest>;

export const workspaceDto = z.object({
  id: z.number().int(),
  name: z.string(),
  path: z.string(),
  createdAt: z.number().int(),
});
export type WorkspaceDto = z.infer<typeof workspaceDto>;
