import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TabBar } from "../components/tabs/tab-bar";

describe("<TabBar>", () => {
  it("5개 탭을 렌더링하고 활성 탭에 aria-current를 단다", () => {
    render(<TabBar value="wiki" onChange={() => {}} />);
    expect(screen.getByRole("tab", { name: "Terminal" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Wiki" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Graph" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Harness" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Settings" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Wiki" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("tab", { name: "Terminal" }).getAttribute("aria-current")).toBeNull();
  });

  it("탭 클릭 시 해당 키로 onChange를 호출한다", () => {
    const onChange = vi.fn();
    render(<TabBar value="terminal" onChange={onChange} />);
    fireEvent.click(screen.getByRole("tab", { name: "Settings" }));
    expect(onChange).toHaveBeenCalledWith("settings");
  });
});
