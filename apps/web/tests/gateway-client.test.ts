import { afterEach, describe, expect, it, vi } from "vitest";
import { gateway } from "../lib/gateway-client";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("gateway-client", () => {
  it("sessions.list가 호출자의 AbortSignal을 fetch로 전달한다", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      return new Response(JSON.stringify({ sessions: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const controller = new AbortController();
    await gateway.sessions.list({ signal: controller.signal });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("workspaces.list가 호출자의 AbortSignal을 fetch로 전달한다", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      return new Response(JSON.stringify({ workspaces: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const controller = new AbortController();
    await gateway.workspaces.list({ signal: controller.signal });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("abort된 요청은 AbortError로 reject된다", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const signal = init?.signal;
      return await new Promise<Response>((_resolve, reject) => {
        if (signal?.aborted) {
          reject(new DOMException("Aborted", "AbortError"));
          return;
        }
        signal?.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"));
        });
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const controller = new AbortController();
    const promise = gateway.sessions.list({ signal: controller.signal });
    controller.abort();
    await expect(promise).rejects.toMatchObject({ name: "AbortError" });
  });
});
