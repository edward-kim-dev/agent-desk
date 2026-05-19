"use client";
import { useState } from "react";

export function WikiLogComposer(props: { workspaceId: number }) {
  const [body, setBody] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  return (
    <form
      className="flex flex-col gap-2 rounded border p-2"
      onSubmit={async (e) => {
        e.preventDefault();
        if (body.trim() === "") return;
        setStatus("posting…");
        const res = await fetch(
          `/api/proxy/workspaces/${props.workspaceId}/wiki/log`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ body }),
          }
        );
        setStatus(res.ok ? "posted" : `error ${res.status}`);
        if (res.ok) setBody("");
      }}
    >
      <textarea
        className="rounded border px-2 py-1 text-sm"
        rows={3}
        placeholder="append to wiki/log.md…"
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />
      <div className="flex items-center gap-2">
        <button className="rounded border px-2 py-1 text-sm">post</button>
        {status && <span className="text-xs text-zinc-500">{status}</span>}
      </div>
    </form>
  );
}
