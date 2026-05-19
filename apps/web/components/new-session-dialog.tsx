"use client";
import { useEffect, useState } from "react";
import { gateway } from "@/lib/gateway-client";

export function NewSessionDialog(props: {
  workspaceId: number;
  onCreated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [cliList, setCliList] = useState<Array<{ name: string }>>([]);
  const [cli, setCli] = useState("claude");
  const [args, setArgs] = useState("");
  const [error, setError] = useState<string | null>(null);

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
        className="rounded border px-2 py-1 text-sm"
        onClick={() => setOpen(true)}
      >
        + new session
      </button>
    );
  }

  return (
    <form
      className="flex flex-col gap-2 rounded border p-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
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
        }
      }}
    >
      <label className="text-xs">cli</label>
      <select
        className="rounded border px-2 py-1 text-sm"
        value={cli}
        onChange={(e) => setCli(e.target.value)}
      >
        {cliList.map((c) => (
          <option key={c.name}>{c.name}</option>
        ))}
      </select>
      <label className="text-xs">args (space separated)</label>
      <input
        className="rounded border px-2 py-1 text-sm font-mono"
        value={args}
        onChange={(e) => setArgs(e.target.value)}
      />
      <div className="flex gap-2">
        <button className="rounded border px-2 py-1 text-sm">create</button>
        <button
          type="button"
          className="rounded border px-2 py-1 text-sm"
          onClick={() => setOpen(false)}
        >
          cancel
        </button>
      </div>
      {error && <div className="text-xs text-red-600">{error}</div>}
    </form>
  );
}
