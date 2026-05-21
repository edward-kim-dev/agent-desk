import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { WikiSubviewSwitch } from "../components/tabs/wiki/subview-switch";

describe("<WikiSubviewSwitch>", () => {
  it("4개 옵션을 렌더링하고 활성 옵션에 aria-current를 단다", () => {
    render(<WikiSubviewSwitch value="adr" onChange={() => {}} />);
    expect(screen.getByRole("tab", { name: "문서" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "ADR 보드" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Review Queue" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Log" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "ADR 보드" }).getAttribute("aria-current")).toBe("page");
  });

  it("클릭 시 onChange 호출", () => {
    const onChange = vi.fn();
    render(<WikiSubviewSwitch value="docs" onChange={onChange} />);
    fireEvent.click(screen.getByRole("tab", { name: "Log" }));
    expect(onChange).toHaveBeenCalledWith("log");
  });
});
