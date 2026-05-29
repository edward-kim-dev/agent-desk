import { z } from "zod";

export const workPackageStatus = z.enum(["active", "completed", "abandoned"]);
export type WorkPackageStatus = z.infer<typeof workPackageStatus>;

export const workPackageDto = z.object({
  id: z.number().int(),
  sessionId: z.number().int(),
  packageId: z.string(),
  currentStep: z.number().int().nonnegative(),
  status: workPackageStatus,
  inputs: z.record(z.string(), z.record(z.string(), z.unknown())),
  createdAt: z.number().int(),
  advancedAt: z.number().int(),
  completedAt: z.number().int().nullable(),
});
export type WorkPackageDto = z.infer<typeof workPackageDto>;

export const workPackageArtifactDto = z.object({
  id: z.number().int(),
  stepIndex: z.number().int(),
  filePath: z.string(),
  sha256: z.string(),
  size: z.number().int().nonnegative(),
  recordedAt: z.number().int(),
  lastSeenSha256: z.string(),
  lastSeenAt: z.number().int(),
  driftDetected: z.boolean(),
});
export type WorkPackageArtifactDto = z.infer<typeof workPackageArtifactDto>;

export const startWorkPackageRequest = z.object({
  packageId: z.string().min(1),
  inputs: z.record(z.string(), z.unknown()),
});
export type StartWorkPackageRequest = z.infer<typeof startWorkPackageRequest>;

export const advanceWorkPackageRequest = z.object({
  expectedCurrentStep: z.number().int().positive(),
  inputs: z.record(z.string(), z.unknown()).optional(),
});
export type AdvanceWorkPackageRequest = z.infer<typeof advanceWorkPackageRequest>;

export const completeWorkPackageRequest = z.object({
  outcome: z.enum(["success", "abandoned"]).default("success"),
});
export type CompleteWorkPackageRequest = z.infer<typeof completeWorkPackageRequest>;

export const reportProgressRequest = z.union([
  z.object({ filePath: z.string().min(1) }),
  z.object({ lastMessage: z.string().min(1).max(500) }),
]);
export type ReportProgressRequest = z.infer<typeof reportProgressRequest>;

export const reportProgressResponse = z.object({
  recorded: z.boolean(),
  stepReady: z.boolean().optional(),
});
export type ReportProgressResponse = z.infer<typeof reportProgressResponse>;
