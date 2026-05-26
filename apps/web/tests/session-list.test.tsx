import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SessionList } from "../components/session-list";

describe("<SessionList>", () => {
  it("기본적으로 active 상태인 세션만 렌더링한다", () => {
    render(
      <SessionList
        sessions={[
          {
            id: 1,
            tmuxName: "ad-foo-aaaaaa",
            workspaceId: 1,
            cli: "claude",
            args: "",
            status: "active",
            adopted: false,
            attachedClients: 1,
            lastActivityAt: 0,
            createdAt: 0,
            briefedAt: null,
          },
          {
            id: 2,
            tmuxName: "ad-bar-bbbbbb",
            workspaceId: 1,
            cli: "gemini",
            args: "",
            status: "dead",
            adopted: false,
            attachedClients: 0,
            lastActivityAt: 0,
            createdAt: 0,
            briefedAt: null,
          },
        ]}
        activeWorkspaceId={1}
        selectedId={null}
        onSelect={() => {}}
        onKill={() => {}}
      />
    );
    expect(screen.queryByText(/ad-foo/)).toBeTruthy();
    expect(screen.queryByText(/ad-bar/)).toBeNull();
  });
});
