"use client";

export interface WikiNode {
  name: string;
  path: string;
  type: "dir" | "file";
  children?: WikiNode[];
}

export function WikiTree(props: { node: WikiNode; onOpen: (path: string) => void }) {
  if (props.node.type === "file") {
    return (
      <li>
        <button
          className="text-sm hover:underline"
          onClick={() => props.onOpen(props.node.path)}
        >
          {props.node.name}
        </button>
      </li>
    );
  }
  const layerLabel = /^L[0-5]-/.test(props.node.name)
    ? props.node.name.slice(0, 2)
    : null;
  return (
    <li>
      <details open>
        <summary className="cursor-pointer text-sm font-medium">
          {props.node.name}
          {layerLabel && (
            <span className="ml-2 bg-[#1a1208]/[0.08] px-1 text-xs opacity-75">
              {layerLabel}
            </span>
          )}
        </summary>
        <ul className="ml-4 mt-1 flex flex-col gap-1 border-l border-[var(--hill-rule)] pl-2">
          {(props.node.children ?? []).map((c) => (
            <WikiTree key={c.path} node={c} onOpen={props.onOpen} />
          ))}
        </ul>
      </details>
    </li>
  );
}
