import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DatabaseSubview } from "../components/tabs/settings/database-subview";

describe("<DatabaseSubview>", () => {
  it("모든 입력은 disabled, password 입력란은 존재하지 않고 .env 안내가 보인다", () => {
    render(<DatabaseSubview />);
    expect(screen.getByLabelText(/host/i)).toHaveProperty("disabled", true);
    expect(screen.getByLabelText(/port/i)).toHaveProperty("disabled", true);
    expect(screen.getByLabelText(/database/i)).toHaveProperty("disabled", true);
    expect(screen.getByLabelText(/user/i)).toHaveProperty("disabled", true);
    expect(screen.queryByLabelText(/password/i)).toBeNull();
    expect(screen.getByText(/AGENT_DESK_DB_PASSWORD/)).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /test connection/i })
    ).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: /save/i })).toHaveProperty("disabled", true);
  });
});
