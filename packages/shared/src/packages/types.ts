import type { z } from "zod";

export interface FieldSpec {
  name: string;
  label: string;
  hint?: string;
  kind: "text" | "textarea";
  required?: boolean;
  maxLength?: number;
  placeholder?: string;
  rows?: number;
}

export interface StartForm<S extends z.ZodTypeAny = z.ZodTypeAny> {
  schema: S;
  fields: FieldSpec[];
}

export interface StepContext {
  workspacePath: string;
  packageInstanceId: number;
}

export interface StepDefinition<I = unknown> {
  index: number;
  title: string;
  skillName: string;
  promptTemplate: (inputs: I, ctx: StepContext) => string;
}

export interface PackageDefinition<I = unknown> {
  id: string;
  title: string;
  description: string;
  cliRequirement: "claude" | "any";
  startForm: StartForm;
  steps: StepDefinition<I>[];
}
