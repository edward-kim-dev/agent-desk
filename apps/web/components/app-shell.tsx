"use client";
import { useCallback, useEffect, useState } from "react";
import type { SessionDto, WorkspaceDto } from "@agent-desk/shared";
import { gateway } from "@/lib/gateway-client";
import { WorkspaceSwitcher } from "./workspace-switcher";
import { WorkspaceForm } from "./workspace-form";
import { SessionList } from "./session-list";
import { NewSessionDialog } from "./new-session-dialog";
import { TerminalPanel } from "./terminal-panel";
import { WikiPanel } from "./wiki-panel";

export function AppShell() {
  const [workspaces, setWorkspaces] = useState<WorkspaceDto[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [sessions, setSessions] = useState<SessionDto[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    const { workspaces } = await gateway.workspaces.list();
    setWorkspaces(workspaces);
    if (workspaces.length > 0 && activeId == null) setActiveId(workspaces[0].id);
  }, [activeId]);

  const refreshSessions = useCallback(async () => {
    try {
      const { sessions } = await gateway.sessions.list();
      setSessions(sessions);
    } catch {}
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    refreshSessions();
    const t = setInterval(refreshSessions, 3000);
    return () => clearInterval(t);
  }, [refreshSessions]);

  return (
    <div className="grid h-screen grid-rows-[auto_1fr] grid-cols-[18rem_1fr_24rem]">
      <header className="col-span-3 flex items-center gap-4 border-b px-4 py-2">
        <h1 className="font-semibold">agent-desk</h1>
        <WorkspaceSwitcher
          workspaces={workspaces}
          activeId={activeId}
          onSelect={setActiveId}
        />
        <div className="flex-1" />
        <span className="text-xs text-zinc-500">v0.1</span>
      </header>
      <aside className="flex min-w-0 flex-col gap-3 overflow-y-auto border-r p-3">
        <WorkspaceForm onCreated={refresh} />
        <section className="text-xs uppercase text-zinc-500 mt-2 flex items-center justify-between">
          sessions
          {activeId && (
            <NewSessionDialog workspaceId={activeId} onCreated={refreshSessions} />
          )}
        </section>
        <SessionList
          sessions={sessions}
          activeWorkspaceId={activeId}
          selectedId={selectedSessionId}
          onSelect={setSelectedSessionId}
          onKill={async (id) => {
            await gateway.sessions.remove(id);
            refreshSessions();
          }}
        />
      </aside>
      <main className="overflow-hidden bg-black text-zinc-100">
        <TerminalPanel sessionId={selectedSessionId} />
      </main>
      <section className="border-l p-3 overflow-y-auto">
        <WikiPanel workspaceId={activeId} />
      </section>
    </div>
  );
}
