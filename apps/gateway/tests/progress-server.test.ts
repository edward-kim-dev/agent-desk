import { describe, it, expect, vi, beforeEach } from "vitest";
import { createServer as createHttpServer } from "node:http";
import { WebSocket } from "ws";
import {
  createProgressServer,
  type ProgressServer,
} from "../src/ws/progress-server";

function makeWs(readyState = 1 /* OPEN */) {
  return {
    readyState,
    send: vi.fn(),
    close: vi.fn(),
    on: vi.fn(),
    OPEN: 1,
    CLOSED: 3,
  };
}

let server: ProgressServer;

beforeEach(() => {
  server = createProgressServer();
});

describe("subscribe / broadcastStepReady", () => {
  it("subscribe 후 broadcastStepReady → send 호출", () => {
    const ws = makeWs();
    server.subscribe(1, ws as never);
    server.broadcastStepReady({
      sessionId: 1,
      workPackageId: 10,
      stepIndex: 1,
      stepTitle: "Brainstorm",
    });
    expect(ws.send).toHaveBeenCalledOnce();
    const msg = JSON.parse((ws.send as ReturnType<typeof vi.fn>).mock.calls[0][0]);
    expect(msg).toEqual({
      type: "step_ready",
      workPackageId: 10,
      stepIndex: 1,
      stepTitle: "Brainstorm",
    });
  });

  it("unsubscribe 후 broadcastStepReady → send 미호출", () => {
    const ws = makeWs();
    server.subscribe(1, ws as never);
    server.unsubscribe(1, ws as never);
    server.broadcastStepReady({
      sessionId: 1, workPackageId: 10, stepIndex: 1, stepTitle: "Brainstorm",
    });
    expect(ws.send).not.toHaveBeenCalled();
  });

  it("CLOSED 상태 ws는 send 건너뜀", () => {
    const ws = makeWs(3 /* CLOSED */);
    server.subscribe(1, ws as never);
    server.broadcastStepReady({
      sessionId: 1, workPackageId: 10, stepIndex: 1, stepTitle: "Brainstorm",
    });
    expect(ws.send).not.toHaveBeenCalled();
  });

  it("구독자 없는 세션 broadcastStepReady → 에러 없음", () => {
    expect(() =>
      server.broadcastStepReady({
        sessionId: 99, workPackageId: 10, stepIndex: 1, stepTitle: "Brainstorm",
      }),
    ).not.toThrow();
  });
});

describe("attachToHttpServer", () => {
  it("valid token → WS connects and subscribe is called", (done) => {
    const token = "test-token";
    const srv = createProgressServer();
    const httpServer = createHttpServer();

    srv.attachToHttpServer(httpServer, token);
    httpServer.listen(0, "127.0.0.1", () => {
      const addr = httpServer.address() as { port: number };
      const ws = new WebSocket(
        `ws://127.0.0.1:${addr.port}/sessions/42/progress?token=${token}`
      );
      ws.onopen = () => {
        // verify broadcast reaches this client
        srv.broadcastStepReady({
          sessionId: 42,
          workPackageId: 1,
          stepIndex: 1,
          stepTitle: "Test",
        });
      };
      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data as string);
        expect(msg.type).toBe("step_ready");
        ws.close();
        srv.close();
        httpServer.close(() => done());
      };
      ws.onerror = done;
    });
  });

  it("invalid token → WS closes with 4401", (done) => {
    const srv = createProgressServer();
    const httpServer = createHttpServer();

    srv.attachToHttpServer(httpServer, "correct-token");
    httpServer.listen(0, "127.0.0.1", () => {
      const addr = httpServer.address() as { port: number };
      const ws = new WebSocket(
        `ws://127.0.0.1:${addr.port}/sessions/42/progress?token=wrong-token`
      );
      ws.onclose = (e) => {
        expect(e.code).toBe(4401);
        srv.close();
        httpServer.close(() => done());
      };
      ws.onerror = () => {}; // suppress
    });
  });
});
