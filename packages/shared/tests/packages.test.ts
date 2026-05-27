import { describe, expect, it } from "vitest";
import {
  PACKAGES,
  formatBrainstormingPrompt,
  getPackage,
  planning,
  startWorkPackageRequest,
  toCatalogEntry,
} from "../src";

describe("packages registry", () => {
  it("planning 패키지가 PACKAGES 에 등록되어 있다", () => {
    expect(PACKAGES.planning).toBe(planning);
    expect(getPackage("planning")).toBe(planning);
    expect(getPackage("nope")).toBeUndefined();
  });

  it("planning 정의가 cli=claude, 2-step 구조이다", () => {
    expect(planning.cliRequirement).toBe("claude");
    expect(planning.steps.map((s) => s.index)).toEqual([1, 2]);
    expect(planning.steps.map((s) => s.skillName)).toEqual([
      "brainstorming",
      "writing-plans",
    ]);
  });

  it("startForm.schema 가 topic 누락을 거부한다", () => {
    const r = planning.startForm.schema.safeParse({ context: "x" });
    expect(r.success).toBe(false);
  });

  it("startForm.schema 가 topic 만 있어도 통과한다", () => {
    const r = planning.startForm.schema.safeParse({ topic: "test" });
    expect(r.success).toBe(true);
  });

  it("Step 1 promptTemplate 가 /brainstorming 프롬프트를 만든다", () => {
    const out = planning.steps[0].promptTemplate(
      { topic: "X", context: "Y" },
      { workspacePath: "/tmp", packageInstanceId: -1 },
    );
    expect(out).toBe("/brainstorming Topic: X · Context: Y");
  });

  it("Step 2 promptTemplate 가 /writing-plans 만 반환한다", () => {
    const out = planning.steps[1].promptTemplate(
      { topic: "X" },
      { workspacePath: "/tmp", packageInstanceId: 7 },
    );
    expect(out).toBe("/writing-plans");
  });

  it("formatBrainstormingPrompt 가 줄바꿈을 · 로 치환한다", () => {
    const out = formatBrainstormingPrompt({
      topic: "T",
      context: "line1\nline2",
    });
    expect(out).toContain("line1 · line2");
  });

  it("toCatalogEntry 가 schema 를 제거하고 stepTitles 를 펼친다", () => {
    const entry = toCatalogEntry(planning);
    expect(entry.id).toBe("planning");
    expect(entry.stepTitles).toEqual(["Brainstorm", "Write plan"]);
    expect("schema" in (entry as Record<string, unknown>)).toBe(false);
  });

  it("startWorkPackageRequest 가 packageId 누락을 거부한다", () => {
    expect(startWorkPackageRequest.safeParse({ inputs: {} }).success).toBe(false);
  });
});
