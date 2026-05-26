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
  const argsId = useId();
  const [open, setOpen] = useState(false);
  const [cliList, setCliList] = useState<Array<{ name: string }>>([]);
  const [cli, setCli] = useState("claude");
  const [args, setArgs] = useState("");
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
            args: args.trim() === "" ? [] : args.trim().split(/\s+/),
          });
          setOpen(false);
          setArgs("");
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
      <Field htmlFor={argsId} label="Args" hint="공백 구분. 비워두면 기본 인자만 사용.">
        <input
          id={argsId}
          className={`${fieldControl} font-mono text-[12px]`}
          value={args}
          onChange={(e) => setArgs(e.target.value)}
          placeholder="--resume"
        />
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
            setArgs("");
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
