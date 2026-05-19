"use client";
import { useState } from "react";
import { gateway } from "@/lib/gateway-client";

export function WorkspaceForm(props: { onCreated: () => void }) {
  const [name, setName] = useState("");
  const [path, setPath] = useState("");
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        try {
          await gateway.workspaces.create({ name, path });
          setName("");
          setPath("");
          props.onCreated();
        } catch (err) {
          setError((err as Error).message);
        }
      }}
    >
      <input
        className="w-full rounded border px-2 py-1 text-sm"
        placeholder="name"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <input
        className="w-full rounded border px-2 py-1 text-sm"
        placeholder="/absolute/path"
        value={path}
        onChange={(e) => setPath(e.target.value)}
      />
      <button className="self-end rounded border px-3 py-1 text-sm">add</button>
      {error && <div className="break-words text-sm text-red-600">{error}</div>}
    </form>
  );
}
