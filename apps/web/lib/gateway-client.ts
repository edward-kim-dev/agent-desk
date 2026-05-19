import type {
  CreateSessionRequest,
  CreateWorkspaceRequest,
  WorkspaceDto,
  SessionDto,
} from "@agent-desk/shared";

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/proxy/${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

export const gateway = {
  workspaces: {
    list: () => call<{ workspaces: WorkspaceDto[] }>(`workspaces`),
    create: (input: CreateWorkspaceRequest) =>
      call<WorkspaceDto>(`workspaces`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    remove: (id: number) =>
      fetch(`/api/proxy/workspaces/${id}`, { method: "DELETE" }),
  },
  sessions: {
    list: () => call<{ sessions: SessionDto[] }>(`sessions`),
    create: (input: CreateSessionRequest) =>
      call<SessionDto>(`sessions`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    remove: (id: number) =>
      fetch(`/api/proxy/sessions/${id}`, { method: "DELETE" }),
  },
  cli: () =>
    call<{
      cli: Array<{ name: string; command: string; defaultArgs: string[] }>;
    }>(`cli`),
};
