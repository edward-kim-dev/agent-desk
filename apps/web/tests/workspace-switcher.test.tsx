import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { WorkspaceSwitcher } from "../components/workspace-switcher";

describe("<WorkspaceSwitcher>", () => {
  it("활성 워크스페이스 이름을 렌더링한다", () => {
    render(
      <WorkspaceSwitcher
        workspaces={[
          {
            id: 1,
            name: "owngo",
            path: "/workspaces/owngo",
            createdAt: 0,
            deletedAt: null,
            harnessEnabled: false,
          },
          {
            id: 2,
            name: "side",
            path: "/tmp/side",
            createdAt: 0,
            deletedAt: null,
            harnessEnabled: false,
          },
        ]}
        activeId={2}
        onSelect={() => {}}
      />
    );
    expect(screen.getByRole("button", { name: /side/i })).toBeTruthy();
  });

  it("목록이 비었을 때 'no workspace'를 렌더링한다", () => {
    render(<WorkspaceSwitcher workspaces={[]} activeId={null} onSelect={() => {}} />);
    expect(screen.getByText(/no workspace/i)).toBeTruthy();
  });
});
