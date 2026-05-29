import { z } from "zod";
import type { PackageDefinition } from "../types";

export const developStep1 = z.object({
  planPath: z
    .string()
    .min(1)
    .max(500)
    .regex(
      /^docs\/superpowers\/plans\/[^/]+\.md$/,
      "plan path must point to a .md under docs/superpowers/plans/",
    ),
});
export type DevelopInputs = { 1: z.infer<typeof developStep1> };

export const develop: PackageDefinition<DevelopInputs> = {
  id: "develop",
  title: "구현",
  description: "기존 기획(plan) 문서를 골라 executing-plans 로 구현합니다.",
  cliRequirement: "claude",
  forms: [
    {
      step: 1,
      schema: developStep1,
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
  ],
  steps: [
    {
      index: 1,
      title: "Execute plan",
      skillName: "executing-plans",
      promptTemplate: (inputs) => `/executing-plans ${inputs[1].planPath}`,
      completionArtifactDir: "docs/superpowers/plans/",
    },
  ],
};
