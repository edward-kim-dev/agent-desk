import type {
  BrainstormingBriefRequest,
  CreateSessionRequest,
  CreateWorkspaceRequest,
  WorkspaceDto,
  SessionDto,
} from "@agent-desk/shared";

export interface BriefResponse {
  session: SessionDto;
  result: {
    injected: boolean;
    reason?: string;
    detail?: string;
  };
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/proxy/${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

type AbortOptions = { signal?: AbortSignal };

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
    brief: (id: number, input: BrainstormingBriefRequest) =>
      call<BriefResponse>(`sessions/${id}/brief`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
  },
  cli: () =>
    call<{
      cli: Array<{ name: string; command: string; defaultArgs: string[] }>;
    }>(`cli`),
};
