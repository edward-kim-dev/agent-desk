import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import {
  useTerminalSocket,
  type TerminalSocketCloseReason,
  type TerminalSocketHandlers,
} from "../hooks/use-terminal-socket";

interface FakeWs {
  url: string;
  readyState: number;
  send: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  onopen?: () => void;
  onmessage?: (ev: { data: string }) => void;
  onclose?: (ev: { code: number; reason?: string }) => void;
}

let instances: FakeWs[] = [];

class MockWebSocket implements FakeWs {
  static OPEN = 1;
  static CLOSED = 3;
  readyState = 1;
  url: string;
  send = vi.fn();
  close = vi.fn(() => {
    this.readyState = MockWebSocket.CLOSED;
  });
  onopen?: () => void;
  onmessage?: (ev: { data: string }) => void;
  onclose?: (ev: { code: number; reason?: string }) => void;
  constructor(url: string) {
    this.url = url;
    instances.push(this);
  }
}

const realWs = globalThis.WebSocket;

beforeEach(() => {
  vi.useFakeTimers();
  instances = [];
  (globalThis as unknown as { WebSocket: typeof MockWebSocket }).WebSocket =
    MockWebSocket;
  Object.defineProperty(window, "location", {
    value: { protocol: "http:", hostname: "localhost" },
    writable: true,
  });
});

afterEach(() => {
  vi.useRealTimers();
  (globalThis as unknown as { WebSocket: typeof realWs }).WebSocket = realWs;
});

function makeHandlers(): {
  handlers: TerminalSocketHandlers;
  closeReasons: TerminalSocketCloseReason[];
  chunks: string[];
} {
  const closeReasons: TerminalSocketCloseReason[] = [];
  const chunks: string[] = [];
  return {
    closeReasons,
    chunks,
    handlers: {
      onData: (c) => chunks.push(c),
      onClose: (r) => closeReasons.push(r),
    },
  };
}

describe("useTerminalSocket", () => {
  it("정상 종료(1000) 시 재연결하지 않고 'ended' 사유를 전달한다", () => {
    const { handlers, closeReasons } = makeHandlers();
    renderHook(() =>
      useTerminalSocket(42, 80, 24, handlers),
    );
    expect(instances).toHaveLength(1);
    instances[0].onclose?.({ code: 1000 });
    vi.advanceTimersByTime(10_000);
    expect(instances).toHaveLength(1);
    expect(closeReasons).toEqual([{ kind: "ended" }]);
  });

  it("not_found(4404) 시 재연결하지 않는다", () => {
    const { handlers, closeReasons } = makeHandlers();
    renderHook(() => useTerminalSocket(42, 80, 24, handlers));
    instances[0].onclose?.({ code: 4404 });
    vi.advanceTimersByTime(10_000);
    expect(instances).toHaveLength(1);
    expect(closeReasons).toEqual([{ kind: "not_found" }]);
  });

  it("unauthorized(4401) 시 재연결하지 않는다", () => {
    const { handlers, closeReasons } = makeHandlers();
    renderHook(() => useTerminalSocket(42, 80, 24, handlers));
    instances[0].onclose?.({ code: 4401 });
    vi.advanceTimersByTime(10_000);
    expect(instances).toHaveLength(1);
    expect(closeReasons).toEqual([{ kind: "unauthorized" }]);
  });

  it("일시적 close(1006)에서는 백오프로 재연결을 시도한다", () => {
    const { handlers, closeReasons } = makeHandlers();
    renderHook(() => useTerminalSocket(42, 80, 24, handlers));
    expect(instances).toHaveLength(1);
    instances[0].onclose?.({ code: 1006 });
    // 첫 백오프(250ms) 통과
    vi.advanceTimersByTime(260);
    expect(instances).toHaveLength(2);
    expect(closeReasons[0]).toEqual({ kind: "transient", willRetryInMs: 250 });
  });

  it("sessionId가 null이면 연결하지 않는다", () => {
    const { handlers } = makeHandlers();
    renderHook(() => useTerminalSocket(null, 80, 24, handlers));
    expect(instances).toHaveLength(0);
  });
});
