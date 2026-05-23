"use client";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import type { WorkspaceDto } from "@agent-desk/shared";
import { gateway } from "@/lib/gateway-client";
import { AppHeader } from "./app-header";
import type { TabKey } from "./tabs/types";
import { HomeTab } from "./tabs/home-tab";
import { TerminalTab } from "./tabs/terminal-tab";
import { WikiTab } from "./tabs/wiki-tab";
import { GraphTab } from "./tabs/graph-tab";
import { HarnessTab } from "./tabs/harness-tab";
import { SettingsTab } from "./tabs/settings-tab";
import {
  WikiSubviewSwitch,
  type WikiSubview,
} from "./tabs/wiki/subview-switch";
import {
  HarnessSubviewSwitch,
  type HarnessSubview,
} from "./tabs/harness/subview-switch";
import {
  SettingsSubviewSwitch,
  type SettingsSubview,
} from "./tabs/settings/subview-switch";

export function AppShell() {
  const [workspaces, setWorkspaces] = useState<WorkspaceDto[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [tab, setTab] = useState<TabKey>("home");
  const [wikiSubview, setWikiSubview] = useState<WikiSubview>("docs");
  const [harnessSubview, setHarnessSubview] = useState<HarnessSubview>("memory");
  const [settingsSubview, setSettingsSubview] = useState<SettingsSubview>("general");

  const refresh = useCallback(async (signal?: AbortSignal) => {
    try {
      const { workspaces } = await gateway.workspaces.list({ signal });
      if (signal?.aborted) return;
      setWorkspaces(workspaces);
      if (workspaces.length > 0 && activeId == null) setActiveId(workspaces[0].id);
    } catch (e) {
      if ((e as { name?: string }).name === "AbortError") return;
      throw e;
    }
  }, [activeId]);

  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    return () => controller.abort();
  }, [refresh]);

  let subviewSlot: ReactNode = null;
  if (tab === "wiki") {
    subviewSlot = (
      <WikiSubviewSwitch value={wikiSubview} onChange={setWikiSubview} />
    );
  } else if (tab === "harness") {
    subviewSlot = (
      <HarnessSubviewSwitch
        value={harnessSubview}
        onChange={setHarnessSubview}
      />
    );
  } else if (tab === "settings") {
    subviewSlot = (
      <SettingsSubviewSwitch
        value={settingsSubview}
        onChange={setSettingsSubview}
      />
    );
  }

  return (
    <div
      className={[
        "mx-auto flex h-screen flex-col",
        "max-w-[1180px] px-[2.5vw] pt-[1.9vw] pb-[4.2vw]",
      ].join(" ")}
    >
      <AppHeader
        workspaces={workspaces}
        activeId={activeId}
        onSelectWorkspace={setActiveId}
        tab={tab}
        onTabChange={setTab}
        subviewSlot={subviewSlot}
      />
      <main className="min-h-0 flex-1 overflow-hidden">
        {tab === "home" && <HomeTab />}
        {tab === "terminal" && (
          <TerminalTab
            activeWorkspaceId={activeId}
            onWorkspacesChanged={refresh}
          />
        )}
        {tab === "wiki" && (
          <WikiTab
            workspaceId={activeId}
            subview={wikiSubview}
            onSubviewChange={setWikiSubview}
          />
        )}
        {tab === "graph" && <GraphTab />}
        {tab === "harness" && <HarnessTab subview={harnessSubview} />}
        {tab === "settings" && <SettingsTab subview={settingsSubview} />}
      </main>
    </div>
  );
}
