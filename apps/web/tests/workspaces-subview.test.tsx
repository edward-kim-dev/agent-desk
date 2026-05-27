import { describe, expect, it, vi } from "vitest";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
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

async function openEdit(name: "alpha" | "beta") {
  render(<WorkspacesSubview onChanged={() => {}} />);
  await waitFor(() => expect(screen.getByText(name)).toBeTruthy());
  // Active list row 는 button — name 텍스트 가진 button (Cancel/Save/Delete 아님)
  const row = screen.getAllByRole("button").find((b) => {
    const t = b.textContent ?? "";
    return t.includes(name) && t.includes("/tmp/");
  });
  if (!row) throw new Error(`row for ${name} not found`);
  fireEvent.click(row);
  const form = (await screen.findByRole("form", {
    name: new RegExp(`Edit ${name}`, "i"),
  })) as HTMLFormElement;
  return form;
}

describe("<WorkspacesSubview> — 클릭→편집 폼", () => {
  it("처음에는 편집 폼이 없다", async () => {
    render(<WorkspacesSubview onChanged={() => {}} />);
    await waitFor(() => expect(screen.getByText("alpha")).toBeTruthy());
    expect(screen.queryByRole("form", { name: /Edit /i })).toBeNull();
  });

  it("워크스페이스 행 클릭 시 하단에 편집 폼이 나타난다 (Save/Cancel)", async () => {
    const form = await openEdit("alpha");
    expect(within(form).getByText(/Editing/i)).toBeTruthy();
    expect(within(form).getByRole("button", { name: /save/i })).toBeTruthy();
    expect(within(form).getByRole("button", { name: /cancel/i })).toBeTruthy();
  });

  it("폼 안 name/path 입력은 disabled (수정 불가)", async () => {
    const form = await openEdit("alpha");
    const nameInput = within(form).getByLabelText("Name") as HTMLInputElement;
    const pathInput = within(form).getByLabelText("Path") as HTMLInputElement;
    expect(nameInput.disabled).toBe(true);
    expect(pathInput.disabled).toBe(true);
    expect(nameInput.value).toBe("alpha");
    expect(pathInput.value).toBe("/tmp/alpha");
  });

  it("토글 변경 후 Save → PATCH 호출 + 폼 닫힘", async () => {
    update.mockClear();
    const form = await openEdit("alpha");
    fireEvent.click(within(form).getByLabelText(/harness 활성화/i));
    fireEvent.click(within(form).getByRole("button", { name: /save/i }));
    await waitFor(() =>
      expect(update).toHaveBeenCalledWith(1, { harnessEnabled: true }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("form", { name: /Edit alpha/i })).toBeNull(),
    );
  });

  it("Cancel 클릭 시 PATCH 없이 폼이 닫힌다", async () => {
    update.mockClear();
    const form = await openEdit("beta");
    fireEvent.click(within(form).getByLabelText(/harness 활성화/i));
    fireEvent.click(within(form).getByRole("button", { name: /cancel/i }));
    expect(update).not.toHaveBeenCalled();
    expect(screen.queryByRole("form", { name: /Edit beta/i })).toBeNull();
  });

  it("값이 그대로면 Save 버튼은 disabled", async () => {
    const form = await openEdit("alpha");
    const save = within(form).getByRole("button", {
      name: /save/i,
    }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
  });
});
