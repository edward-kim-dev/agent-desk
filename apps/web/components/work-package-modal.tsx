"use client";
import { useEffect, useState } from "react";
import type {
  PackageCatalogEntry,
  StartWorkPackageRequest,
} from "@agent-desk/shared";
import { PackagePicker } from "./package-picker";
import { PackageStartForm } from "./package-start-form";

export function WorkPackageModal(props: {
  open: boolean;
  packages: PackageCatalogEntry[];
  sessionCli: string;
  busy?: boolean;
  errorMessage?: string | null;
  /** `optionsSource` 가 있는 select 필드의 옵션을 동적으로 가져온다. */
  loadOptions?: (source: string) => Promise<string[]>;
  onStart: (body: StartWorkPackageRequest) => void | Promise<void>;
  onDismiss: () => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [optionsByField, setOptionsByField] = useState<
    Record<string, string[]>
  >({});
  const [optionsLoading, setOptionsLoading] = useState(false);

  useEffect(() => {
    if (!props.open) setSelectedId(null);
  }, [props.open]);

  useEffect(() => {
    if (!props.open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") props.onDismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [props.open, props]);

  const loadOptions = props.loadOptions;
  useEffect(() => {
    if (selectedId == null) {
      setOptionsByField({});
      return;
    }
    const pkg = props.packages.find((p) => p.id === selectedId);
    const startFields =
      pkg?.forms.find((f) => f.step === 1)?.fields ?? [];
    const dynamicFields = startFields.filter((f) => f.optionsSource);
    if (dynamicFields.length === 0 || !loadOptions) {
      setOptionsByField({});
      return;
    }
    let cancelled = false;
    setOptionsLoading(true);
    setOptionsByField({});
    void (async () => {
      const acc: Record<string, string[]> = {};
      for (const f of dynamicFields) {
        try {
          acc[f.name] = await loadOptions(f.optionsSource!);
        } catch {
          acc[f.name] = [];
        }
      }
      if (!cancelled) {
        setOptionsByField(acc);
        setOptionsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedId, props.packages, loadOptions]);

  if (!props.open) return null;
  const selected = selectedId
    ? (props.packages.find((p) => p.id === selectedId) ?? null)
    : null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="work-package-title"
      className="absolute inset-0 z-20 flex items-center justify-center bg-[rgba(26,18,8,0.32)] backdrop-blur-sm"
    >
      <div className="flex w-full max-w-lg flex-col gap-3">
        <div className="flex items-baseline justify-between gap-2 px-1 text-white drop-shadow-[0_1px_2px_rgba(26,18,8,0.6)]">
          <h2
            id="work-package-title"
            className="text-[10px] font-semibold uppercase tracking-[0.24em]"
          >
            Work package — {selected ? selected.title : "select"}
          </h2>
          {selected && (
            <span className="text-[10px] uppercase tracking-[0.22em] opacity-75">
              {selected.id}
            </span>
          )}
        </div>
        {!selected ? (
          <PackagePicker
            packages={props.packages}
            sessionCli={props.sessionCli}
            onSelect={setSelectedId}
          />
        ) : (
          <PackageStartForm
            fields={selected.forms.find((f) => f.step === 1)?.fields ?? []}
            busy={props.busy}
            errorMessage={props.errorMessage}
            optionsByField={optionsByField}
            optionsLoading={optionsLoading}
            onBack={() => setSelectedId(null)}
            onDismiss={props.onDismiss}
            onSubmit={async (inputs) => {
              await props.onStart({ packageId: selected.id, inputs });
            }}
          />
        )}
      </div>
    </div>
  );
}
