import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HarnessTab } from "../components/tabs/harness-tab";

describe("<HarnessTab>", () => {
  it("기본 서브뷰는 Memory이고 다른 서브뷰로 전환 가능", () => {
    render(<HarnessTab />);
    expect(screen.getByText(/source of truth/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Hooks" }));
    expect(screen.getByRole("columnheader", { name: "Event" })).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Adapters" }));
    expect(screen.getByText("claude")).toBeTruthy();
    expect(screen.getByText("gemini")).toBeTruthy();
    expect(screen.getByText("codex")).toBeTruthy();
  });
});
