"use client";
import { useCallback, useEffect, useState } from "react";
import { WikiTree, type WikiNode } from "./wiki-tree";
import { WikiViewer } from "./wiki-viewer";
import { WikiEditor } from "./wiki-editor";
import { WikiLogComposer } from "./wiki-log-composer";

interface WikiFile {
  path: string;
  content: string;
  schemaWarnings: string[];
}

export function WikiPanel(props: { workspaceId: number | null }) {
  const [tree, setTree] = useState<WikiNode | null>(null);
  const [openFile, setOpenFile] = useState<WikiFile | null>(null);
  const [brokenLinksByPath, setBrokenLinksByPath] = useState<
    Record<string, string[]>
  >({});

  const refresh = useCallback(async () => {
    if (props.workspaceId == null) return setTree(null);
    const res = await fetch(`/api/proxy/workspaces/${props.workspaceId}/wiki/tree`);
    if (res.ok) {
      const body = await res.json();
      setTree(body.root);
    }
  }, [props.workspaceId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    (async () => {
      if (!tree || props.workspaceId == null) return;
      try {
        const r = await fetch(
          `/api/proxy/workspaces/${props.workspaceId}/wiki/file?path=index.md`
        );
        if (!r.ok) return;
        const f = (await r.json()) as { content: string };
        const known = new Set<string>();
        const collect = (n: WikiNode) => {
          if (n.type === "file") known.add(n.path);
          n.children?.forEach(collect);
        };
        collect(tree);
        const broken = Array.from(
          f.content.matchAll(/\[[^\]]+\]\(([^)\s]+\.md)\)/g)
        )
          .map((m) => m[1])
          .filter((t) => !known.has(t.replace(/^\.?\//, "")));
        setBrokenLinksByPath({ "index.md": broken });
      } catch {}
    })();
  }, [tree, props.workspaceId]);

  const open = useCallback(
    async (path: string) => {
      if (props.workspaceId == null) return;
      const res = await fetch(
        `/api/proxy/workspaces/${props.workspaceId}/wiki/file?path=${encodeURIComponent(path)}`
      );
      if (res.ok) setOpenFile(await res.json());
    },
    [props.workspaceId]
  );

  if (props.workspaceId == null) {
    return <div className="text-sm text-zinc-500">no workspace selected</div>;
  }
  if (!tree) {
    return <div className="text-sm text-zinc-500">no wiki/ in workspace</div>;
  }

  return (
    <div className="flex flex-col gap-3 text-sm">
      <ul>
        <WikiTree node={tree} onOpen={open} />
      </ul>
      {openFile && (
        <>
          <WikiViewer
            path={openFile.path}
            content={openFile.content}
            schemaWarnings={openFile.schemaWarnings}
            brokenLinks={brokenLinksByPath[openFile.path]}
          />
          <details>
            <summary className="cursor-pointer text-xs text-zinc-500">edit</summary>
            <WikiEditor
              initialContent={openFile.content}
              onSave={async (next) => {
                const r = await fetch(
                  `/api/proxy/workspaces/${props.workspaceId}/wiki/file`,
                  {
                    method: "PUT",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ path: openFile.path, content: next }),
                  }
                );
                if (!r.ok) throw new Error(`save failed: ${r.status}`);
                const body = (await r.json()) as { schemaWarnings: string[] };
                setOpenFile({
                  ...openFile,
                  content: next,
                  schemaWarnings: body.schemaWarnings,
                });
                await refresh();
                return body;
              }}
            />
          </details>
          {openFile.path === "log.md" && (
            <WikiLogComposer workspaceId={props.workspaceId!} />
          )}
        </>
      )}
    </div>
  );
}
