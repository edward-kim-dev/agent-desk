import { describe, expect, it } from "vitest";
import {
  createSessionRequest,
  createWorkspaceRequest,
  writeWikiFileRequest,
} from "../src";

describe("api 스키마", () => {
  it("선행 슬래시가 없는 워크스페이스 경로를 거부한다", () => {
    const result = createWorkspaceRequest.safeParse({
      name: "owngo",
      path: "owngo",
    });
    expect(result.success).toBe(false);
  });

  it("올바른 형식의 워크스페이스를 수락한다", () => {
    const result = createWorkspaceRequest.safeParse({
      name: "owngo",
      path: "/workspaces/owngo",
    });
    expect(result.success).toBe(true);
  });

  it("workspaceId 없는 세션 요청을 거부한다", () => {
    const result = createSessionRequest.safeParse({
      cli: "claude",
      args: [],
    });
    expect(result.success).toBe(false);
  });

  it("절대 경로 또는 ..을 포함한 위키 쓰기를 거부한다", () => {
    expect(
      writeWikiFileRequest.safeParse({ path: "/etc/passwd", content: "" })
        .success
    ).toBe(false);
    expect(
      writeWikiFileRequest.safeParse({ path: "../escape.md", content: "" })
        .success
    ).toBe(false);
  });

  it("상대 경로 위키 쓰기를 수락한다", () => {
    expect(
      writeWikiFileRequest.safeParse({
        path: "L1-claims/note.md",
        content: "hi",
      }).success
    ).toBe(true);
  });
});
