"use client";
import { useCallback, useEffect, useState } from "react";
import type { SessionDto } from "@agent-desk/shared";
import { gateway } from "@/lib/gateway-client";
import { WorkspaceForm } from "../workspace-form";
import { SessionList } from "../session-list";
import { NewSessionDialog } from "../new-session-dialog";
import { TerminalPanel } from "../terminal-panel";

export function TerminalTab(props: {
  activeWorkspaceId: number | null;
  onWorkspacesChanged: () => void;
}) {
  const [sessions, setSessions] = useState<SessionDto[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null);

  const refreshSessions = useCallback(async () => {
    try {
      const { sessions } = await gateway.sessions.list();
      setSessions(sessions);
    } catch {}
  }, []);

  useEffect(() => {
    refreshSessions();
    const t = setInterval(refreshSessions, 3000);
    return () => clearInterval(t);
  }, [refreshSessions]);

  return (
    <div className="grid h-full grid-cols-[18rem_1fr]">
      <aside className="flex min-w-0 flex-col gap-3 overflow-y-auto border-r border-[var(--hill-rule)] p-3">
        <WorkspaceForm onCreated={props.onWorkspacesChanged} />
        <section className="mt-2 flex items-center justify-between text-xs uppercase opacity-55">
          sessions
          {props.activeWorkspaceId != null && (
            <NewSessionDialog
              workspaceId={props.activeWorkspaceId}
              onCreated={refreshSessions}
            />
          )}
        </section>
        <SessionList
          sessions={sessions}
          activeWorkspaceId={props.activeWorkspaceId}
          selectedId={selectedSessionId}
          onSelect={setSelectedSessionId}
          onKill={async (id) => {
            await gateway.sessions.remove(id);
            refreshSessions();
          }}
        />
      </aside>
      <section className="overflow-hidden">
        <TerminalPanel sessionId={selectedSessionId} />
      </section>
    </div>
  );
}
