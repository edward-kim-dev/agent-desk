import type { PackageDefinition } from "./types";
import { planning } from "./definitions/planning";

export * from "./types";
export * from "./format-prompt";
export { planning };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyPackageDefinition = PackageDefinition<any>;

export const PACKAGES: Record<string, AnyPackageDefinition> = {
  [planning.id]: planning,
};

export function getPackage(id: string): AnyPackageDefinition | undefined {
  return PACKAGES[id];
}

export interface PackageCatalogEntry {
  id: string;
  title: string;
  description: string;
  cliRequirement: "claude" | "any";
  fields: PackageDefinition["startForm"]["fields"];
  stepTitles: string[];
}

export function toCatalogEntry(def: PackageDefinition): PackageCatalogEntry {
  return {
    id: def.id,
    title: def.title,
    description: def.description,
    cliRequirement: def.cliRequirement,
    fields: def.startForm.fields,
    stepTitles: def.steps.map((s) => s.title),
  };
}
