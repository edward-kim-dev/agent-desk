import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppHeader } from "../components/app-header";

const workspaces = [
  { id: 1, name: "owngo", path: "/workspaces/owngo", createdAt: 0, deletedAt: null },
];

describe("<AppHeader>", () => {
  it("로고·탭 nav·워크스페이스 스위처를 렌더한다", () => {
    render(
      <AppHeader
        workspaces={workspaces}
        activeId={1}
        onSelectWorkspace={() => {}}
        tab="terminal"
        onTabChange={() => {}}
      />
    );
    expect(screen.getByText(/agent-desk/i)).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Terminal" })).toBeTruthy();
    expect(
      screen.getByRole("tab", { name: "Terminal" }).getAttribute("aria-current")
    ).toBe("page");
    expect(screen.getByRole("button", { name: /owngo/i })).toBeTruthy();
  });

  it("탭 클릭 시 onTabChange에 새 탭 키를 전달한다", () => {
    const onTabChange = vi.fn();
    render(
      <AppHeader
        workspaces={workspaces}
        activeId={1}
        onSelectWorkspace={() => {}}
        tab="terminal"
        onTabChange={onTabChange}
      />
    );
    fireEvent.click(screen.getByRole("tab", { name: "Wiki" }));
    expect(onTabChange).toHaveBeenCalledWith("wiki");
  });

  it("subviewSlot이 전달되면 meta 줄에 렌더한다", () => {
    render(
      <AppHeader
        workspaces={workspaces}
        activeId={1}
        onSelectWorkspace={() => {}}
        tab="wiki"
        onTabChange={() => {}}
        subviewSlot={<div data-testid="slot">SLOT</div>}
      />
    );
    expect(screen.getByTestId("slot")).toBeTruthy();
  });
});
