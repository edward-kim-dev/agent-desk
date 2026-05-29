import { z } from "zod";
import type { PackageDefinition } from "../types";
import { formatBrainstormingPrompt } from "../format-prompt";

export const planningStep1 = z.object({
  topic: z.string().min(1).max(500),
  context: z.string().max(2000).optional(),
  constraints: z.string().max(2000).optional(),
  goals: z.string().max(2000).optional(),
});
export const planningStep2 = z.object({
  guidance: z.string().max(2000).optional(),
});
export type PlanningInputs = {
  1: z.infer<typeof planningStep1>;
  2?: z.infer<typeof planningStep2>;
};

export const planning: PackageDefinition<PlanningInputs> = {
  id: "planning",
  title: "기획",
  description: "아이디어를 brainstorming → spec → plan 으로 정리합니다.",
  cliRequirement: "claude",
  forms: [
    {
      step: 1,
      schema: planningStep1,
      fields: [
        {
          name: "topic",
          label: "What are we planning?",
          kind: "text",
          required: true,
          maxLength: 500,
          placeholder: "Add a notifications system to agent-desk",
        },
        {
          name: "context",
          label: "Context",
          hint: "배경, 이전 결정, 사용자가 미리 알리고 싶은 것",
          kind: "textarea",
          maxLength: 2000,
          rows: 3,
        },
        {
          name: "constraints",
          label: "Constraints",
          hint: "기술 스택, 시간 예산, 범위에서 빠지는 것",
          kind: "textarea",
          maxLength: 2000,
          rows: 2,
        },
        {
          name: "goals",
          label: "Success criteria",
          hint: "끝났을 때 어떤 산출물·결정이 있어야 하는지",
          kind: "textarea",
          maxLength: 2000,
          rows: 2,
        },
      ],
    },
    {
      step: 2,
      schema: planningStep2,
      fields: [
        {
          name: "guidance",
          label: "Plan guidance (optional)",
          hint: "spec 을 본 뒤 plan 작성에 추가로 반영할 방향 (비워도 됨)",
          kind: "textarea",
          maxLength: 2000,
          rows: 3,
        },
      ],
    },
  ],
  steps: [
    {
      index: 1,
      title: "Brainstorm",
      skillName: "brainstorming",
      promptTemplate: (inputs) => formatBrainstormingPrompt(inputs[1]),
      completionArtifactDir: "docs/superpowers/specs/",
    },
    {
      index: 2,
      title: "Write plan",
      skillName: "writing-plans",
      promptTemplate: (inputs) => {
        const g = inputs[2]?.guidance?.trim();
        if (!g) return "/writing-plans";
        return `/writing-plans ${g.replace(/\r?\n/g, " · ")}`;
      },
      completionArtifactDir: "docs/superpowers/plans/",
    },
  ],
};
