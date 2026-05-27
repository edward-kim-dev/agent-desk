import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { PackageCatalogEntry } from "@agent-desk/shared";
import { PackagePicker } from "../components/package-picker";

const planning: PackageCatalogEntry = {
  id: "planning",
  title: "기획",
  description: "spec → plan",
  cliRequirement: "claude",
  fields: [],
  stepTitles: ["Brainstorm", "Write plan"],
};

describe("<PackagePicker>", () => {
  it("카드를 렌더하고 클릭 시 onSelect 호출", () => {
    const onSelect = vi.fn();
    render(
      <PackagePicker
        packages={[planning]}
        sessionCli="claude"
        onSelect={onSelect}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /기획/ }));
    expect(onSelect).toHaveBeenCalledWith("planning");
  });

  it("cli mismatch 면 disabled + tooltip", () => {
    render(
      <PackagePicker
        packages={[planning]}
        sessionCli="codex"
        onSelect={() => {}}
      />,
    );
    const btn = screen.getByRole("button", { name: /기획/ }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(btn.getAttribute("title")).toMatch(/claude/i);
  });

  it("패키지가 비면 안내 텍스트", () => {
    render(
      <PackagePicker packages={[]} sessionCli="claude" onSelect={() => {}} />,
    );
    expect(screen.getByText(/no packages/i)).toBeTruthy();
  });
});
