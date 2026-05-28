import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useProgressSocket, type StepReadyEvent } from "../hooks/use-progress-socket";

interface FakeWs {
  url: string;
  readyState: number;
  send: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  onmessage?: (ev: { data: string }) => void;
  onclose?: (ev: { code: number }) => void;
}

let instances: FakeWs[] = [];

class MockWebSocket implements FakeWs {
  static OPEN = 1;
  static CLOSED = 3;
  readyState = 1;
  url: string;
  send = vi.fn();
  close = vi.fn(() => { this.readyState = MockWebSocket.CLOSED; });
  onmessage?: (ev: { data: string }) => void;
  onclose?: (ev: { code: number }) => void;
  constructor(url: string) {
    this.url = url;
    instances.push(this);
  }
}

const realWs = globalThis.WebSocket;

beforeEach(() => {
  instances = [];
  (globalThis as unknown as { WebSocket: typeof MockWebSocket }).WebSocket = MockWebSocket;
  Object.defineProperty(window, "location", {
    value: { protocol: "http:", hostname: "localhost" },
    writable: true,
  });
});

afterEach(() => {
  (globalThis as unknown as { WebSocket: typeof realWs }).WebSocket = realWs;
});

describe("useProgressSocket", () => {
  it("sessionId null이면 WS 연결 안 함", () => {
    renderHook(() => useProgressSocket({ sessionId: null, onStepReady: vi.fn() }));
    expect(instances).toHaveLength(0);
  });

  it("sessionId 있으면 /sessions/:id/progress WS 연결", () => {
    renderHook(() => useProgressSocket({ sessionId: 5, onStepReady: vi.fn() }));
    expect(instances).toHaveLength(1);
    expect(instances[0].url).toContain("/sessions/5/progress");
    expect(instances[0].url).toContain(":3334");
  });

  it("step_ready 메시지 수신 시 onStepReady 콜백 호출", () => {
    const onStepReady = vi.fn();
    renderHook(() => useProgressSocket({ sessionId: 5, onStepReady }));
    act(() => {
      instances[0].onmessage?.({
        data: JSON.stringify({
          type: "step_ready",
          workPackageId: 10,
          stepIndex: 1,
          stepTitle: "Brainstorm",
        }),
      });
    });
    expect(onStepReady).toHaveBeenCalledWith({
      workPackageId: 10,
      stepIndex: 1,
      stepTitle: "Brainstorm",
    });
  });

  it("알 수 없는 메시지 타입은 무시", () => {
    const onStepReady = vi.fn();
    renderHook(() => useProgressSocket({ sessionId: 5, onStepReady }));
    act(() => {
      instances[0].onmessage?.({ data: JSON.stringify({ type: "unknown" }) });
    });
    expect(onStepReady).not.toHaveBeenCalled();
  });

  it("잘못된 JSON은 무시", () => {
    const onStepReady = vi.fn();
    renderHook(() => useProgressSocket({ sessionId: 5, onStepReady }));
    expect(() => {
      act(() => {
        instances[0].onmessage?.({ data: "not-json{{" });
      });
    }).not.toThrow();
    expect(onStepReady).not.toHaveBeenCalled();
  });

  it("unmount 시 WS close 호출", () => {
    const { unmount } = renderHook(() =>
      useProgressSocket({ sessionId: 5, onStepReady: vi.fn() }),
    );
    unmount();
    expect(instances[0].close).toHaveBeenCalled();
  });

  it("sessionId 변경 시 이전 WS 닫고 새 WS 연결", () => {
    const { rerender } = renderHook(
      ({ id }: { id: number }) =>
        useProgressSocket({ sessionId: id, onStepReady: vi.fn() }),
      { initialProps: { id: 1 } },
    );
    rerender({ id: 2 });
    expect(instances).toHaveLength(2);
    expect(instances[0].close).toHaveBeenCalled();
    expect(instances[1].url).toContain("/sessions/2/progress");
  });
});
