"use client";
import { useId, useState } from "react";
import { gateway } from "@/lib/gateway-client";
import { Field, fieldControl } from "./ui/field";
import { btnPrimary } from "./ui/button-classes";

export interface SoftDeleteConflict {
  id: number;
  name: string;
}

export function WorkspaceForm(props: {
  onCreated: () => void;
  onConflict?: (hint: SoftDeleteConflict) => void;
}) {
  const nameId = useId();
  const pathId = useId();
  const [name, setName] = useState("");
  const [path, setPath] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const canSubmit = name.trim() !== "" && path.trim().startsWith("/") && !busy;

  return (
    <form
      className="flex flex-col gap-4 border border-[var(--hill-rule)] p-5"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!canSubmit) return;
        setError(null);
        setBusy(true);
        try {
          await gateway.workspaces.create({ name: name.trim(), path: path.trim() });
          setName("");
          setPath("");
          props.onCreated();
        } catch (err) {
          const msg = (err as Error).message;
          const m = msg.match(/^409\s+(.*)$/);
          if (m && props.onConflict) {
            try {
              const body = JSON.parse(m[1]) as {
                error?: string;
                id?: number;
                name?: string;
              };
              if (
                body.error === "workspace_soft_deleted" &&
                typeof body.id === "number" &&
                typeof body.name === "string"
              ) {
                props.onConflict({ id: body.id, name: body.name });
                setBusy(false);
                return;
              }
            } catch {
              /* fall through */
            }
          }
          setError(msg);
        } finally {
          setBusy(false);
        }
      }}
    >
      <Field htmlFor={nameId} label="Name">
        <input
          id={nameId}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="my-project"
          className={fieldControl}
        />
      </Field>
      <Field
        htmlFor={pathId}
        label="Path"
        hint="반드시 절대 경로(`/` 시작). 디렉터리가 존재해야 wiki/세션이 동작합니다."
      >
        <input
          id={pathId}
          value={path}
          onChange={(e) => setPath(e.target.value)}
          placeholder="/workspaces/my-project"
          className={`${fieldControl} font-mono text-[12.5px]`}
        />
      </Field>
      <div className="flex items-center justify-end gap-2">
        {error && (
          <div role="alert" className="mr-auto text-[12px] text-red-700">
            {error}
          </div>
        )}
        <button type="submit" disabled={!canSubmit} className={btnPrimary}>
          {busy ? "…" : "Add workspace"}
        </button>
      </div>
    </form>
  );
}
