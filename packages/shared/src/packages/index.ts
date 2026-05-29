import type { PackageDefinition } from "./types";
import { planning } from "./definitions/planning";
import { develop } from "./definitions/develop";
import { freeform } from "./definitions/freeform";

export * from "./types";
export * from "./format-prompt";
export { planning, develop, freeform };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyPackageDefinition = PackageDefinition<any>;

export const PACKAGES: Record<string, AnyPackageDefinition> = {
  [freeform.id]: freeform,
  [planning.id]: planning,
  [develop.id]: develop,
};

export function getPackage(id: string): AnyPackageDefinition | undefined {
  return PACKAGES[id];
}

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
