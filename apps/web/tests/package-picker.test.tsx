import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { PackageCatalogEntry } from "@agent-desk/shared";
import { PackagePicker } from "../components/package-picker";

const planning: PackageCatalogEntry = {
  id: "planning",
  title: "기획",
  description: "spec → plan",
  cliRequirement: "claude",
  forms: [{ step: 1, fields: [{ name: "topic", label: "Topic", kind: "text" }] }],
  stepTitles: ["Brainstorm", "Write plan"],
};

const develop: PackageCatalogEntry = {
  id: "develop",
  title: "구현",
  description: "executing-plans",
  cliRequirement: "claude",
  forms: [{ step: 1, fields: [] }],
  stepTitles: ["Execute plan"],
};

const freeform: PackageCatalogEntry = {
  id: "freeform",
  title: "자유 진행",
  description: "free prompt",
  cliRequirement: "any",
  forms: [{ step: 1, fields: [] }],
  stepTitles: ["Work"],
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

  it("검색어로 패키지를 필터한다", () => {
    render(
      <PackagePicker
        packages={[planning, develop, freeform]}
        sessionCli="claude"
        onSelect={() => {}}
      />,
    );
    // 초기엔 셋 다 보임
    expect(screen.getByRole("button", { name: /기획/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /구현/ })).toBeTruthy();

    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "구현" },
    });
    expect(screen.getByRole("button", { name: /구현/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /기획/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /자유 진행/ })).toBeNull();
  });

  it("매칭이 없으면 No matches 안내", () => {
    render(
      <PackagePicker
        packages={[planning, develop, freeform]}
        sessionCli="claude"
        onSelect={() => {}}
      />,
    );
    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "zzzz" },
    });
    expect(screen.getByText(/no matches/i)).toBeTruthy();
  });
});
