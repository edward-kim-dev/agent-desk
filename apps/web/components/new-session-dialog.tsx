"use client";
import { useEffect, useId, useState } from "react";
import { gateway } from "@/lib/gateway-client";
import { Field, fieldControl } from "./ui/field";
import { btnGhost, btnPrimary } from "./ui/button-classes";

export function NewSessionDialog(props: {
  workspaceId: number;
  onCreated: () => void;
}) {
  const cliId = useId();
  const [open, setOpen] = useState(false);
  const [cliList, setCliList] = useState<Array<{ name: string }>>([]);
  const [cli, setCli] = useState("claude");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    gateway
      .cli()
      .then((r) => {
        setCliList(r.cli);
        if (r.cli[0]) setCli(r.cli[0].name);
      })
      .catch(() => {});
  }, []);

  if (!open) {
    return (
      <button
        type="button"
        className={btnGhost}
        onClick={() => setOpen(true)}
        aria-expanded={false}
      >
        + new
      </button>
    );
  }

  return (
    <form
      className="flex flex-col gap-3 border border-[var(--hill-rule)] p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        setBusy(true);
        try {
          await gateway.sessions.create({
            workspaceId: props.workspaceId,
            cli,
            args: [],
          });
          setOpen(false);
          props.onCreated();
        } catch (err) {
          setError((err as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="text-[10px] font-semibold uppercase tracking-[0.24em] opacity-55">
        New session
      </div>
      <Field htmlFor={cliId} label="CLI">
        <select
          id={cliId}
          className={fieldControl}
          value={cli}
          onChange={(e) => setCli(e.target.value)}
        >
          {cliList.map((c) => (
            <option key={c.name}>{c.name}</option>
          ))}
        </select>
      </Field>
      {error && (
        <div role="alert" className="text-[11px] text-red-700">
          {error}
        </div>
      )}
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          className={btnGhost}
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
        >
          Cancel
        </button>
        <button type="submit" disabled={busy} className={btnPrimary}>
          {busy ? "…" : "Create"}
        </button>
      </div>
    </form>
  );
}
