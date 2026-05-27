import type {
  AdvanceWorkPackageRequest,
  CompleteWorkPackageRequest,
  CreateSessionRequest,
  CreateWorkspaceRequest,
  PackageCatalogEntry,
  SessionDto,
  StartWorkPackageRequest,
  UpdateWorkspaceRequest,
  WorkPackageArtifactDto,
  WorkPackageDto,
  WorkspaceDto,
} from "@agent-desk/shared";

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/proxy/${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

type AbortOptions = { signal?: AbortSignal };

export interface StartWorkPackageResponse {
  instance: WorkPackageDto;
  step: { index: number; title: string };
  inject?: { injected: boolean; reason?: string; detail?: string };
  install?: { status: string; linkPath?: string; sourcePath?: string; detail?: string };
}

export interface AdvanceWorkPackageResponse extends StartWorkPackageResponse {
  artifactsDelta?: { inserted: number; updatedDrift: number };
}

export const gateway = {
  workspaces: {
    list: (opts?: AbortOptions) =>
      call<{ workspaces: WorkspaceDto[] }>(`workspaces`, opts),
    listDeleted: (opts?: AbortOptions) =>
      call<{ workspaces: WorkspaceDto[] }>(`workspaces?onlyDeleted=true`, opts),
    create: (input: CreateWorkspaceRequest) =>
      call<WorkspaceDto>(`workspaces`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    update: (id: number, input: UpdateWorkspaceRequest) =>
      call<WorkspaceDto>(`workspaces/${id}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    remove: (id: number) =>
      fetch(`/api/proxy/workspaces/${id}`, { method: "DELETE" }),
    restore: (id: number) =>
      call<WorkspaceDto>(`workspaces/${id}/restore`, { method: "POST" }),
    permanentlyDelete: (id: number) =>
      fetch(`/api/proxy/workspaces/${id}/permanent`, { method: "DELETE" }),
  },
  sessions: {
    list: (opts?: AbortOptions) =>
      call<{ sessions: SessionDto[] }>(`sessions`, opts),
    create: (input: CreateSessionRequest) =>
      call<SessionDto>(`sessions`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    remove: (id: number) =>
      fetch(`/api/proxy/sessions/${id}`, { method: "DELETE" }),
  },
  packages: {
    list: (opts?: AbortOptions) =>
      call<{ packages: PackageCatalogEntry[] }>(`packages`, opts),
  },
  workPackages: {
    listForSession: (sessionId: number, opts?: AbortOptions) =>
      call<{ instances: WorkPackageDto[] }>(
        `sessions/${sessionId}/work-packages`,
        opts,
      ),
    listArtifacts: (id: number, opts?: AbortOptions) =>
      call<{ artifacts: WorkPackageArtifactDto[] }>(
        `work-packages/${id}/artifacts`,
        opts,
      ),
    start: (sessionId: number, input: StartWorkPackageRequest) =>
      call<StartWorkPackageResponse>(`sessions/${sessionId}/work-packages`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    advance: (id: number, input: AdvanceWorkPackageRequest) =>
      call<AdvanceWorkPackageResponse>(`work-packages/${id}/advance`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    complete: (id: number, input?: CompleteWorkPackageRequest) =>
      call<{ instance: WorkPackageDto }>(`work-packages/${id}/complete`, {
        method: "POST",
        body: JSON.stringify(input ?? { outcome: "success" }),
      }),
    scan: (id: number) =>
      call<{ artifactsDelta: { inserted: number; updatedDrift: number } }>(
        `work-packages/${id}/scan`,
        { method: "POST", body: JSON.stringify({}) },
      ),
  },
  cli: () =>
    call<{
      cli: Array<{ name: string; command: string; defaultArgs: string[] }>;
    }>(`cli`),
};
