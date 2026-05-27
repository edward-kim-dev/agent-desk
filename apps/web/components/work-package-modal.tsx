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
  onStart: (body: StartWorkPackageRequest) => void | Promise<void>;
  onDismiss: () => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

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
        <div className="flex items-baseline justify-between gap-2 px-1">
          <h2
            id="work-package-title"
            className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[#1a1208]"
          >
            Work package — {selected ? selected.title : "select"}
          </h2>
          {selected && (
            <span className="text-[10px] uppercase tracking-[0.22em] opacity-40">
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
            fields={selected.fields}
            busy={props.busy}
            errorMessage={props.errorMessage}
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
