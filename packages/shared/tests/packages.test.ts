import { describe, expect, it } from "vitest";
import {
  PACKAGES,
  develop,
  formatBrainstormingPrompt,
  freeform,
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

describe("develop package", () => {
  it("PACKAGES 에 등록되어 있고 cli=claude, 단일 step (executing-plans)", () => {
    expect(PACKAGES.develop).toBe(develop);
    expect(getPackage("develop")).toBe(develop);
    expect(develop.cliRequirement).toBe("claude");
    expect(develop.steps.map((s) => s.skillName)).toEqual(["executing-plans"]);
  });

  it("planPath 필드가 plans 를 source 로 하는 select 이다", () => {
    const field = develop.startForm.fields[0];
    expect(field.kind).toBe("select");
    expect(field.optionsSource).toBe("plans");
    expect(field.required).toBe(true);
  });

  it("promptTemplate 가 /executing-plans <planPath> 를 만든다", () => {
    const out = develop.steps[0].promptTemplate(
      { planPath: "docs/superpowers/plans/2026-05-27-foo.md" },
      { workspacePath: "/tmp", packageInstanceId: 1 },
    );
    expect(out).toBe("/executing-plans docs/superpowers/plans/2026-05-27-foo.md");
  });

  it("schema 가 plans 디렉토리 밖 경로를 거부한다", () => {
    expect(
      develop.startForm.schema.safeParse({ planPath: "../../etc/passwd" })
        .success,
    ).toBe(false);
    expect(
      develop.startForm.schema.safeParse({
        planPath: "docs/superpowers/specs/x.md",
      }).success,
    ).toBe(false);
    expect(
      develop.startForm.schema.safeParse({
        planPath: "docs/superpowers/plans/x.md",
      }).success,
    ).toBe(true);
  });
});

describe("freeform package", () => {
  it("PACKAGES 에 등록되어 있고 cli=any, skillName 이 빈 단일 step", () => {
    expect(PACKAGES.freeform).toBe(freeform);
    expect(freeform.cliRequirement).toBe("any");
    expect(freeform.steps).toHaveLength(1);
    expect(freeform.steps[0].skillName).toBe("");
  });

  it("promptTemplate 가 prompt 를 그대로 (줄바꿈만 치환) 반환한다", () => {
    const out = freeform.steps[0].promptTemplate(
      { prompt: "line1\nline2" },
      { workspacePath: "/tmp", packageInstanceId: 1 },
    );
    expect(out).toBe("line1 · line2");
  });
});

describe("PACKAGES registry shape", () => {
  it("freeform · planning · develop 순서로 노출된다", () => {
    expect(Object.values(PACKAGES).map((p) => p.id)).toEqual([
      "freeform",
      "planning",
      "develop",
    ]);
  });
});

describe("planning package completionArtifactDir", () => {
  it("step 1 completionArtifactDir는 docs/superpowers/specs/ 이다", () => {
    const step1 = planning.steps.find((s) => s.index === 1);
    expect(step1?.completionArtifactDir).toBe("docs/superpowers/specs/");
  });

  it("step 2 completionArtifactDir는 docs/superpowers/plans/ 이다", () => {
    const step2 = planning.steps.find((s) => s.index === 2);
    expect(step2?.completionArtifactDir).toBe("docs/superpowers/plans/");
  });
});
