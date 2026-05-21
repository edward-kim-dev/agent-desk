"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { WikiTree, type WikiNode } from "../wiki-tree";
import { WikiViewer } from "../wiki-viewer";
import { WikiEditor } from "../wiki-editor";
import { WikiLogComposer } from "../wiki-log-composer";
import { WikiSubviewSwitch, type WikiSubview } from "./wiki/subview-switch";
import { WikiMetaPanel } from "./wiki/meta-panel";
import { AdrBoard } from "./wiki/adr-board";
import { ReviewQueue } from "./wiki/review-queue";

interface WikiFile {
  path: string;
  content: string;
  schemaWarnings: string[];
}

function countClaims(text: string) {
  const tally = { source: 0, analysis: 0, unverified: 0, gap: 0 };
  for (const m of text.matchAll(/\b(source|analysis|unverified|gap)\b/g)) {
    tally[m[1] as keyof typeof tally]++;
  }
  return tally;
}

function frontmatterLayer(text: string): string | null {
  const fm = text.match(/^---\n([\s\S]*?)\n---/);
  if (!fm) return null;
  const layer = fm[1].match(/^layer:\s*(\S+)/m);
  return layer ? layer[1] : null;
}

function findKnownPaths(node: WikiNode, into: Set<string>): void {
  if (node.type === "file") into.add(node.path);
  node.children?.forEach((c) => findKnownPaths(c, into));
}

function brokenLinksOf(content: string, known: Set<string>): string[] {
  return Array.from(content.matchAll(/\[[^\]]+\]\(([^)\s]+\.md)\)/g))
    .map((m) => m[1])
    .filter((t) => !known.has(t.replace(/^\.?\//, "")));
}

export function WikiTab(props: { workspaceId: number | null }) {
  const [subview, setSubview] = useState<WikiSubview>("docs");
  const [tree, setTree] = useState<WikiNode | null>(null);
  const [openFile, setOpenFile] = useState<WikiFile | null>(null);
  const [reviewBody, setReviewBody] = useState<string | null>(null);

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

  // Review Queue 콘텐츠 한 번 로드 (subview가 review일 때만)
  useEffect(() => {
    if (subview !== "review" || props.workspaceId == null) return;
    (async () => {
      for (const p of ["infra/review-queue.md", "review-queue.md"]) {
        const r = await fetch(
          `/api/proxy/workspaces/${props.workspaceId}/wiki/file?path=${encodeURIComponent(p)}`
        );
        if (r.ok) {
          const f = (await r.json()) as { content: string };
          setReviewBody(f.content);
          return;
        }
      }
      setReviewBody(null);
    })();
  }, [subview, props.workspaceId]);

  const open = useCallback(
    async (path: string) => {
      if (props.workspaceId == null) return;
      const res = await fetch(
        `/api/proxy/workspaces/${props.workspaceId}/wiki/file?path=${encodeURIComponent(path)}`
      );
      if (res.ok) {
        setOpenFile(await res.json());
        if (subview !== "docs") setSubview("docs");
      }
    },
    [props.workspaceId, subview]
  );

  const known = useMemo(() => {
    const s = new Set<string>();
    if (tree) findKnownPaths(tree, s);
    return s;
  }, [tree]);

  const brokenLinks = useMemo(
    () => (openFile ? brokenLinksOf(openFile.content, known) : []),
    [openFile, known]
  );

  if (props.workspaceId == null) {
    return (
      <div className="grid h-full place-items-center text-sm text-zinc-500">
        no workspace selected
      </div>
    );
  }
  if (!tree) {
    return (
      <div className="grid h-full place-items-center text-sm text-zinc-500">
        no wiki/ in workspace
      </div>
    );
  }

  return (
    <div className="grid h-full grid-rows-[auto_1fr]">
      <WikiSubviewSwitch value={subview} onChange={setSubview} />
      {subview === "docs" && (
        <div className="grid min-h-0 grid-cols-[16rem_1fr_18rem]">
          <aside className="overflow-y-auto border-r p-3 text-sm">
            <ul>
              <WikiTree node={tree} onOpen={open} />
            </ul>
          </aside>
          <section className="overflow-y-auto p-3 text-sm">
            {openFile ? (
              <>
                <WikiViewer
                  path={openFile.path}
                  content={openFile.content}
                  schemaWarnings={openFile.schemaWarnings}
                  brokenLinks={brokenLinks}
                />
                <details className="mt-3">
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
              </>
            ) : (
              <div className="text-zinc-500">왼쪽 트리에서 문서를 선택하세요.</div>
            )}
          </section>
          <WikiMetaPanel
            openFile={
              openFile
                ? {
                    path: openFile.path,
                    layer: frontmatterLayer(openFile.content),
                    claimCounts: countClaims(openFile.content),
                  }
                : null
            }
            brokenLinks={brokenLinks}
          />
        </div>
      )}
      {subview === "adr" && (
        <div className="min-h-0 overflow-y-auto">
          <AdrBoard tree={tree} onOpen={open} />
        </div>
      )}
      {subview === "review" && (
        <div className="min-h-0 overflow-y-auto">
          <ReviewQueue content={reviewBody} />
        </div>
      )}
      {subview === "log" && (
        <div className="min-h-0 overflow-y-auto p-3 text-sm">
          <WikiLogComposer workspaceId={props.workspaceId} />
        </div>
      )}
    </div>
  );
}
