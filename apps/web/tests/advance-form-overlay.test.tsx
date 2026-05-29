import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { FieldSpec } from "@agent-desk/shared";
import { AdvanceFormOverlay } from "../components/advance-form-overlay";

const fields: FieldSpec[] = [
  { name: "guidance", label: "Plan guidance", kind: "textarea", maxLength: 100 },
];

describe("<AdvanceFormOverlay>", () => {
  it("필드를 렌더하고 제출 시 onSubmit(inputs) 호출", async () => {
    const onSubmit = vi.fn();
    render(
      <AdvanceFormOverlay
        nextStepTitle="Write plan"
        fields={fields}
        onSubmit={onSubmit}
        onCancel={() => {}}
      />,
    );
    fireEvent.change(screen.getByLabelText(/Plan guidance/i), {
      target: { value: "be terse" },
    });
    fireEvent.submit(screen.getByRole("form"));
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({ guidance: "be terse" }),
    );
  });

  it("빈 입력으로도 제출 가능(옵셔널 필드)", async () => {
    const onSubmit = vi.fn();
    render(
      <AdvanceFormOverlay
        nextStepTitle="Write plan"
        fields={fields}
        onSubmit={onSubmit}
        onCancel={() => {}}
      />,
    );
    fireEvent.submit(screen.getByRole("form"));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({}));
  });

  it("Skip 클릭 시 onCancel 호출", () => {
    const onCancel = vi.fn();
    render(
      <AdvanceFormOverlay
        nextStepTitle="Write plan"
        fields={fields}
        onSubmit={() => {}}
        onCancel={onCancel}
      />,
    );
    // AdvanceFormOverlay 는 PackageStartForm 의 "Back"/"Skip" 버튼을 둘 다 onCancel 로 연결한다.
    fireEvent.click(screen.getByRole("button", { name: /Skip/i }));
    expect(onCancel).toHaveBeenCalled();
  });
});
