"use client";
import { useCallback, useEffect, useState } from "react";
import type { WorkspaceDto } from "@agent-desk/shared";
import { gateway } from "@/lib/gateway-client";
import { WorkspaceForm } from "../../workspace-form";
import { ConfirmDialog } from "../../confirm-dialog";
import { SectionHeading } from "../../ui/section-heading";
import { btnGhost, btnGhostDanger } from "../../ui/button-classes";

type PendingAction =
  | { kind: "soft-delete"; workspace: WorkspaceDto }
  | { kind: "permanent-delete"; workspace: WorkspaceDto };

interface SoftDeletedHint {
  id: number;
  name: string;
}

export function WorkspacesSubview(props: { onChanged: () => void }) {
  const [active, setActive] = useState<WorkspaceDto[]>([]);
  const [deleted, setDeleted] = useState<WorkspaceDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [conflictHint, setConflictHint] = useState<SoftDeletedHint | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [a, d] = await Promise.all([
        gateway.workspaces.list(),
        gateway.workspaces.listDeleted(),
      ]);
      setActive(a.workspaces);
      setDeleted(d.workspaces);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const notifyChange = useCallback(async () => {
    await refresh();
    props.onChanged();
  }, [refresh, props]);

  return (
    <div className="flex flex-col gap-10 p-6 text-sm">
      <ActiveSection
        items={active}
        onRequestDelete={(w) => setPending({ kind: "soft-delete", workspace: w })}
        onToggleHarness={async (w, next) => {
          setError(null);
          try {
            await gateway.workspaces.update(w.id, { harnessEnabled: next });
          } catch (e) {
            setError((e as Error).message);
            return;
          }
          await notifyChange();
        }}
      />
      <AddWorkspaceSection
        conflictHint={conflictHint}
        onCreated={async () => {
          setConflictHint(null);
          setError(null);
          await notifyChange();
        }}
        onConflict={(hint) => setConflictHint(hint)}
      />
      <DeletedSection
        items={deleted}
        onRequestPermanent={(w) =>
          setPending({ kind: "permanent-delete", workspace: w })
        }
        onRestore={async (w) => {
          setError(null);
          try {
            await gateway.workspaces.restore(w.id);
          } catch (e) {
            setError((e as Error).message);
            return;
          }
          await notifyChange();
        }}
      />
      {error && (
        <div
          role="alert"
          className="break-words text-[12px] text-red-700"
        >
          {error}
        </div>
      )}

      <ConfirmDialog
        open={pending?.kind === "soft-delete"}
        title={
          pending?.kind === "soft-delete"
            ? `Move "${pending.workspace.name}" to trash?`
            : ""
        }
        body={
          <div className="flex flex-col gap-3">
            <p>
              활성 세션은 즉시 종료됩니다. wiki 파일은 디스크에 그대로 남고,
              <br />
              휴지통에서 언제든 <strong>Restore</strong> 할 수 있습니다.
            </p>
            {pending?.kind === "soft-delete" && (
              <dl className="border border-[var(--hill-rule)] bg-[#1a1208]/[0.02] px-4 py-3 font-mono text-[12px] leading-[1.7]">
                <div className="flex gap-3">
                  <dt className="w-12 opacity-50">name</dt>
                  <dd>{pending.workspace.name}</dd>
                </div>
                <div className="flex gap-3">
                  <dt className="w-12 opacity-50">path</dt>
                  <dd className="break-all">{pending.workspace.path}</dd>
                </div>
              </dl>
            )}
          </div>
        }
        confirmLabel="Move to trash"
        onClose={() => setPending(null)}
        onConfirm={async () => {
          if (pending?.kind !== "soft-delete") return;
          const res = await gateway.workspaces.remove(pending.workspace.id);
          if (!res.ok) {
            throw new Error(`delete failed: ${res.status} ${await res.text()}`);
          }
          setPending(null);
          await notifyChange();
        }}
      />

      <ConfirmDialog
        open={pending?.kind === "permanent-delete"}
        tone="danger"
        title={
          pending?.kind === "permanent-delete"
            ? `Permanently delete "${pending.workspace.name}"`
            : ""
        }
        body={
          <div className="flex flex-col gap-3">
            <p>
              이 작업은 <strong>되돌릴 수 없습니다.</strong> 워크스페이스 레코드,
              과거 세션 기록, wiki 디렉터리가 모두 삭제됩니다.
            </p>
            {pending?.kind === "permanent-delete" && (
              <dl className="border border-[var(--hill-rule)] bg-[#1a1208]/[0.02] px-4 py-3 font-mono text-[12px] leading-[1.7]">
                <div className="flex gap-3">
                  <dt className="w-16 opacity-50">name</dt>
                  <dd>{pending.workspace.name}</dd>
                </div>
                <div className="flex gap-3">
                  <dt className="w-16 opacity-50">path</dt>
                  <dd className="break-all">{pending.workspace.path}</dd>
                </div>
                <div className="flex gap-3">
                  <dt className="w-16 opacity-50">wiki</dt>
                  <dd className="break-all">
                    {pending.workspace.path}/wiki → rm -rf
                  </dd>
                </div>
              </dl>
            )}
          </div>
        }
        confirmLabel="Permanently delete"
        requireTyping={
          pending?.kind === "permanent-delete"
            ? {
                value: pending.workspace.name,
                label: `Type "${pending.workspace.name}" to confirm`,
              }
            : undefined
        }
        onClose={() => setPending(null)}
        onConfirm={async () => {
          if (pending?.kind !== "permanent-delete") return;
          const res = await gateway.workspaces.permanentlyDelete(
            pending.workspace.id,
          );
          if (!res.ok) {
            throw new Error(
              `permanent delete failed: ${res.status} ${await res.text()}`,
            );
          }
          setPending(null);
          await notifyChange();
        }}
      />
    </div>
  );
}

function ActiveSection(props: {
  items: WorkspaceDto[];
  onRequestDelete: (w: WorkspaceDto) => void;
  onToggleHarness: (w: WorkspaceDto, next: boolean) => Promise<void>;
}) {
  const [busyId, setBusyId] = useState<number | null>(null);
  return (
    <section className="flex flex-col gap-3">
      <SectionHeading
        label="Active workspaces"
        count={props.items.length}
      />
      {props.items.length === 0 ? (
        <p className="text-[12px] opacity-50">
          no active workspaces — add one below.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-[var(--hill-rule)] border border-[var(--hill-rule)]">
          {props.items.map((w) => (
            <li
              key={w.id}
              className="flex items-center justify-between gap-3 px-5 py-3.5"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13.5px] text-[#1a1208]">
                  {w.name}
                </div>
                <div className="mt-0.5 truncate font-mono text-[11px] opacity-50">
                  {w.path}
                </div>
              </div>
              <label
                className="flex items-center gap-1.5 text-[12px] opacity-75"
                title="Claude Max 구독 + Agent Teams 실험 기능 필요. codex/gemini 세션에서는 동작하지 않습니다."
              >
                <input
                  type="checkbox"
                  checked={w.harnessEnabled}
                  disabled={busyId === w.id}
                  onChange={async (e) => {
                    setBusyId(w.id);
                    try {
                      await props.onToggleHarness(w, e.target.checked);
                    } finally {
                      setBusyId(null);
                    }
                  }}
                />
                <span>harness</span>
              </label>
              <button
                type="button"
                onClick={() => props.onRequestDelete(w)}
                className={btnGhost}
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function AddWorkspaceSection(props: {
  conflictHint: SoftDeletedHint | null;
  onCreated: () => Promise<void> | void;
  onConflict: (hint: SoftDeletedHint) => void;
}) {
  return (
    <section className="flex flex-col gap-3">
      <SectionHeading label="Add workspace" />
      <WorkspaceForm
        onCreated={() => void props.onCreated()}
        onConflict={props.onConflict}
      />
      {props.conflictHint && (
        <p className="text-[12px] leading-[1.6] opacity-75">
          동일 경로의 삭제된 워크스페이스{" "}
          <strong className="font-semibold">
            “{props.conflictHint.name}”
          </strong>{" "}
          가 휴지통에 있습니다. 아래 목록에서 Restore 하거나 Permanently delete
          한 뒤 다시 추가하세요.
        </p>
      )}
    </section>
  );
}

function DeletedSection(props: {
  items: WorkspaceDto[];
  onRestore: (w: WorkspaceDto) => Promise<void>;
  onRequestPermanent: (w: WorkspaceDto) => void;
}) {
  return (
    <section className="flex flex-col gap-3">
      <SectionHeading label="Trash" count={props.items.length} />
      {props.items.length === 0 ? (
        <p className="text-[12px] opacity-50">empty</p>
      ) : (
        <ul className="flex flex-col divide-y divide-[var(--hill-rule)] border border-[var(--hill-rule)]">
          {props.items.map((w) => (
            <li
              key={w.id}
              className="flex items-center justify-between gap-3 px-5 py-3.5"
            >
              <div className="min-w-0">
                <div className="truncate text-[13.5px] text-[#1a1208]">
                  {w.name}
                </div>
                <div className="mt-0.5 truncate font-mono text-[11px] opacity-50">
                  {w.path}
                </div>
                {w.deletedAt != null && (
                  <div className="mt-1 text-[10px] uppercase tracking-[0.18em] opacity-40">
                    deleted{" "}
                    {new Date(w.deletedAt).toISOString().slice(0, 10)}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void props.onRestore(w)}
                  className={btnGhost}
                >
                  Restore
                </button>
                <button
                  type="button"
                  onClick={() => props.onRequestPermanent(w)}
                  className={btnGhostDanger}
                >
                  Permanently delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

