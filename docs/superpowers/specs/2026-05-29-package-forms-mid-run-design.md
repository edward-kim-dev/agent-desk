# Package Forms (mid-run) — Design Spec

**Date:** 2026-05-29  
**Status:** Approved  
**Plan:** (TBD — writing-plans 단계에서 작성)

---

## 1. 문제

`PackageDefinition` 은 폼을 **하나**(`startForm`)만 가진다. 이 폼은 step 1 주입 직전 단 한 번 수집되고, 그 입력(`inputsJson`)이 이후 모든 step 의 `promptTemplate(inputs)` 로 전달된다. 즉 패키지가 시작되고 나면 사용자에게 추가 입력을 받을 지점이 없다.

여러 step 으로 구성된 패키지에서, 후속 step 이 시작되기 전에 사용자 입력이 필요한 경우(예: 앞 step 산출물을 본 뒤 다음 step 의 방향/옵션을 고르는 경우)를 표현할 수 없다.

### 목표

1. `PackageDefinition.startForm` 을 `forms` 로 바꿔, 폼을 step 에 바인딩되는 **컬렉션**으로 일반화한다.
2. step 의 프롬프트가 주입되기 **직전에** 그 step 에 선언된 폼을 노출·수집한다 (정적 선언 모델).
3. start form 은 "step 1 에 바인딩된 폼" 으로 자연스럽게 흡수된다 — 시작 폼과 mid-run 폼이 같은 메커니즘을 공유한다.

### 비목표 (YAGNI)

- 실행 중인 CLI 에이전트가 런타임에 폼을 **요청**하는 동적 모델(새 hook, 요청/응답 correlation)은 범위 밖. 추후 별도 검토.
- 한 step 에 2개 이상의 폼. step 당 최대 1개로 제한한다.
- DB 스키마 변경 없음. `inputsJson` 은 이미 `text` 컬럼이므로 직렬화 형태만 바뀐다.

---

## 2. 설계 결정

### 2.1 트리거 — step 에 정적 선언

폼은 `PackageDefinition` 에 정적으로 선언되며, 각 폼은 자신이 게이트하는 step 번호(`step`)를 가진다. 게이트웨이는 그 step 의 프롬프트를 주입하기 직전에 폼을 수집한다.

```
step N 프롬프트 주입 직전:
  forms 에 step===N 폼이 있으면 → 수집(검증) → 누적 저장 → 그 다음 주입
  없으면 → 입력 수집 없이 바로 주입
```

- step 1 폼 = 기존 start form. 시작 시(POST `/work-packages`) 수집.
- step N(>1) 폼 = mid-run 폼. advance 시(POST `/work-packages/:id/advance`) 수집.

step 완료 감지(`completionArtifactDir` → `step_ready` WebSocket)는 **변경 없음**. 폼은 advance 전환 구간에만 끼어든다.

### 2.2 입력 병합 — step 별 네임스페이스

수집한 입력은 step 번호를 키로 하는 레코드에 누적한다.

```jsonc
// inputsJson 예 (step 2 까지 진행한 패키지)
{
  "1": { "topic": "...", "context": "..." },   // step 1 폼
  "2": { "reviewNotes": "...", "priority": "..." } // step 2 폼
}
```

- `promptTemplate(inputs, ctx)` 의 `inputs` 는 "지금까지 수집된 모든 폼" 을 step 키로 가진 레코드. step N 템플릿은 `inputs[1]`, `inputs[N]` 등으로 필요한 값을 꺼낸다.
- 장점: 폼 간 필드명 충돌 불가, 어떤 입력이 어느 step 에서 들어왔는지 명확.
- JSON 직렬화로 키는 문자열이 되지만(`"1"`), JS 객체 인덱싱(`inputs[1]`)은 런타임에 문자열로 강제되어 동일하게 동작한다.

---

## 3. 타입 변경 — `packages/shared/src/packages/types.ts`

`StartForm` 을 `FormSpec` 으로 개명하고 `step` 바인딩을 추가. `PackageDefinition.startForm` → `forms: FormSpec[]`.

```ts
export interface FormSpec<S extends z.ZodTypeAny = z.ZodTypeAny> {
  /** 이 step 의 프롬프트 주입 직전에 수집 (1-based). step:1 = 시작 폼. */
  step: number;
  schema: S;
  fields: FieldSpec[];
}

export interface PackageDefinition<I = unknown> {
  id: string;
  title: string;
  description: string;
  cliRequirement: "claude" | "any";
  /** step 당 0~1개. step:1 폼이 시작 폼. */
  forms: FormSpec[];
  steps: StepDefinition<I>[];
}
```

- `FieldSpec`, `StepContext`, `StepDefinition` 시그니처는 그대로.
- `StepDefinition.promptTemplate(inputs: I, ctx)` 의 `I` 의미가 "step 키로 누적된 입력 레코드" 로 바뀐다.
- 불변식: 한 step 에 폼은 최대 1개. 폼 없는 step 은 입력 수집 없이 주입.
- 폼 해석 헬퍼: `forms.find(f => f.step === N)`.

---

## 4. 정의 마이그레이션 — `packages/shared/src/packages/definitions/`

세 패키지 모두 `startForm: {...}` → `forms: [{ step: 1, ...기존 schema/fields }]`. 템플릿은 입력을 step 키로 인덱싱하도록 수정한다.

| 패키지 | 변경 |
|--------|------|
| planning | step1 `(inputs) => formatBrainstormingPrompt(inputs[1])`. step2 는 입력 미사용 — 그대로. |
| develop | `(inputs) => "/executing-plans " + inputs[1].planPath` |
| freeform | `inputs[1].prompt` 인덱싱 |

- `format-prompt.ts`(`formatBrainstormingPrompt`)는 평평한 객체를 받으므로 **변경 없음** — 템플릿에서 `inputs[1]` 을 넘긴다.
- 입력 타입(`PlanningInputs` 등)은 step 키 레코드로 재정의. 예: `type PlanningInputs = { 1: z.infer<typeof planningStep1> }`.
- 현 시점에 mid-run 폼을 가진 패키지는 없다(구조만 마련). 검증용 mid-run 폼 패키지 추가 여부는 플랜 단계에서 결정.

---

## 5. 카탈로그 + DTO — `index.ts`, `api/work-package.ts`

`schema`/`promptTemplate` 는 직렬화 불가하므로 웹에는 `step + fields` 만 전달한다.

```ts
// PackageCatalogEntry: fields → forms
export interface PackageCatalogEntry {
  id: string;
  title: string;
  description: string;
  cliRequirement: "claude" | "any";
  forms: { step: number; fields: FieldSpec[] }[]; // fields 대체
  stepTitles: string[];
}

// toCatalogEntry: forms 매핑
forms: def.forms.map((f) => ({ step: f.step, fields: f.fields })),
```

```ts
// workPackageDto.inputs: 평평 → step 별 중첩
inputs: z.record(z.string(), z.record(z.string(), z.unknown())), // { "1": {...}, "2": {...} }

// advanceWorkPackageRequest: 다음 step 폼 입력 추가
export const advanceWorkPackageRequest = z.object({
  expectedCurrentStep: z.number().int().positive(),
  inputs: z.record(z.string(), z.unknown()).optional(),
});
```

---

## 6. 게이트웨이 흐름 — `apps/gateway/src/routes/work-packages.ts`

### 6.1 start (`POST /sessions/:id/work-packages`)

- 현 `def.startForm.schema.safeParse(...)` (L163) →
  `const startForm = def.forms.find(f => f.step === 1)` 로 schema 해석.
- 검증 통과 시 `inputsJson = JSON.stringify({ "1": validated })`.
- `promptTemplate({ "1": validated }, ctx)` 로 step 1 프롬프트 생성.
- step 1 폼이 없는 패키지(현재 없음)는 `inputsJson = "{}"` 로 시작.

### 6.2 advance (`POST /work-packages/:id/advance`)

- `nextStep = def.steps[row.currentStep]` (기존).
- `const nextForm = def.forms.find(f => f.step === nextStep.index)`.
- `existing = JSON.parse(row.inputsJson)`.
- `nextForm` 있으면:
  - `body.inputs` 를 `nextForm.schema` 로 검증. 누락/실패 → `invalid_inputs` 400.
  - `merged = { ...existing, [nextStep.index]: validated }`, `inputsJson` 갱신.
- `nextForm` 없으면: `merged = existing` (입력 무시, 기존 동작).
- `prompt = nextStep.promptTemplate(merged, ctx)` → 주입 → 기존 advance 후처리.

### 6.3 불변

- `step_ready` / `completionArtifactDir` / artifact reconcile 로직 변경 없음.
- DB 스키마 변경 없음.

---

## 7. 웹 흐름 — `apps/web/`

- `components/work-package-modal.tsx`: 시작 폼 필드를 `entry.forms` 에서 step 1 폼으로 읽는다(기존 `entry.fields` 대체). `optionsSource` 동적 로딩 로직 재사용.
- advance UI(`step-ready-overlay.tsx` / `active-package-card.tsx`): advance 시 다음 step 에 폼이 있으면 `package-start-form.tsx` 를 **그대로 재사용**해 폼 렌더 → 입력 수집(필요 시 `optionsSource` fetch) → `advance({ expectedCurrentStep, inputs })`. 폼 없으면 기존처럼 바로 advance.
- `lib/gateway-client.ts`: `advance` 가 optional `inputs` 를 body 로 전달.
- `WorkPackageDto.inputs` 를 읽는 소비자가 있으면 중첩 구조에 맞게 갱신.

---

## 8. 테스트

- **shared:** 정의가 새 `forms` 형태 통과. step 키 인덱싱 템플릿 출력 확인. `toCatalogEntry` 가 `forms` 노출.
- **gateway:**
  - start 가 `inputsJson = { "1": ... }` 저장.
  - advance 가 다음 step 폼을 검증·병합(`{ "1":..., "2":... }`).
  - 폼 필수 step 인데 `inputs` 누락/검증 실패 → 400.
  - 폼 없는 step 은 `inputs` 없이 advance 성공.
- **web:** 시작 모달이 forms[step1] 렌더. advance 폼 흐름(기존 컴포넌트 재사용)이 입력을 advance 로 전달.

---

## 9. 영향 범위 요약

| 레이어 | 파일 | 변경 |
|--------|------|------|
| shared 타입 | `packages/types.ts` | `StartForm`→`FormSpec`(+`step`), `startForm`→`forms` |
| shared 정의 | `definitions/{planning,develop,freeform}.ts` | `forms:[{step:1,...}]`, 템플릿 step 키 인덱싱 |
| shared 카탈로그 | `packages/index.ts` | `PackageCatalogEntry.fields`→`forms`, `toCatalogEntry` |
| shared DTO | `api/work-package.ts` | `workPackageDto.inputs` 중첩, `advanceWorkPackageRequest.inputs?` |
| gateway | `routes/work-packages.ts` | start/advance 핸들러 폼 해석·검증·병합 |
| web | `components/*`, `lib/gateway-client.ts` | 시작 모달 forms, advance 폼 흐름, client inputs |

step_ready/artifact/DB 스키마는 변경 없음.
