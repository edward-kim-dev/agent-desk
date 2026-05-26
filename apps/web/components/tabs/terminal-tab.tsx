"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SessionDto } from "@agent-desk/shared";
import { gateway } from "@/lib/gateway-client";
import { SessionList } from "../session-list";
import { NewSessionDialog } from "../new-session-dialog";
import { TerminalPanel } from "../terminal-panel";

const POLL_INTERVAL_MS = 3000;

export function TerminalTab(props: { activeWorkspaceId: number | null }) {
  const [sessions, setSessions] = useState<SessionDto[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null);
  const [listOpen, setListOpen] = useState(true);
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

  const activeCount = useMemo(() => {
    return sessions.filter(
      (s) =>
        s.status === "active" &&
        (props.activeWorkspaceId == null ||
          s.workspaceId === props.activeWorkspaceId),
    ).length;
  }, [sessions, props.activeWorkspaceId]);

  return (
    <div className="grid h-full grid-cols-[18rem_1fr]">
      <aside className="flex min-w-0 flex-col gap-3 overflow-y-auto border-r border-[var(--hill-rule)] p-4">
        <button
          type="button"
          onClick={() => setListOpen((v) => !v)}
          aria-expanded={listOpen}
          className={[
            "flex w-full cursor-pointer items-center justify-between gap-2",
            "border-0 bg-transparent p-0 text-left",
            "text-[10px] font-semibold uppercase tracking-[0.24em] text-[#1a1208]",
          ].join(" ")}
        >
          <span className="flex items-baseline gap-2">
            <span>Sessions</span>
            <span className="opacity-40">({activeCount})</span>
          </span>
          <Chevron open={listOpen} />
        </button>

        {props.activeWorkspaceId != null && (
          <NewSessionDialog
            workspaceId={props.activeWorkspaceId}
            onCreated={refreshSessions}
          />
        )}

        {listOpen && (
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
        )}
      </aside>
      <section className="overflow-hidden">
        <TerminalPanel sessionId={selectedSessionId} />
      </section>
    </div>
  );
}

function Chevron(props: { open: boolean }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      width="10"
      height="10"
      className={[
        "flex-shrink-0 opacity-55 transition-transform",
        props.open ? "" : "-rotate-90",
      ].join(" ")}
    >
      <path
        d="M3 6l5 5 5-5"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
