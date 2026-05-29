# Package Forms (mid-run) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `PackageDefinition.startForm` 을 `forms: FormSpec[]` 로 일반화하여, start form 뿐 아니라 step 진행 중에도(advance 시) 그 step 에 선언된 폼을 노출·수집하고 step 별 네임스페이스로 입력을 누적한다.

**Architecture:** 폼은 `PackageDefinition` 에 정적으로 선언되며 각 폼은 게이트하는 step 번호(`step`)를 가진다. step 1 폼 = 시작 폼(POST `/work-packages`), step N(>1) 폼 = advance 시 수집. 입력은 `inputsJson` 에 step 키 레코드(`{ "1": {...}, "2": {...} }`)로 누적되고 각 step 의 `promptTemplate(inputs)` 는 `inputs[step]` 로 필요한 값을 꺼낸다. `completionArtifactDir`/`step_ready`/artifact 로직과 DB 스키마는 변경 없음.

**Tech Stack:** TypeScript, Zod, Hono(gateway), Drizzle(SQLite), React/Next(web), Vitest + Testing Library.

**Spec:** [specs/2026-05-29-package-forms-mid-run-design.md](../specs/2026-05-29-package-forms-mid-run-design.md)

---

## ⚠️ 커밋 정책 (이 플랜 한정 — `agent-desk/CLAUDE.md` 우선)

표준 writing-plans 템플릿의 "task 마다 commit" 단계는 **이 프로젝트에서 금지**다. `agent-desk/CLAUDE.md`:

- 작업 중에는 commit 하지 않는다. TDD red→green 단계마다 commit 금지.
- 모든 작업이 끝나고 **사용자 검토 + 승인 후** 모듈 단위로 큼직하게 한 번에 commit.
- 표준 모듈 묶음: (1) `packages/shared` + `apps/gateway` 한 커밋, (2) `apps/web` 한 커밋, (3) `docs/superpowers/**` 한 커밋.
- 커밋 후 owngo 에서 submodule pointer bump 커밋.

따라서 각 Task 는 "Commit" 단계를 포함하지 않는다. 커밋은 **Task 14 (사용자 승인 후)** 에서만 수행한다.

---

## 파일 구조

**수정:**
- `packages/shared/src/packages/types.ts` — `StartForm`→`FormSpec`(+`step`), `PackageDefinition.forms`
- `packages/shared/src/packages/definitions/planning.ts` — `forms`, step 키 인덱싱, step 2 옵셔널 폼 추가
- `packages/shared/src/packages/definitions/develop.ts` — `forms`, step 키 인덱싱
- `packages/shared/src/packages/definitions/freeform.ts` — `forms`, step 키 인덱싱
- `packages/shared/src/packages/index.ts` — `PackageCatalogEntry.forms`, `toCatalogEntry`
- `packages/shared/src/api/work-package.ts` — `workPackageDto.inputs` 중첩, `advanceWorkPackageRequest.inputs?`
- `apps/gateway/src/routes/work-packages.ts` — start/advance 핸들러 폼 해석·검증·병합
- `apps/web/components/work-package-modal.tsx` — 시작 폼을 `forms[step1]` 에서 읽기
- `apps/web/components/tabs/terminal-tab.tsx` — advance 폼 흐름 배선
- `packages/shared/tests/packages.test.ts`, `apps/gateway/tests/work-packages.test.ts`, `apps/web/tests/work-package-modal.test.tsx`, `apps/web/tests/package-picker.test.tsx`, `apps/web/tests/active-package-card.test.tsx` — 새 구조 반영

**생성:**
- `apps/web/components/advance-form-overlay.tsx` — advance 시 mid-run 폼 오버레이
- `apps/web/tests/advance-form-overlay.test.tsx`

**변경 없음(확인):** `package-start-form.tsx`(prop `fields: FieldSpec[]` 유지), `package-picker.tsx`, `step-ready-overlay.tsx`, `active-package-card.tsx`, `lib/gateway-client.ts`(타입만 전파), DB 스키마, progress/artifacts 로직.

---

## Task 1: `FormSpec` 타입 + `PackageDefinition.forms`

**Files:**
- Modify: `packages/shared/src/packages/types.ts:20-23,43-50`

- [ ] **Step 1: `StartForm` 를 `FormSpec` 로 개명하고 `step` 필드 추가**

`packages/shared/src/packages/types.ts` 에서 기존 `StartForm` 인터페이스(20-23행)를 다음으로 교체:

```ts
export interface FormSpec<S extends z.ZodTypeAny = z.ZodTypeAny> {
  /** 이 step 의 프롬프트 주입 직전에 수집한다 (1-based). step:1 = 시작 폼. */
  step: number;
  schema: S;
  fields: FieldSpec[];
}
```

- [ ] **Step 2: `PackageDefinition.startForm` 을 `forms` 로 변경**

같은 파일 43-50행 `PackageDefinition` 의 `startForm: StartForm;` 라인을 다음으로 교체:

```ts
  /** step 당 0~1개. step:1 폼이 시작 폼. */
  forms: FormSpec[];
```

- [ ] **Step 3: 타입 체크 (이 시점엔 정의/소비자 미수정이라 에러 다수 — 정상)**

Run: `pnpm --filter @agent-desk/shared exec tsc --noEmit`
Expected: `definitions/*.ts`, `index.ts` 에서 `startForm` 관련 에러. Task 2~3 에서 해소.

---

## Task 2: 정의 마이그레이션 (planning / develop / freeform)

**Files:**
- Modify: `packages/shared/src/packages/definitions/planning.ts`
- Modify: `packages/shared/src/packages/definitions/develop.ts`
- Modify: `packages/shared/src/packages/definitions/freeform.ts`

- [ ] **Step 1: planning 정의를 `forms` + step 키 인덱싱으로 교체**

`packages/shared/src/packages/definitions/planning.ts` 전체를 다음으로 교체:

```ts
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
```

- [ ] **Step 2: develop 정의를 `forms` + step 키 인덱싱으로 교체**

`packages/shared/src/packages/definitions/develop.ts` 전체를 다음으로 교체:

```ts
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
```

> 참고: `developInputs`/`planningInputs` 라는 기존 export 이름은 사라지고 `developStep1`/`planningStep1` 로 바뀐다. 이 심볼은 `tests/packages.test.ts` 외부에서 사용되지 않음(Task 0 grep 확인). 테스트는 Task 7 에서 갱신.

- [ ] **Step 3: freeform 정의를 `forms` + step 키 인덱싱으로 교체**

`packages/shared/src/packages/definitions/freeform.ts` 전체를 다음으로 교체:

```ts
import { z } from "zod";
import type { PackageDefinition } from "../types";

export const freeformStep1 = z.object({
  prompt: z.string().min(1).max(4000),
});
export type FreeformInputs = { 1: z.infer<typeof freeformStep1> };

/** 줄바꿈은 sendKeys 가 조기 제출을 일으키므로 ` · ` 로 치환 (planning 과 동일 규칙). */
function sanitizePrompt(prompt: string): string {
  return prompt.replace(/\r?\n/g, " · ").trim();
}

export const freeform: PackageDefinition<FreeformInputs> = {
  id: "freeform",
  title: "자유 진행",
  description: "정해진 스킬 없이 원하는 작업 지시를 그대로 세션에 전달합니다.",
  cliRequirement: "any",
  forms: [
    {
      step: 1,
      schema: freeformStep1,
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
  ],
  steps: [
    {
      index: 1,
      title: "Work",
      skillName: "",
      promptTemplate: (inputs) => sanitizePrompt(inputs[1].prompt),
      completionArtifactDir: "docs/superpowers/",
    },
  ],
};
```

- [ ] **Step 4: 타입 체크 (index.ts 만 남은 에러)**

Run: `pnpm --filter @agent-desk/shared exec tsc --noEmit`
Expected: `index.ts:28,38` 의 `startForm` 에러만 남음. Task 3 에서 해소.

---

## Task 3: 카탈로그 — `PackageCatalogEntry.forms` + `toCatalogEntry`

**Files:**
- Modify: `packages/shared/src/packages/index.ts:23-41`

- [ ] **Step 1: `PackageCatalogEntry` 와 `toCatalogEntry` 를 forms 기반으로 교체**

`packages/shared/src/packages/index.ts` 의 23-41행(`PackageCatalogEntry` 인터페이스 ~ `toCatalogEntry` 끝)을 다음으로 교체:

```ts
export interface PackageCatalogEntry {
  id: string;
  title: string;
  description: string;
  cliRequirement: "claude" | "any";
  /** step 별 폼 필드. schema/promptTemplate 는 직렬화 불가하므로 제외. */
  forms: { step: number; fields: PackageDefinition["forms"][number]["fields"] }[];
  stepTitles: string[];
}

export function toCatalogEntry(def: PackageDefinition): PackageCatalogEntry {
  return {
    id: def.id,
    title: def.title,
    description: def.description,
    cliRequirement: def.cliRequirement,
    forms: def.forms.map((f) => ({ step: f.step, fields: f.fields })),
    stepTitles: def.steps.map((s) => s.title),
  };
}
```

- [ ] **Step 2: shared 전체 타입 체크 통과 확인**

Run: `pnpm --filter @agent-desk/shared exec tsc --noEmit`
Expected: 에러 없음. (테스트 파일은 tsc include 범위 밖이거나 vitest 가 별도 처리 — 다음 단계에서 vitest 로 검증)

---

## Task 4: API DTO — 중첩 inputs + advance inputs

**Files:**
- Modify: `packages/shared/src/api/work-package.ts:6-16,38-41`

- [ ] **Step 1: `workPackageDto.inputs` 를 step 키 중첩으로 변경**

`packages/shared/src/api/work-package.ts` 의 `workPackageDto` 정의(6-16행) 중 `inputs` 라인을 교체:

기존:
```ts
  inputs: z.record(z.string(), z.unknown()),
```
변경:
```ts
  inputs: z.record(z.string(), z.record(z.string(), z.unknown())),
```

- [ ] **Step 2: `advanceWorkPackageRequest` 에 옵셔널 `inputs` 추가**

같은 파일 38-41행 `advanceWorkPackageRequest` 를 교체:

```ts
export const advanceWorkPackageRequest = z.object({
  expectedCurrentStep: z.number().int().positive(),
  inputs: z.record(z.string(), z.unknown()).optional(),
});
```

> `startWorkPackageRequest.inputs` 는 평평하게 유지(시작 폼 = step 1 값). 게이트웨이가 `{ "1": ... }` 로 감싼다.

- [ ] **Step 3: shared 빌드 + 테스트 실행 (기존 테스트 일부 red 예상)**

Run: `pnpm --filter @agent-desk/shared build && pnpm --filter @agent-desk/shared test`
Expected: `packages.test.ts` 의 `startForm`/flat-inputs 참조가 FAIL. Task 7 에서 갱신. (빌드는 통과해야 함 — gateway/web 이 `dist` 를 참조)

---

## Task 5: 게이트웨이 start 핸들러 — step 1 폼 해석 + `{ "1": ... }` 저장

**Files:**
- Modify: `apps/gateway/src/routes/work-packages.ts:163,198,233`

- [ ] **Step 1: 시작 폼 검증을 `forms` 기반으로 교체**

`apps/gateway/src/routes/work-packages.ts` 의 163-165행:

```ts
    const inputsParsed = def.startForm.schema.safeParse(parsed.data.inputs);
    if (!inputsParsed.success)
      return c.json({ error: "invalid_inputs" }, 400);
```

을 다음으로 교체:

```ts
    const startForm = def.forms.find((f) => f.step === 1);
    let initialInputs: Record<string, Record<string, unknown>> = {};
    if (startForm) {
      const inputsParsed = startForm.schema.safeParse(parsed.data.inputs);
      if (!inputsParsed.success)
        return c.json({ error: "invalid_inputs" }, 400);
      initialInputs = { 1: inputsParsed.data as Record<string, unknown> };
    }
```

- [ ] **Step 2: promptTemplate 호출 인자를 `initialInputs` 로 교체**

같은 파일 198행:

```ts
    const prompt = def.steps[0].promptTemplate(inputsParsed.data, ctx);
```

을:

```ts
    const prompt = def.steps[0].promptTemplate(initialInputs, ctx);
```

- [ ] **Step 3: `inputsJson` 저장값을 `initialInputs` 로 교체**

같은 파일 233행:

```ts
        inputsJson: JSON.stringify(inputsParsed.data),
```

을:

```ts
        inputsJson: JSON.stringify(initialInputs),
```

- [ ] **Step 4: 게이트웨이 타입 체크**

Run: `pnpm --filter @agent-desk/gateway exec tsc --noEmit`
Expected: advance 핸들러는 아직 `inputsJson` 을 flat 으로 다루지만 `Record<string,unknown>` 캐스팅이라 타입은 통과. 에러 없음.

---

## Task 6: 게이트웨이 advance 핸들러 — 다음 step 폼 검증·병합

**Files:**
- Modify: `apps/gateway/src/routes/work-packages.ts:371-376,417-425`

- [ ] **Step 1: 다음 step 폼 해석 + 입력 병합 로직 추가**

`apps/gateway/src/routes/work-packages.ts` 의 371-376행:

```ts
    const inputs = JSON.parse(row.inputsJson) as Record<string, unknown>;
    const ctx: StepContext = {
      workspacePath: ws.path,
      packageInstanceId: row.id,
    };
    const prompt = nextStep.promptTemplate(inputs, ctx);
```

을 다음으로 교체:

```ts
    const existingInputs = JSON.parse(row.inputsJson) as Record<
      string,
      Record<string, unknown>
    >;
    const nextForm = def.forms.find((f) => f.step === nextStep.index);
    let mergedInputs = existingInputs;
    if (nextForm) {
      const formParsed = nextForm.schema.safeParse(parsed.data.inputs ?? {});
      if (!formParsed.success)
        return c.json({ error: "invalid_inputs" }, 400);
      mergedInputs = {
        ...existingInputs,
        [nextStep.index]: formParsed.data as Record<string, unknown>,
      };
    }
    const ctx: StepContext = {
      workspacePath: ws.path,
      packageInstanceId: row.id,
    };
    const prompt = nextStep.promptTemplate(mergedInputs, ctx);
```

- [ ] **Step 2: advance 시 `inputsJson` 갱신**

같은 파일 417-425행의 `update(workPackages).set({...})` 블록에 `inputsJson` 을 추가:

```ts
    opts.db
      .update(workPackages)
      .set({
        currentStep: nextStep.index,
        advancedAt: t,
        baselineJson: JSON.stringify(recon.newBaseline),
        inputsJson: JSON.stringify(mergedInputs),
      })
      .where(eq(workPackages.id, row.id))
      .run();
```

- [ ] **Step 3: 게이트웨이 타입 체크**

Run: `pnpm --filter @agent-desk/gateway exec tsc --noEmit`
Expected: 에러 없음.

---

## Task 7: shared 테스트 갱신 + mid-run 폼 단위 테스트

**Files:**
- Modify: `packages/shared/tests/packages.test.ts`

- [ ] **Step 1: `startForm`/flat-input 참조를 새 구조로 교체**

`packages/shared/tests/packages.test.ts` 에서 아래 항목들을 교체한다.

import 라인(1-12행)을 다음으로 교체:

```ts
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

const startSchema = (def: typeof planning | typeof develop | typeof freeform) =>
  def.forms.find((f) => f.step === 1)!.schema;
```

`startForm.schema` 를 쓰던 테스트(29-37행)를 교체:

```ts
  it("step1 폼 schema 가 topic 누락을 거부한다", () => {
    const r = startSchema(planning).safeParse({ context: "x" });
    expect(r.success).toBe(false);
  });

  it("step1 폼 schema 가 topic 만 있어도 통과한다", () => {
    const r = startSchema(planning).safeParse({ topic: "test" });
    expect(r.success).toBe(true);
  });
```

step1/step2 promptTemplate 테스트(39-53행)를 교체:

```ts
  it("Step 1 promptTemplate 가 /brainstorming 프롬프트를 만든다", () => {
    const out = planning.steps[0].promptTemplate(
      { 1: { topic: "X", context: "Y" } },
      { workspacePath: "/tmp", packageInstanceId: -1 },
    );
    expect(out).toBe("/brainstorming Topic: X · Context: Y");
  });

  it("Step 2 promptTemplate 가 guidance 없으면 /writing-plans 만 반환한다", () => {
    const out = planning.steps[1].promptTemplate(
      { 1: { topic: "X" } },
      { workspacePath: "/tmp", packageInstanceId: 7 },
    );
    expect(out).toBe("/writing-plans");
  });

  it("Step 2 promptTemplate 가 guidance 있으면 뒤에 붙인다", () => {
    const out = planning.steps[1].promptTemplate(
      { 1: { topic: "X" }, 2: { guidance: "be terse\nuse bullets" } },
      { workspacePath: "/tmp", packageInstanceId: 7 },
    );
    expect(out).toBe("/writing-plans be terse · use bullets");
  });
```

`toCatalogEntry` 테스트(63-68행)를 교체:

```ts
  it("toCatalogEntry 가 schema 를 제거하고 forms·stepTitles 를 펼친다", () => {
    const entry = toCatalogEntry(planning);
    expect(entry.id).toBe("planning");
    expect(entry.stepTitles).toEqual(["Brainstorm", "Write plan"]);
    expect(entry.forms.map((f) => f.step)).toEqual([1, 2]);
    expect(entry.forms[0].fields[0].name).toBe("topic");
    const serialized = JSON.parse(JSON.stringify(entry)) as Record<
      string,
      unknown
    >;
    expect("schema" in (entry.forms[0] as Record<string, unknown>)).toBe(false);
    expect(serialized.forms).toBeTruthy();
  });
```

develop 테스트(83-113행)를 교체:

```ts
  it("planPath 필드가 plans 를 source 로 하는 select 이다", () => {
    const field = develop.forms.find((f) => f.step === 1)!.fields[0];
    expect(field.kind).toBe("select");
    expect(field.optionsSource).toBe("plans");
    expect(field.required).toBe(true);
  });

  it("promptTemplate 가 /executing-plans <planPath> 를 만든다", () => {
    const out = develop.steps[0].promptTemplate(
      { 1: { planPath: "docs/superpowers/plans/2026-05-27-foo.md" } },
      { workspacePath: "/tmp", packageInstanceId: 1 },
    );
    expect(out).toBe("/executing-plans docs/superpowers/plans/2026-05-27-foo.md");
  });

  it("schema 가 plans 디렉토리 밖 경로를 거부한다", () => {
    const schema = startSchema(develop);
    expect(schema.safeParse({ planPath: "../../etc/passwd" }).success).toBe(
      false,
    );
    expect(
      schema.safeParse({ planPath: "docs/superpowers/specs/x.md" }).success,
    ).toBe(false);
    expect(
      schema.safeParse({ planPath: "docs/superpowers/plans/x.md" }).success,
    ).toBe(true);
  });
```

freeform promptTemplate 테스트(124-130행)를 교체:

```ts
  it("promptTemplate 가 prompt 를 그대로 (줄바꿈만 치환) 반환한다", () => {
    const out = freeform.steps[0].promptTemplate(
      { 1: { prompt: "line1\nline2" } },
      { workspacePath: "/tmp", packageInstanceId: 1 },
    );
    expect(out).toBe("line1 · line2");
  });
```

- [ ] **Step 2: planning step 2 폼 존재 단위 테스트 추가**

`describe("planning package completionArtifactDir", ...)` 블록 뒤에 추가:

```ts
describe("planning mid-run form (step 2)", () => {
  it("step 2 에 옵셔널 guidance 폼이 선언돼 있다", () => {
    const form = planning.forms.find((f) => f.step === 2);
    expect(form).toBeTruthy();
    expect(form!.fields[0].name).toBe("guidance");
    expect(form!.fields[0].required).toBeUndefined();
  });

  it("step 2 폼 schema 가 빈 객체를 통과시킨다(옵셔널)", () => {
    const form = planning.forms.find((f) => f.step === 2)!;
    expect(form.schema.safeParse({}).success).toBe(true);
  });

  it("step 2 폼 schema 가 너무 긴 guidance 를 거부한다", () => {
    const form = planning.forms.find((f) => f.step === 2)!;
    expect(
      form.schema.safeParse({ guidance: "x".repeat(2001) }).success,
    ).toBe(false);
  });
});
```

- [ ] **Step 3: shared 테스트 통과 확인**

Run: `pnpm --filter @agent-desk/shared test`
Expected: PASS (all).

---

## Task 8: 게이트웨이 테스트 갱신 + advance 폼 흐름 테스트

**Files:**
- Modify: `apps/gateway/tests/work-packages.test.ts:136-157,320-349`

- [ ] **Step 1: 카탈로그 응답 검증을 forms 기반으로 교체**

`apps/gateway/tests/work-packages.test.ts` 의 `GET /packages` 테스트(132-158행) 본문에서 응답 타입과 develop 검증을 교체:

```ts
  it("planning · develop · freeform 패키지를 반환한다", async () => {
    const res = await fetch(`${url}/packages`, { headers });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      packages: Array<{
        id: string;
        stepTitles: string[];
        forms: Array<{
          step: number;
          fields: Array<{ name: string; kind: string; optionsSource?: string }>;
        }>;
      }>;
    };
    expect(body.packages.map((p) => p.id)).toEqual([
      "freeform",
      "planning",
      "develop",
    ]);
    const planning = body.packages.find((p) => p.id === "planning")!;
    expect(planning.stepTitles).toEqual(["Brainstorm", "Write plan"]);
    expect(planning.forms.map((f) => f.step)).toEqual([1, 2]);
    // develop 의 plan select 필드가 optionsSource 와 함께 직렬화된다
    const develop = body.packages.find((p) => p.id === "develop")!;
    const developStart = develop.forms.find((f) => f.step === 1)!;
    expect(developStart.fields[0]).toMatchObject({
      name: "planPath",
      kind: "select",
      optionsSource: "plans",
    });
  });
```

- [ ] **Step 2: 기존 "step 1 → 2" advance 테스트는 그대로 통과함을 확인**

(코드 변경 없음 — 기존 테스트(320-349행)는 `{ expectedCurrentStep: 1 }` 만 보내고 prompt `"/writing-plans"` 를 기대. planning step 2 폼은 옵셔널이라 입력 없이도 advance 성공 + guidance 없으니 `"/writing-plans"`. 회귀 없음.)

- [ ] **Step 3: mid-run 폼 advance 테스트 블록 추가**

`describe("POST /work-packages/:id/advance", ...)` 블록의 닫는 `});` 바로 다음에 새 describe 를 추가:

```ts
describe("POST /work-packages/:id/advance — mid-run form", () => {
  let advSessionId: number;
  let wpId: number;

  beforeAll(async () => {
    // 기존 활성 인스턴스 정리
    const active = handle.db
      .select()
      .from(workPackages)
      .where(eq(workPackages.status, "active"))
      .get();
    if (active) {
      await fetch(`${url}/work-packages/${active.id}/complete`, {
        method: "POST",
        headers,
        body: JSON.stringify({ outcome: "abandoned" }),
      });
    }
    const s = handle.db
      .insert(sessions)
      .values({
        tmuxName: "ad-wp-adv-form",
        workspaceId,
        cli: "claude",
        args: "",
        status: "active",
        lastActivityAt: Date.now(),
        createdAt: Date.now(),
        adopted: 0,
      })
      .returning()
      .all();
    advSessionId = s[0].id;
    const startRes = await fetch(
      `${url}/sessions/${advSessionId}/work-packages`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          packageId: "planning",
          inputs: { topic: "FORM" },
        }),
      },
    );
    wpId = ((await startRes.json()) as { instance: { id: number } }).instance.id;
  });

  it("start 가 inputsJson 을 { \"1\": ... } 네임스페이스로 저장한다", () => {
    const row = handle.db
      .select()
      .from(workPackages)
      .where(eq(workPackages.id, wpId))
      .get();
    const stored = JSON.parse(row!.inputsJson) as Record<
      string,
      Record<string, unknown>
    >;
    expect(stored["1"]).toMatchObject({ topic: "FORM" });
    expect(stored["2"]).toBeUndefined();
  });

  it("advance + guidance → prompt 에 반영 + inputsJson[\"2\"] 누적", async () => {
    injectFn.mockClear();
    const res = await fetch(`${url}/work-packages/${wpId}/advance`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        expectedCurrentStep: 1,
        inputs: { guidance: "be terse" },
      }),
    });
    expect(res.status).toBe(200);
    const firstCall = injectFn.mock.calls[0][0] as { prompt: string };
    expect(firstCall.prompt).toBe("/writing-plans be terse");

    const row = handle.db
      .select()
      .from(workPackages)
      .where(eq(workPackages.id, wpId))
      .get();
    const stored = JSON.parse(row!.inputsJson) as Record<
      string,
      Record<string, unknown>
    >;
    expect(stored["1"]).toMatchObject({ topic: "FORM" });
    expect(stored["2"]).toMatchObject({ guidance: "be terse" });
  });

  it("폼 schema 위반(과길이 guidance) → 400 invalid_inputs", async () => {
    // 새 인스턴스로 step 1 에서 검증
    const active = handle.db
      .select()
      .from(workPackages)
      .where(eq(workPackages.status, "active"))
      .get();
    if (active) {
      await fetch(`${url}/work-packages/${active.id}/complete`, {
        method: "POST",
        headers,
        body: JSON.stringify({ outcome: "abandoned" }),
      });
    }
    const s = handle.db
      .insert(sessions)
      .values({
        tmuxName: "ad-wp-adv-form-bad",
        workspaceId,
        cli: "claude",
        args: "",
        status: "active",
        lastActivityAt: Date.now(),
        createdAt: Date.now(),
        adopted: 0,
      })
      .returning()
      .all();
    const startRes = await fetch(
      `${url}/sessions/${s[0].id}/work-packages`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({ packageId: "planning", inputs: { topic: "B" } }),
      },
    );
    const badWpId = ((await startRes.json()) as { instance: { id: number } })
      .instance.id;
    const res = await fetch(`${url}/work-packages/${badWpId}/advance`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        expectedCurrentStep: 1,
        inputs: { guidance: "x".repeat(2001) },
      }),
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_inputs");
  });
});
```

> 새 describe 가 끝나면 active 인스턴스가 남는다. 이 파일의 뒤쪽 describe(complete/scan/list/freeform)는 각자 새 세션을 만들고 시작 전 active 를 abandon 하므로 충돌하지 않는다(기존 패턴과 동일).

- [ ] **Step 4: 게이트웨이 테스트 통과 확인**

Run: `pnpm --filter @agent-desk/gateway test work-packages`
Expected: PASS (all in work-packages.test.ts).

---

## Task 9: web — `WorkPackageModal` 을 forms 기반으로

**Files:**
- Modify: `apps/web/components/work-package-modal.tsx:46-47,107-108`
- Modify: `apps/web/tests/work-package-modal.test.tsx:6-38`
- Modify: `apps/web/tests/package-picker.test.tsx:6-30`

- [ ] **Step 1: 모달 테스트 픽스처를 forms 로 (먼저 red)**

`apps/web/tests/work-package-modal.test.tsx` 의 `planning`/`develop` 픽스처(6-38행)를 교체:

```ts
const planning: PackageCatalogEntry = {
  id: "planning",
  title: "기획",
  description: "test",
  cliRequirement: "claude",
  forms: [
    {
      step: 1,
      fields: [
        {
          name: "topic",
          label: "Topic",
          kind: "text",
          required: true,
          maxLength: 100,
        },
      ],
    },
  ],
  stepTitles: ["Brainstorm", "Write plan"],
};

const develop: PackageCatalogEntry = {
  id: "develop",
  title: "구현",
  description: "executing-plans",
  cliRequirement: "claude",
  forms: [
    {
      step: 1,
      fields: [
        {
          name: "planPath",
          label: "Plan document",
          kind: "select",
          required: true,
          optionsSource: "plans",
        },
      ],
    },
  ],
  stepTitles: ["Execute plan"],
};
```

- [ ] **Step 2: package-picker 테스트 픽스처도 forms 로**

`apps/web/tests/package-picker.test.tsx` 의 `planning`/`develop`/`freeform` 픽스처(6-30행 부근)에서 각 객체의 `fields: [...]` 속성을 `forms: [{ step: 1, fields: [...] }]` 로 감싼다. 예(`planning`):

```ts
const planning: PackageCatalogEntry = {
  id: "planning",
  title: "기획",
  description: "test",
  cliRequirement: "claude",
  forms: [{ step: 1, fields: [{ name: "topic", label: "Topic", kind: "text" }] }],
  stepTitles: ["Brainstorm", "Write plan"],
};
```

`develop`/`freeform` 도 동일하게 기존 `fields` 배열을 `forms: [{ step: 1, fields: <기존배열> }]` 로 치환. (picker 는 `forms` 를 읽지 않지만 타입을 만족시켜야 한다.)

- [ ] **Step 3: 모달 컴포넌트를 forms 기반으로 수정**

`apps/web/components/work-package-modal.tsx` 의 46-47행:

```ts
    const pkg = props.packages.find((p) => p.id === selectedId);
    const dynamicFields = pkg?.fields.filter((f) => f.optionsSource) ?? [];
```

을:

```ts
    const pkg = props.packages.find((p) => p.id === selectedId);
    const startFields =
      pkg?.forms.find((f) => f.step === 1)?.fields ?? [];
    const dynamicFields = startFields.filter((f) => f.optionsSource);
```

그리고 107-108행 `<PackageStartForm fields={selected.fields} ...>` 의 `fields` prop 을 교체:

```ts
          <PackageStartForm
            fields={selected.forms.find((f) => f.step === 1)?.fields ?? []}
```

- [ ] **Step 4: web 테스트(modal/picker) 통과 확인**

Run: `pnpm --filter web test work-package-modal package-picker`
Expected: PASS.

---

## Task 10: web — `AdvanceFormOverlay` 컴포넌트

**Files:**
- Create: `apps/web/components/advance-form-overlay.tsx`
- Create: `apps/web/tests/advance-form-overlay.test.tsx`

- [ ] **Step 1: 실패 테스트 작성**

`apps/web/tests/advance-form-overlay.test.tsx` 생성:

```tsx
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { FieldSpec } from "@agent-desk/shared";
import { AdvanceFormOverlay } from "../components/advance-form-overlay";

const fields: FieldSpec[] = [
  { name: "guidance", label: "Plan guidance", kind: "textarea", maxLength: 100 },
];

describe("<AdvanceFormOverlay>", () => {
  it("필드를 렌더하고 제출 시 onSubmit(inputs) 호출", async () => {
    const onSubmit = vi.fn();
    render(
      <AdvanceFormOverlay
        nextStepTitle="Write plan"
        fields={fields}
        onSubmit={onSubmit}
        onCancel={() => {}}
      />,
    );
    fireEvent.change(screen.getByLabelText(/Plan guidance/i), {
      target: { value: "be terse" },
    });
    fireEvent.submit(screen.getByRole("form"));
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({ guidance: "be terse" }),
    );
  });

  it("빈 입력으로도 제출 가능(옵셔널 필드)", async () => {
    const onSubmit = vi.fn();
    render(
      <AdvanceFormOverlay
        nextStepTitle="Write plan"
        fields={fields}
        onSubmit={onSubmit}
        onCancel={() => {}}
      />,
    );
    fireEvent.submit(screen.getByRole("form"));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({}));
  });

  it("Skip 클릭 시 onCancel 호출", () => {
    const onCancel = vi.fn();
    render(
      <AdvanceFormOverlay
        nextStepTitle="Write plan"
        fields={fields}
        onSubmit={() => {}}
        onCancel={onCancel}
      />,
    );
    // AdvanceFormOverlay 는 PackageStartForm 의 "Back"/"Skip" 버튼을 둘 다 onCancel 로 연결한다.
    fireEvent.click(screen.getByRole("button", { name: /Skip/i }));
    expect(onCancel).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm --filter web test advance-form-overlay`
Expected: FAIL — `Cannot find module '../components/advance-form-overlay'`.

- [ ] **Step 3: 컴포넌트 구현**

`apps/web/components/advance-form-overlay.tsx` 생성. `PackageStartForm` 을 재사용하고 step-ready 와 같은 floating-label 카드 스타일을 두른다:

```tsx
"use client";
import type { FieldSpec } from "@agent-desk/shared";
import { PackageStartForm } from "./package-start-form";

export function AdvanceFormOverlay(props: {
  nextStepTitle: string;
  fields: FieldSpec[];
  busy?: boolean;
  errorMessage?: string | null;
  optionsByField?: Record<string, string[]>;
  optionsLoading?: boolean;
  onSubmit: (inputs: Record<string, string>) => void | Promise<void>;
  onCancel: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Next step form"
      className="absolute inset-0 z-20 flex items-center justify-center bg-[rgba(26,18,8,0.32)] backdrop-blur-sm"
    >
      <div className="flex w-full max-w-lg flex-col gap-3">
        <div className="flex items-baseline justify-between gap-2 px-1 text-white drop-shadow-[0_1px_2px_rgba(26,18,8,0.6)]">
          <h2 className="text-[10px] font-semibold uppercase tracking-[0.24em]">
            Next step — {props.nextStepTitle}
          </h2>
          <span className="text-[10px] uppercase tracking-[0.22em] opacity-75">
            form
          </span>
        </div>
        <PackageStartForm
          fields={props.fields}
          busy={props.busy}
          errorMessage={props.errorMessage}
          submitLabel="다음 단계로"
          optionsByField={props.optionsByField}
          optionsLoading={props.optionsLoading}
          onBack={props.onCancel}
          onDismiss={props.onCancel}
          onSubmit={props.onSubmit}
        />
      </div>
    </div>
  );
}
```

> `PackageStartForm` 의 "Skip" 버튼(`onDismiss`)과 "Back" 버튼(`onBack`)을 둘 다 `onCancel` 로 연결한다(이 오버레이엔 picker 로 돌아갈 곳이 없으므로 둘 다 취소로 동작).

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm --filter web test advance-form-overlay`
Expected: PASS.

---

## Task 11: web — `terminal-tab` advance 폼 흐름 배선

**Files:**
- Modify: `apps/web/components/tabs/terminal-tab.tsx` (imports, state, handleAdvance, requestAdvance, overlay 렌더, StepReadyOverlay/ActivePackageCard onAdvance)

- [ ] **Step 1: import 추가**

`apps/web/components/tabs/terminal-tab.tsx` 상단 import 들에 추가(14-17행 부근, `StepReadyOverlay` import 옆):

```ts
import { AdvanceFormOverlay } from "../advance-form-overlay";
import type { FieldSpec } from "@agent-desk/shared";
```

- [ ] **Step 2: advance 폼 상태 추가**

`const [packages, setPackages] = useState<PackageCatalogEntry[]>([]);`(31행) 아래에 상태 추가:

```ts
  const [advanceForm, setAdvanceForm] = useState<{
    expectedCurrentStep: number;
    nextStepTitle: string;
    fields: FieldSpec[];
  } | null>(null);
  const [advanceOptions, setAdvanceOptions] = useState<
    Record<string, string[]>
  >({});
  const [advanceOptionsLoading, setAdvanceOptionsLoading] = useState(false);
```

- [ ] **Step 3: `handleAdvance` 가 inputs 를 받도록 확장**

기존 `handleAdvance`(223-240행)를 교체:

```ts
  const handleAdvance = useCallback(
    async (
      expectedCurrentStep: number,
      inputs?: Record<string, unknown>,
    ) => {
      if (activeWp == null) return;
      setWpBusy(true);
      try {
        const res = await gateway.workPackages.advance(activeWp.id, {
          expectedCurrentStep,
          ...(inputs ? { inputs } : {}),
        });
        setActiveWp(res.instance);
        await refreshArtifacts(activeWp.id);
      } catch {
        // V1: silent (UI stale 만)
      } finally {
        setWpBusy(false);
      }
    },
    [activeWp, refreshArtifacts],
  );
```

- [ ] **Step 4: `requestAdvance` 추가 — 다음 step 폼 유무 판단**

`handleAdvance` 정의 바로 아래에 추가:

```ts
  const requestAdvance = useCallback(
    async (expectedCurrentStep: number) => {
      const nextStepIndex = expectedCurrentStep + 1;
      const form = activePackageDef?.forms.find(
        (f) => f.step === nextStepIndex,
      );
      if (!form) {
        await handleAdvance(expectedCurrentStep);
        return;
      }
      // 폼이 있으면 동적 옵션 로드 후 오버레이 표시
      setAdvanceOptions({});
      const dynamic = form.fields.filter((f) => f.optionsSource);
      if (dynamic.length > 0) {
        setAdvanceOptionsLoading(true);
        const acc: Record<string, string[]> = {};
        for (const f of dynamic) {
          try {
            acc[f.name] = await loadOptions(f.optionsSource!);
          } catch {
            acc[f.name] = [];
          }
        }
        setAdvanceOptions(acc);
        setAdvanceOptionsLoading(false);
      }
      setAdvanceForm({
        expectedCurrentStep,
        nextStepTitle:
          activePackageDef?.stepTitles[nextStepIndex - 1] ?? "",
        fields: form.fields,
      });
    },
    [activePackageDef, handleAdvance, loadOptions],
  );
```

> `activePackageDef` 는 현재 285행에서 `return` 직전에 계산된다. `requestAdvance`/렌더가 이를 참조하려면 **`activePackageDef` 계산을 이 콜백들보다 위로 올린다**(Step 5).

- [ ] **Step 5: `activePackageDef` 계산을 콜백 위로 이동**

283-286행의

```ts
  const selectedSession = sessions.find((s) => s.id === selectedSessionId);
  const activePackageDef = activeWp
    ? packages.find((p) => p.id === activeWp.packageId)
    : null;
```

중 `activePackageDef` 정의를 잘라내어, `handleAdvance` 정의(223행) **바로 위**로 옮긴다. (`selectedSession` 은 그대로 둔다.) 즉 콜백들이 `activePackageDef` 를 클로저로 참조할 수 있게 한다.

- [ ] **Step 6: StepReadyOverlay 와 ActivePackageCard 의 advance 진입점을 `requestAdvance` 로 교체**

StepReadyOverlay onAdvance(305-309행):

```ts
          onAdvance={async () => {
            const event = stepReadyEvent;
            setStepReadyEvent(null);
            await requestAdvance(event.stepIndex);
          }}
```

ActivePackageCard onAdvance(351행):

```ts
            onAdvance={requestAdvance}
```

- [ ] **Step 7: AdvanceFormOverlay 렌더 추가**

`{stepReadyEvent && activeWp && ( ... )}` 블록(296-315행) 바로 뒤에 추가:

```tsx
      {advanceForm && (
        <AdvanceFormOverlay
          nextStepTitle={advanceForm.nextStepTitle}
          fields={advanceForm.fields}
          busy={wpBusy}
          optionsByField={advanceOptions}
          optionsLoading={advanceOptionsLoading}
          onSubmit={async (inputs) => {
            const ctx = advanceForm;
            setAdvanceForm(null);
            await handleAdvance(ctx.expectedCurrentStep, inputs);
          }}
          onCancel={() => setAdvanceForm(null)}
        />
      )}
```

- [ ] **Step 8: web 타입 체크 + 전체 web 테스트**

Run: `pnpm --filter web exec tsc --noEmit && pnpm --filter web test`
Expected: PASS (타입 에러 없음, 모든 테스트 통과).

---

## Task 12: web — `active-package-card` 테스트 픽스처 inputs 갱신

**Files:**
- Modify: `apps/web/tests/active-package-card.test.tsx:12`

- [ ] **Step 1: `inputs` 를 step 키 중첩으로 교체**

`apps/web/tests/active-package-card.test.tsx` 12행:

```ts
  inputs: { topic: "T" },
```

을:

```ts
  inputs: { "1": { topic: "T" } },
```

- [ ] **Step 2: 테스트 통과 확인**

Run: `pnpm --filter web test active-package-card`
Expected: PASS.

---

## Task 13: 전체 워크스페이스 검증 (fresh run)

**Files:** (없음 — 검증 전용)

- [ ] **Step 1: 전체 타입 체크**

Run: `pnpm typecheck`
Expected: 에러 없음. (pre-existing 결함이 있으면 우리 변경과 무관함을 확인 후 별도 보고)

- [ ] **Step 2: 전체 테스트**

Run: `pnpm test`
Expected: 모든 워크스페이스 PASS.

- [ ] **Step 3: 수동 UI 확인(가능 시)**

dev 서버를 띄워 planning 패키지를 시작 → step 1(brainstorming) 산출물 생성 → step_ready 오버레이에서 "다음 단계로" → **AdvanceFormOverlay(Plan guidance)** 가 뜨는지, 입력/빈 제출 모두 advance 되는지, develop 패키지 시작 모달이 정상인지 확인. UI 확인이 불가하면 그 사실을 명시적으로 보고한다.

---

## Task 14: 커밋 (⚠️ 사용자 검토·승인 후에만)

**Files:** (없음 — git 작업)

> `agent-desk/CLAUDE.md` 정책: 사용자 승인 전에는 절대 커밋하지 않는다. 아래는 승인 후 실행.

- [ ] **Step 1: shared + gateway 커밋**

```bash
git -C /workspaces/owngo/agent-desk add \
  packages/shared/src/packages/types.ts \
  packages/shared/src/packages/definitions/planning.ts \
  packages/shared/src/packages/definitions/develop.ts \
  packages/shared/src/packages/definitions/freeform.ts \
  packages/shared/src/packages/index.ts \
  packages/shared/src/api/work-package.ts \
  packages/shared/tests/packages.test.ts \
  apps/gateway/src/routes/work-packages.ts \
  apps/gateway/tests/work-packages.test.ts
git -C /workspaces/owngo/agent-desk commit -m "$(cat <<'EOF'
feat: shared·gateway — PackageDefinition.forms 로 일반화, step별 mid-run 폼 지원

startForm 을 forms: FormSpec[] 로 바꾸고 각 폼을 step 에 바인딩.
입력은 step 키 네임스페이스로 누적({ "1":..., "2":... }).
advance 시 다음 step 에 폼이 있으면 검증·병합 후 주입.

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 2: web 커밋**

```bash
git -C /workspaces/owngo/agent-desk add \
  apps/web/components/work-package-modal.tsx \
  apps/web/components/advance-form-overlay.tsx \
  apps/web/components/tabs/terminal-tab.tsx \
  apps/web/tests/work-package-modal.test.tsx \
  apps/web/tests/package-picker.test.tsx \
  apps/web/tests/active-package-card.test.tsx \
  apps/web/tests/advance-form-overlay.test.tsx
git -C /workspaces/owngo/agent-desk commit -m "$(cat <<'EOF'
feat: web — 시작 폼 forms 기반 + advance 시 mid-run 폼 오버레이

WorkPackageModal 이 forms[step1] 에서 시작 폼을 읽는다.
다음 step 에 폼이 선언돼 있으면 AdvanceFormOverlay 로 수집 후 advance.

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 3: docs 커밋 (spec + plan)**

```bash
git -C /workspaces/owngo/agent-desk add \
  docs/superpowers/specs/2026-05-29-package-forms-mid-run-design.md \
  docs/superpowers/plans/2026-05-29-package-forms-mid-run.md
git -C /workspaces/owngo/agent-desk commit -m "$(cat <<'EOF'
docs: package forms (mid-run) spec + 구현 플랜

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: owngo 서브모듈 pointer bump**

```bash
git -C /workspaces/owngo add agent-desk
git -C /workspaces/owngo commit -m "$(cat <<'EOF'
chore: agent-desk 서브모듈 갱신 — PackageDefinition.forms + mid-run 폼

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 5: 커밋 확인**

Run: `git -C /workspaces/owngo/agent-desk log --oneline -3 && git -C /workspaces/owngo log --oneline -1`
Expected: 위 커밋들이 보임.

---

## Self-Review 메모

- **Spec 커버리지:** §3 타입(Task 1) · §4 정의(Task 2) · §5 카탈로그·DTO(Task 3,4) · §6 게이트웨이(Task 5,6) · §7 web(Task 9,10,11,12) · §8 테스트(Task 7,8,10,12,13) — 모두 매핑됨.
- **Placeholder:** 없음(모든 코드/명령/기대 출력 명시).
- **타입 일관성:** `FormSpec.step`, `forms`, `inputs[step]`(string 키 런타임/numeric 타입 호환), `PackageCatalogEntry.forms`, `advanceWorkPackageRequest.inputs?`, `handleAdvance(step, inputs?)`, `requestAdvance(step)` — Task 간 명칭 일치.
- **위험:** `terminal-tab` 의 `activePackageDef` 위치 이동(Task 11 Step 5)을 빠뜨리면 `requestAdvance`/렌더가 미정의 참조 → 타입 에러로 즉시 드러남(Task 11 Step 8).
- **회귀 안전:** planning step 2 폼은 옵셔널이라 기존 "입력 없는 advance" 흐름·테스트가 그대로 통과.
