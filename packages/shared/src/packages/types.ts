import type { z } from "zod";

export interface FieldSpec {
  name: string;
  label: string;
  hint?: string;
  kind: "text" | "textarea" | "select";
  required?: boolean;
  maxLength?: number;
  placeholder?: string;
  rows?: number;
  /**
   * `kind: "select"` 전용. 옵션을 정적으로 못 박지 않고 워크스페이스 상태에서
   * 동적으로 가져와야 할 때, web 이 어디서 옵션을 fetch 할지 지시한다.
   * "plans" = 워크스페이스의 `docs/superpowers/plans/` 의 기존 .md 목록.
   */
  optionsSource?: "plans";
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
