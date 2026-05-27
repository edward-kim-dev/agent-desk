import { z } from "zod";

export const createWorkspaceRequest = z.object({
  name: z.string().min(1).max(120),
  path: z.string().startsWith("/"),
  harnessEnabled: z.boolean().optional().default(false),
});
export type CreateWorkspaceRequest = z.infer<typeof createWorkspaceRequest>;

export const updateWorkspaceRequest = z.object({
  harnessEnabled: z.boolean(),
});
export type UpdateWorkspaceRequest = z.infer<typeof updateWorkspaceRequest>;

export const workspaceDto = z.object({
  id: z.number().int(),
  name: z.string(),
  path: z.string(),
  createdAt: z.number().int(),
  deletedAt: z.number().int().nullable(),
  harnessEnabled: z.boolean(),
});
export type WorkspaceDto = z.infer<typeof workspaceDto>;
