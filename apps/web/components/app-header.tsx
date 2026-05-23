"use client";
import type { ReactNode } from "react";
import type { WorkspaceDto } from "@agent-desk/shared";
import { WorkspaceSwitcher } from "./workspace-switcher";
import { TabBar } from "./tabs/tab-bar";
import type { TabKey } from "./tabs/types";

export function AppHeader(props: {
  workspaces: WorkspaceDto[];
  activeId: number | null;
  onSelectWorkspace: (id: number) => void;
  tab: TabKey;
  onTabChange: (next: TabKey) => void;
  subviewSlot?: ReactNode;
}) {
  return (
    <>
      <header
        className={[
          "flex items-center justify-between",
          "text-[11px] uppercase tracking-[0.22em]",
          "pb-[1.45vw] border-b border-[var(--hill-rule)]",
        ].join(" ")}
      >
        <h1 className="font-semibold">agent-desk  ⁄  desk</h1>
        <TabBar value={props.tab} onChange={props.onTabChange} />
      </header>
      <div
        className={[
          "-mt-[1px] mb-[2.1vw] flex items-stretch justify-between",
          "text-[10px] uppercase tracking-[0.24em]",
        ].join(" ")}
      >
        <WorkspaceSwitcher
          workspaces={props.workspaces}
          activeId={props.activeId}
          onSelect={props.onSelectWorkspace}
        />
        {props.subviewSlot}
      </div>
    </>
  );
}
