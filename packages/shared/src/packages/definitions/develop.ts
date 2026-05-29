import { z } from "zod";
import type { PackageDefinition } from "../types";

export const developInputs = z.object({
  planPath: z
    .string()
    .min(1)
    .max(500)
    .regex(
      /^docs\/superpowers\/plans\/[^/]+\.md$/,
      "plan path must point to a .md under docs/superpowers/plans/",
    ),
});
export type DevelopInputs = z.infer<typeof developInputs>;

export const develop: PackageDefinition<DevelopInputs> = {
  id: "develop",
  title: "구현",
  description: "기존 기획(plan) 문서를 골라 executing-plans 로 구현합니다.",
  cliRequirement: "claude",
  startForm: {
    schema: developInputs,
    fields: [
      {
        name: "planPath",
        label: "Plan document",
        hint: "docs/superpowers/plans/ 에 있는 기존 계획 문서를 선택",
        kind: "select",
        required: true,
        optionsSource: "plans",
      },
    ],
  },
  steps: [
    {
      index: 1,
      title: "Execute plan",
      skillName: "executing-plans",
      promptTemplate: (inputs) => `/executing-plans ${inputs.planPath}`,
      completionArtifactDir: "docs/superpowers/plans/",
    },
  ],
};
