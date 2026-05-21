"use client";
import { useCallback, useEffect, useState } from "react";
import type { WorkspaceDto } from "@agent-desk/shared";
import { gateway } from "@/lib/gateway-client";
import { WorkspaceSwitcher } from "./workspace-switcher";
import { TabBar } from "./tabs/tab-bar";
import type { TabKey } from "./tabs/types";
import { TerminalTab } from "./tabs/terminal-tab";
import { WikiTab } from "./tabs/wiki-tab";
import { GraphTab } from "./tabs/graph-tab";
import { HarnessTab } from "./tabs/harness-tab";
import { SettingsTab } from "./tabs/settings-tab";

export function AppShell() {
  const [workspaces, setWorkspaces] = useState<WorkspaceDto[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [tab, setTab] = useState<TabKey>("terminal");

  const refresh = useCallback(async () => {
    const { workspaces } = await gateway.workspaces.list();
    setWorkspaces(workspaces);
    if (workspaces.length > 0 && activeId == null) setActiveId(workspaces[0].id);
  }, [activeId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <div className="grid h-screen grid-rows-[auto_auto_1fr]">
      <header className="flex items-center gap-4 border-b px-4 py-2">
        <h1 className="font-semibold">agent-desk</h1>
        <WorkspaceSwitcher
          workspaces={workspaces}
          activeId={activeId}
          onSelect={setActiveId}
        />
        <div className="flex-1" />
        <span aria-hidden className="text-xs text-zinc-400" data-stub="true">
          !0
        </span>
        <span className="text-xs text-zinc-500">v0.2</span>
      </header>
      <TabBar value={tab} onChange={setTab} />
      <main className="min-h-0 overflow-hidden">
        {tab === "terminal" && (
          <TerminalTab
            activeWorkspaceId={activeId}
            onWorkspacesChanged={refresh}
          />
        )}
        {tab === "wiki" && <WikiTab workspaceId={activeId} />}
        {tab === "graph" && <GraphTab />}
        {tab === "harness" && <HarnessTab />}
        {tab === "settings" && <SettingsTab />}
      </main>
    </div>
  );
}
