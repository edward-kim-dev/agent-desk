"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { SessionDto } from "@agent-desk/shared";
import { gateway } from "@/lib/gateway-client";
import { WorkspaceForm } from "../workspace-form";
import { SessionList } from "../session-list";
import { NewSessionDialog } from "../new-session-dialog";
import { TerminalPanel } from "../terminal-panel";

const POLL_INTERVAL_MS = 3000;

export function TerminalTab(props: {
  activeWorkspaceId: number | null;
  onWorkspacesChanged: () => void;
}) {
  const [sessions, setSessions] = useState<SessionDto[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null);
  const stoppedRef = useRef(false);
  const inFlightRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchOnce = useCallback(async () => {
    inFlightRef.current?.abort();
    const controller = new AbortController();
    inFlightRef.current = controller;
    try {
      const { sessions } = await gateway.sessions.list({
        signal: controller.signal,
      });
      if (!stoppedRef.current && !controller.signal.aborted) {
        setSessions(sessions);
      }
    } catch (e) {
      if ((e as { name?: string }).name === "AbortError") return;
    } finally {
      if (inFlightRef.current === controller) inFlightRef.current = null;
    }
  }, []);

  const refreshSessions = useCallback(() => {
    void fetchOnce();
  }, [fetchOnce]);

  useEffect(() => {
    stoppedRef.current = false;
    const tick = async () => {
      await fetchOnce();
      if (!stoppedRef.current) {
        timerRef.current = setTimeout(tick, POLL_INTERVAL_MS);
      }
    };
    void tick();
    return () => {
      stoppedRef.current = true;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      inFlightRef.current?.abort();
      inFlightRef.current = null;
    };
  }, [fetchOnce]);

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
