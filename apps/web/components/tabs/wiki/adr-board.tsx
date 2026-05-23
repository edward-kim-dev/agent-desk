"use client";
import type { WikiNode } from "../../wiki-tree";

function findDecisions(root: WikiNode): WikiNode[] {
  if (root.type !== "dir") return [];
  const decisionsDir = root.children?.find(
    (c) => c.type === "dir" && c.name === "decisions"
  );
  if (!decisionsDir) return [];
  const files: WikiNode[] = [];
  const walk = (n: WikiNode) => {
    if (n.type === "file" && n.path.endsWith(".md")) files.push(n);
    n.children?.forEach(walk);
  };
  decisionsDir.children?.forEach(walk);
  files.sort((a, b) => a.name.localeCompare(b.name));
  return files;
}

export function AdrBoard(props: {
  tree: WikiNode;
  onOpen: (path: string) => void;
}) {
  const files = findDecisions(props.tree);
  if (files.length === 0) {
    return (
      <div className="p-4 text-sm opacity-55">
        wiki/decisions 가 비어 있습니다.
      </div>
    );
  }
  return (
    <table className="w-full text-sm">
      <thead className="border-b border-[var(--hill-rule)] text-left text-xs uppercase opacity-55">
        <tr>
          <th className="px-3 py-2">파일</th>
          <th className="px-3 py-2">상태</th>
          <th className="px-3 py-2">날짜</th>
        </tr>
      </thead>
      <tbody>
        {files.map((f) => (
          <tr
            key={f.path}
            className="cursor-pointer border-b border-[var(--hill-rule)] hover:bg-[#1a1208]/[0.04]"
            onClick={() => props.onOpen(f.path)}
          >
            <td className="px-3 py-2 font-mono">{f.name}</td>
            <td className="px-3 py-2 opacity-55">—</td>
            <td className="px-3 py-2 opacity-55">—</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
