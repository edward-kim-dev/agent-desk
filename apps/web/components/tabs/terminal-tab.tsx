"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  BrainstormingBriefRequest,
  SessionDto,
} from "@agent-desk/shared";
import { gateway } from "@/lib/gateway-client";
import { SessionList } from "../session-list";
import { NewSessionDialog } from "../new-session-dialog";
import { TerminalPanel } from "../terminal-panel";
import { BriefingFormModal } from "../briefing-form-modal";

const POLL_INTERVAL_MS = 3000;

export function TerminalTab(props: {
  activeWorkspaceId: number | null;
  sessionsOpen: boolean;
}) {
  const [sessions, setSessions] = useState<SessionDto[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(
    null,
  );
  const [briefingSessionId, setBriefingSessionId] = useState<number | null>(
    null,
  );
  const [briefingBusy, setBriefingBusy] = useState(false);
  const [briefingError, setBriefingError] = useState<string | null>(null);
  /** 사용자가 Skip 한 세션 id 집합 — 같은 탭에서 다시 자동으로 모달이 뜨지 않게 한다. */
  const skippedRef = useRef<Set<number>>(new Set());
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

  useEffect(() => {
    if (selectedSessionId == null) return;
    const stillAlive = sessions.some(
      (s) => s.id === selectedSessionId && s.status === "active",
    );
    if (!stillAlive) setSelectedSessionId(null);
  }, [sessions, selectedSessionId]);

  const handleSelectSession = useCallback(
    (id: number) => {
      setSelectedSessionId(id);
      const target = sessions.find((s) => s.id === id);
      if (
        target &&
        target.status === "active" &&
        target.cli === "claude" &&
        target.briefedAt == null &&
        !skippedRef.current.has(id)
      ) {
        setBriefingError(null);
        setBriefingSessionId(id);
      }
    },
    [sessions],
  );

  const handleBriefSubmit = useCallback(
    async (payload: BrainstormingBriefRequest) => {
      if (briefingSessionId == null) return;
      setBriefingBusy(true);
      setBriefingError(null);
      try {
        const res = await gateway.sessions.brief(briefingSessionId, payload);
        if (!res.result.injected) {
          setBriefingError(
            `주입 실패: ${res.result.reason ?? "unknown"}${
              res.result.detail ? ` — ${res.result.detail}` : ""
            }`,
          );
          return;
        }
        setBriefingSessionId(null);
        refreshSessions();
      } catch (err) {
        setBriefingError((err as Error).message);
      } finally {
        setBriefingBusy(false);
      }
    },
    [briefingSessionId, refreshSessions],
  );

  const handleBriefDismiss = useCallback(() => {
    if (briefingSessionId != null) skippedRef.current.add(briefingSessionId);
    setBriefingSessionId(null);
    setBriefingError(null);
    setBriefingBusy(false);
  }, [briefingSessionId]);

  const sessionsOpen = props.sessionsOpen;

  return (
    <div className="relative h-full w-full overflow-hidden">
      {/* 터미널은 항상 컨테이너 전체 폭을 차지한다. */}
      <section className="absolute inset-0">
        <TerminalPanel sessionId={selectedSessionId} />
      </section>

      {/* 우측 슬라이드 오버레이 패널 — AppHeader 의 Sessions 토글에서 아래로 내려온다. */}
      <aside
        aria-label="Sessions"
        aria-hidden={!sessionsOpen}
        className={[
          "absolute top-0 right-0 bottom-0 z-10 flex w-72 min-w-0 flex-col gap-3 overflow-y-auto",
          "border-l border-[var(--hill-rule)] bg-[var(--background)]/95 p-4 backdrop-blur-sm",
          "shadow-[-6px_0_24px_-12px_rgba(26,18,8,0.18)]",
          "transition-[transform,opacity] duration-200 ease-out",
          sessionsOpen
            ? "translate-y-0 opacity-100"
            : "-translate-y-full opacity-0 pointer-events-none",
        ].join(" ")}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-baseline gap-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-[#1a1208]">
            <span>Sessions</span>
            <span className="opacity-40">({activeCount})</span>
          </span>
        </div>

        {props.activeWorkspaceId != null && (
          <NewSessionDialog
            workspaceId={props.activeWorkspaceId}
            onCreated={refreshSessions}
          />
        )}

        <SessionList
          sessions={sessions}
          activeWorkspaceId={props.activeWorkspaceId}
          selectedId={selectedSessionId}
          onSelect={handleSelectSession}
          onKill={async (id) => {
            await gateway.sessions.remove(id);
            refreshSessions();
          }}
        />
      </aside>

      <BriefingFormModal
        open={briefingSessionId != null}
        busy={briefingBusy}
        errorMessage={briefingError}
        onSubmit={handleBriefSubmit}
        onDismiss={handleBriefDismiss}
      />
    </div>
  );
}
