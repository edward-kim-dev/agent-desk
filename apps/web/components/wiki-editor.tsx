"use client";
import { useEffect, useRef, useState } from "react";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap, lineNumbers } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { oneDark } from "@codemirror/theme-one-dark";

export function WikiEditor(props: {
  initialContent: string;
  onSave: (next: string) => Promise<{ schemaWarnings: string[] }>;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  useEffect(() => {
    if (!hostRef.current) return;
    const state = EditorState.create({
      doc: props.initialContent,
      extensions: [
        lineNumbers(),
        history(),
        markdown(),
        oneDark,
        keymap.of([...defaultKeymap, ...historyKeymap]),
      ],
    });
    const view = new EditorView({ state, parent: hostRef.current });
    viewRef.current = view;
    return () => view.destroy();
  }, [props.initialContent]);

  return (
    <div className="flex flex-col gap-2">
      <div ref={hostRef} className="rounded border" style={{ minHeight: 240 }} />
      <div className="flex items-center gap-2">
        <button
          className="rounded border px-2 py-1 text-sm"
          onClick={async () => {
            const content = viewRef.current?.state.doc.toString() ?? "";
            setStatus("saving…");
            try {
              const r = await props.onSave(content);
              setWarnings(r.schemaWarnings);
              setStatus("saved");
            } catch (err) {
              setStatus(`error: ${(err as Error).message}`);
            }
          }}
        >
          save
        </button>
        {status && <span className="text-xs text-zinc-500">{status}</span>}
      </div>
      {warnings.length > 0 && (
        <ul className="text-xs text-amber-700">
          {warnings.map((w) => (
            <li key={w}>⚠ {w}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
