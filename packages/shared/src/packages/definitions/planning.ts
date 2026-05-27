import { z } from "zod";
import type { PackageDefinition } from "../types";
import { formatBrainstormingPrompt } from "../format-prompt";

export const planningInputs = z.object({
  topic: z.string().min(1).max(500),
  context: z.string().max(2000).optional(),
  constraints: z.string().max(2000).optional(),
  goals: z.string().max(2000).optional(),
});
export type PlanningInputs = z.infer<typeof planningInputs>;

export const planning: PackageDefinition<PlanningInputs> = {
  id: "planning",
  title: "기획",
  description: "아이디어를 brainstorming → spec → plan 으로 정리합니다.",
  cliRequirement: "claude",
  startForm: {
    schema: planningInputs,
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
  steps: [
    {
      index: 1,
      title: "Brainstorm",
      skillName: "brainstorming",
      promptTemplate: (inputs) => formatBrainstormingPrompt(inputs),
    },
    {
      index: 2,
      title: "Write plan",
      skillName: "writing-plans",
      promptTemplate: () => "/writing-plans",
    },
  ],
};
