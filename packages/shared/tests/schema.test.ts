import { describe, expect, it } from "vitest";
import { sessions, sessionEvents, workspaces } from "../src/db/schema";

describe("db 스키마", () => {
  it("workspaces 테이블이 기대한 컬럼을 노출한다", () => {
    const cols = Object.keys(workspaces);
    expect(cols).toEqual(
      expect.arrayContaining(["id", "path", "name", "createdAt"])
    );
  });

  it("sessions 테이블이 기대한 컬럼을 노출한다", () => {
    const cols = Object.keys(sessions);
    expect(cols).toEqual(
      expect.arrayContaining([
        "id",
        "tmuxName",
        "workspaceId",
        "cli",
        "args",
        "status",
        "lastActivityAt",
        "createdAt",
        "adopted",
      ])
    );
  });

  it("session_events 테이블이 기대한 컬럼을 노출한다", () => {
    const cols = Object.keys(sessionEvents);
    expect(cols).toEqual(
      expect.arrayContaining(["id", "sessionId", "kind", "payloadJson", "at"])
    );
  });
});
