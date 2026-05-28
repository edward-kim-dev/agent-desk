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
  /**
   * step 완료 신호로 사용할 artifact 디렉토리.
   * workspace 상대 경로, 끝에 `/` 포함. 예: "docs/superpowers/specs/"
   * PostToolUse hook이 쓴 파일 경로가 이 prefix 안에 있으면 step_ready 판단.
   */
  completionArtifactDir: string;
}

export interface PackageDefinition<I = unknown> {
  id: string;
  title: string;
  description: string;
  cliRequirement: "claude" | "any";
  startForm: StartForm;
  steps: StepDefinition<I>[];
}
