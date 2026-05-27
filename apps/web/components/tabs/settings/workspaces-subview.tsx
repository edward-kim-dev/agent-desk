"use client";
import { useCallback, useEffect, useId, useState } from "react";
import type { WorkspaceDto } from "@agent-desk/shared";
import { gateway } from "@/lib/gateway-client";
import { WorkspaceForm } from "../../workspace-form";
import { ConfirmDialog } from "../../confirm-dialog";
import { SectionHeading } from "../../ui/section-heading";
import { btnGhost, btnGhostDanger, btnPrimary } from "../../ui/button-classes";
import { Field, fieldControl } from "../../ui/field";

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
        onSave={async (w, patch) => {
          setError(null);
          try {
            await gateway.workspaces.update(w.id, patch);
          } catch (e) {
            setError((e as Error).message);
            throw e;
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
  onSave: (
    w: WorkspaceDto,
    patch: { harnessEnabled: boolean },
  ) => Promise<void>;
}) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const editing = props.items.find((w) => w.id === editingId) ?? null;

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
          {props.items.map((w) => {
            const selected = editingId === w.id;
            return (
              <li
                key={w.id}
                className={`flex items-center justify-between gap-3 px-5 py-3.5 ${selected ? "bg-[#1a1208]/[0.04]" : ""}`}
              >
                <button
                  type="button"
                  onClick={() =>
                    setEditingId((prev) => (prev === w.id ? null : w.id))
                  }
                  aria-pressed={selected}
                  className="min-w-0 flex-1 text-left"
                >
                  <div className="flex items-center gap-2 truncate text-[13.5px] text-[#1a1208]">
                    <span className="truncate">{w.name}</span>
                    {w.harnessEnabled && (
                      <span
                        className="shrink-0 whitespace-nowrap rounded border border-[var(--hill-rule)] px-1.5 text-[10px] opacity-60"
                        title="Claude Code Agent Teams 실험 기능이 활성화된 워크스페이스입니다. Claude Max 구독 필요."
                      >
                        Claude Agent Teams · 실험
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 truncate font-mono text-[11px] opacity-50">
                    {w.path}
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => props.onRequestDelete(w)}
                  className={btnGhost}
                >
                  Delete
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {editing && (
        <EditWorkspaceForm
          workspace={editing}
          onCancel={() => setEditingId(null)}
          onSave={async (patch) => {
            await props.onSave(editing, patch);
            setEditingId(null);
          }}
        />
      )}
    </section>
  );
}

function EditWorkspaceForm(props: {
  workspace: WorkspaceDto;
  onCancel: () => void;
  onSave: (patch: { harnessEnabled: boolean }) => Promise<void>;
}) {
  const nameId = useId();
  const pathId = useId();
  const harnessId = useId();
  const [harness, setHarness] = useState(props.workspace.harnessEnabled);
  const [busy, setBusy] = useState(false);

  // 다른 워크스페이스로 선택이 바뀌면 폼 상태 리셋
  useEffect(() => {
    setHarness(props.workspace.harnessEnabled);
  }, [props.workspace.id, props.workspace.harnessEnabled]);

  const dirty = harness !== props.workspace.harnessEnabled;

  return (
    <form
      aria-label={`Edit ${props.workspace.name}`}
      className="flex flex-col gap-4 border border-[var(--hill-rule)] p-5"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!dirty || busy) return;
        setBusy(true);
        try {
          await props.onSave({ harnessEnabled: harness });
        } catch {
          // 에러는 상위 alert 슬롯에 표시됨
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="text-[12px] opacity-60">
        Editing{" "}
        <strong className="font-semibold opacity-90">
          {props.workspace.name}
        </strong>
      </div>
      <Field htmlFor={nameId} label="Name" hint="이름은 수정할 수 없습니다.">
        <input
          id={nameId}
          value={props.workspace.name}
          disabled
          className={`${fieldControl} opacity-60`}
        />
      </Field>
      <Field htmlFor={pathId} label="Path" hint="경로는 수정할 수 없습니다.">
        <input
          id={pathId}
          value={props.workspace.path}
          disabled
          className={`${fieldControl} font-mono text-[12.5px] opacity-60`}
        />
      </Field>
      <div className="flex flex-col gap-1">
        <label className="flex items-center gap-2 text-[13px]" htmlFor={harnessId}>
          <input
            id={harnessId}
            type="checkbox"
            checked={harness}
            onChange={(e) => setHarness(e.target.checked)}
          />
          <span>harness 활성화 (Claude Code 전용)</span>
        </label>
        <p className="ml-6 text-[12px] text-[var(--hill-muted)]">
          Claude Max 구독 + Agent Teams 실험 기능이 필요합니다.
          codex / gemini 세션에서는 동작하지 않습니다.
          토글 해제 시 .claude/skills/harness symlink 가 자동 제거됩니다.
        </p>
      </div>
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={props.onCancel}
          disabled={busy}
          className={btnGhost}
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!dirty || busy}
          className={btnPrimary}
        >
          {busy ? "…" : "Save"}
        </button>
      </div>
    </form>
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

