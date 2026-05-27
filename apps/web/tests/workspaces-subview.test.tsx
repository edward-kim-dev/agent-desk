import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { WorkspacesSubview } from "@/components/tabs/settings/workspaces-subview";

const wsActive = [
  {
    id: 1,
    name: "alpha",
    path: "/tmp/alpha",
    createdAt: 0,
    deletedAt: null,
    harnessEnabled: false,
  },
  {
    id: 2,
    name: "beta",
    path: "/tmp/beta",
    createdAt: 0,
    deletedAt: null,
    harnessEnabled: true,
  },
];

const update = vi.fn(
  async (_id: number, _input: { harnessEnabled: boolean }) => ({}),
);
const list = vi.fn(async () => ({ workspaces: wsActive }));
const listDeleted = vi.fn(async () => ({ workspaces: [] }));

vi.mock("@/lib/gateway-client", () => ({
  gateway: {
    workspaces: {
      list: () => list(),
      listDeleted: () => listDeleted(),
      update: (id: number, input: { harnessEnabled: boolean }) =>
        update(id, input),
      create: vi.fn(),
      remove: vi.fn(),
      restore: vi.fn(),
      permanentlyDelete: vi.fn(),
    },
  },
}));

describe("<WorkspacesSubview> — harness 토글", () => {
  it("각 활성 워크스페이스 행에 harness 체크박스가 현재 상태로 렌더된다", async () => {
    render(<WorkspacesSubview onChanged={() => {}} />);
    await waitFor(() => expect(screen.getByText("alpha")).toBeTruthy());
    const checkboxes = screen.getAllByRole("checkbox") as HTMLInputElement[];
    // alpha (off), beta (on) 순으로 렌더
    expect(checkboxes[0].checked).toBe(false);
    expect(checkboxes[1].checked).toBe(true);
  });

  it("체크박스 토글 시 PATCH 가 호출된다", async () => {
    update.mockClear();
    render(<WorkspacesSubview onChanged={() => {}} />);
    await waitFor(() => expect(screen.getByText("alpha")).toBeTruthy());
    const checkboxes = screen.getAllByRole("checkbox") as HTMLInputElement[];
    // alpha (id=1) 토글 ON
    fireEvent.click(checkboxes[0]);
    await waitFor(() =>
      expect(update).toHaveBeenCalledWith(1, { harnessEnabled: true }),
    );
  });

  it("beta (id=2) 토글 OFF 는 harnessEnabled=false 로 PATCH", async () => {
    update.mockClear();
    render(<WorkspacesSubview onChanged={() => {}} />);
    await waitFor(() => expect(screen.getByText("beta")).toBeTruthy());
    const checkboxes = screen.getAllByRole("checkbox") as HTMLInputElement[];
    fireEvent.click(checkboxes[1]);
    await waitFor(() =>
      expect(update).toHaveBeenCalledWith(2, { harnessEnabled: false }),
    );
  });
});
