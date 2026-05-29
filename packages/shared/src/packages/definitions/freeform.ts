import { z } from "zod";
import type { PackageDefinition } from "../types";

export const freeformInputs = z.object({
  prompt: z.string().min(1).max(4000),
});
export type FreeformInputs = z.infer<typeof freeformInputs>;

/** 줄바꿈은 sendKeys 가 조기 제출을 일으키므로 ` · ` 로 치환 (planning 과 동일 규칙). */
function sanitizePrompt(prompt: string): string {
  return prompt.replace(/\r?\n/g, " · ").trim();
}

export const freeform: PackageDefinition<FreeformInputs> = {
  id: "freeform",
  title: "자유 진행",
  description: "정해진 스킬 없이 원하는 작업 지시를 그대로 세션에 전달합니다.",
  cliRequirement: "any",
  startForm: {
    schema: freeformInputs,
    fields: [
      {
        name: "prompt",
        label: "What do you want to do?",
        hint: "세션에 그대로 주입할 첫 프롬프트 (슬래시 명령도 가능)",
        kind: "textarea",
        required: true,
        rows: 4,
        maxLength: 4000,
      },
    ],
  },
  steps: [
    {
      index: 1,
      title: "Work",
      skillName: "",
      promptTemplate: (inputs) => sanitizePrompt(inputs.prompt),
      completionArtifactDir: "docs/superpowers/",
    },
  ],
};
