import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GraphTab } from "../components/tabs/graph-tab";

describe("<GraphTab>", () => {
  it("placeholder 안내와 disabled 컨트롤을 렌더", () => {
    const { container } = render(<GraphTab />);
    expect(screen.getByText(/coming in v0.3/i)).toBeTruthy();
    expect(screen.getByLabelText(/search/i)).toHaveProperty("disabled", true);
    expect(container.querySelector('[data-stub="true"]')).toBeTruthy();
  });
});
