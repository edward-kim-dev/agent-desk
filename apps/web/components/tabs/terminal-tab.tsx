"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  PackageCatalogEntry,
  SessionDto,
  StartWorkPackageRequest,
  WorkPackageArtifactDto,
  WorkPackageDto,
} from "@agent-desk/shared";
import { gateway } from "@/lib/gateway-client";
import { SessionList } from "../session-list";
import { NewSessionDialog } from "../new-session-dialog";
import { TerminalPanel } from "../terminal-panel";
import { WorkPackageModal } from "../work-package-modal";
import { ActivePackageCard } from "../active-package-card";

const POLL_INTERVAL_MS = 3000;

export function TerminalTab(props: {
  activeWorkspaceId: number | null;
  sessionsOpen: boolean;
}) {
  const [sessions, setSessions] = useState<SessionDto[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(
    null,
  );

  const [packages, setPackages] = useState<PackageCatalogEntry[]>([]);
  const [activeWp, setActiveWp] = useState<WorkPackageDto | null>(null);
  const [artifacts, setArtifacts] = useState<WorkPackageArtifactDto[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalBusy, setModalBusy] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [wpBusy, setWpBusy] = useState(false);
  /** modal 을 한 번이라도 사용자가 dismiss 한 세션 — 같은 탭에서 다시 자동으로 안 뜸. */
  const dismissedRef = useRef<Set<number>>(new Set());

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

  // 패키지 카탈로그 1 회 로드
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const { packages } = await gateway.packages.list({
          signal: controller.signal,
        });
        if (!controller.signal.aborted) setPackages(packages);
      } catch (e) {
        if ((e as { name?: string }).name === "AbortError") return;
      }
    })();
    return () => controller.abort();
  }, []);

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

  const refreshArtifacts = useCallback(async (wpId: number) => {
    try {
      const { artifacts } = await gateway.workPackages.listArtifacts(wpId);
      setArtifacts(artifacts);
    } catch {
      // ignore — UI 가 stale 한 채로 다음 호출에 갱신됨
    }
  }, []);

  // 선택된 세션의 활성 work package 조회
  useEffect(() => {
    if (selectedSessionId == null) {
      setActiveWp(null);
      setArtifacts([]);
      return;
    }
    const controller = new AbortController();
    void (async () => {
      try {
        const { instances } = await gateway.workPackages.listForSession(
          selectedSessionId,
          { signal: controller.signal },
        );
        if (controller.signal.aborted) return;
        const active = instances.find((i) => i.status === "active") ?? null;
        setActiveWp(active);
        if (active) {
          await refreshArtifacts(active.id);
        } else {
          setArtifacts([]);
        }
      } catch (e) {
        if ((e as { name?: string }).name === "AbortError") return;
      }
    })();
    return () => controller.abort();
  }, [selectedSessionId, refreshArtifacts]);

  // modal 자동 트리거: claude 세션 + 활성 work package 없음 + 아직 dismiss 안 함
  useEffect(() => {
    if (selectedSessionId == null) {
      setModalOpen(false);
      return;
    }
    const target = sessions.find((s) => s.id === selectedSessionId);
    if (
      target &&
      target.status === "active" &&
      target.cli === "claude" &&
      activeWp == null &&
      !dismissedRef.current.has(selectedSessionId)
    ) {
      setModalOpen(true);
    } else {
      setModalOpen(false);
    }
  }, [selectedSessionId, sessions, activeWp]);

  const handleStart = useCallback(
    async (body: StartWorkPackageRequest) => {
      if (selectedSessionId == null) return;
      setModalBusy(true);
      setModalError(null);
      try {
        const res = await gateway.workPackages.start(selectedSessionId, body);
        setActiveWp(res.instance);
        await refreshArtifacts(res.instance.id);
        setModalOpen(false);
      } catch (err) {
        setModalError((err as Error).message);
      } finally {
        setModalBusy(false);
      }
    },
    [selectedSessionId, refreshArtifacts],
  );

  const handleDismissModal = useCallback(() => {
    if (selectedSessionId != null)
      dismissedRef.current.add(selectedSessionId);
    setModalOpen(false);
    setModalError(null);
    setModalBusy(false);
  }, [selectedSessionId]);

  const handleAdvance = useCallback(
    async (expectedCurrentStep: number) => {
      if (activeWp == null) return;
      setWpBusy(true);
      try {
        const res = await gateway.workPackages.advance(activeWp.id, {
          expectedCurrentStep,
        });
        setActiveWp(res.instance);
        await refreshArtifacts(activeWp.id);
      } catch {
        // 사용자에게 토스트 등이 필요하지만 V1 에선 silent — UI 상태 stale 만
      } finally {
        setWpBusy(false);
      }
    },
    [activeWp, refreshArtifacts],
  );

  const handleComplete = useCallback(async () => {
    if (activeWp == null) return;
    setWpBusy(true);
    try {
      await gateway.workPackages.complete(activeWp.id);
      await refreshArtifacts(activeWp.id);
      setActiveWp(null);
    } catch {
      // silent
    } finally {
      setWpBusy(false);
    }
  }, [activeWp, refreshArtifacts]);

  const handleScan = useCallback(async () => {
    if (activeWp == null) return;
    setWpBusy(true);
    try {
      await gateway.workPackages.scan(activeWp.id);
      await refreshArtifacts(activeWp.id);
    } catch {
      // silent
    } finally {
      setWpBusy(false);
    }
  }, [activeWp, refreshArtifacts]);

  const selectedSession = sessions.find((s) => s.id === selectedSessionId);
  const activePackageDef = activeWp
    ? packages.find((p) => p.id === activeWp.packageId)
    : null;

  const sessionsOpen = props.sessionsOpen;

  return (
    <div className="relative h-full w-full overflow-hidden">
      <section className="absolute inset-0">
        <TerminalPanel sessionId={selectedSessionId} />
      </section>

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

        {activeWp && activePackageDef && (
          <ActivePackageCard
            instance={activeWp}
            stepTitles={activePackageDef.stepTitles}
            packageTitle={activePackageDef.title}
            artifacts={artifacts}
            busy={wpBusy}
            onAdvance={handleAdvance}
            onComplete={handleComplete}
            onScan={handleScan}
          />
        )}

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

      <WorkPackageModal
        open={modalOpen}
        packages={packages}
        sessionCli={selectedSession?.cli ?? "claude"}
        busy={modalBusy}
        errorMessage={modalError}
        onStart={handleStart}
        onDismiss={handleDismissModal}
      />
    </div>
  );
}
