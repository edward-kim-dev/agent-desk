import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { WorkspaceForm } from "@/components/workspace-form";

vi.mock("@/lib/gateway-client", () => ({
  gateway: {
    workspaces: {
      create: vi.fn(async () => ({})),
    },
  },
}));

describe("WorkspaceForm — harness 옵션", () => {
  it("기본 상태에서 harness 체크박스는 unchecked", () => {
    render(<WorkspaceForm onCreated={() => {}} />);
    const cb = screen.getByLabelText(/harness/i) as HTMLInputElement;
    expect(cb.checked).toBe(false);
  });

  it("Claude Max 안내 문구가 보인다", () => {
    render(<WorkspaceForm onCreated={() => {}} />);
    expect(screen.getByText(/Claude Max/)).toBeTruthy();
  });

  it("체크박스 토글 시 create 페이로드에 harnessEnabled=true 포함", async () => {
    const { gateway } = await import("@/lib/gateway-client");
    render(<WorkspaceForm onCreated={() => {}} />);
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "ws" },
    });
    fireEvent.change(screen.getByLabelText("Path"), {
      target: { value: "/tmp/ws" },
    });
    fireEvent.click(screen.getByLabelText(/harness/i));
    fireEvent.click(screen.getByRole("button", { name: /Add workspace/i }));
    await new Promise((r) => setTimeout(r, 0));
    expect(gateway.workspaces.create).toHaveBeenCalledWith({
      name: "ws",
      path: "/tmp/ws",
      harnessEnabled: true,
    });
  });
});
