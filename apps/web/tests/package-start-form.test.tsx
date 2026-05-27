import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { FieldSpec } from "@agent-desk/shared";
import { PackageStartForm } from "../components/package-start-form";

const fields: FieldSpec[] = [
  { name: "topic", label: "Topic", kind: "text", required: true, maxLength: 100 },
  { name: "context", label: "Context", kind: "textarea", maxLength: 500, rows: 3 },
];

describe("<PackageStartForm>", () => {
  it("필드를 렌더한다", () => {
    render(
      <PackageStartForm
        fields={fields}
        onSubmit={() => {}}
        onDismiss={() => {}}
        onBack={() => {}}
      />,
    );
    expect(screen.getByLabelText(/Topic/i)).toBeTruthy();
    expect(screen.getByLabelText(/Context/i)).toBeTruthy();
  });

  it("submit 시 입력값 전달", () => {
    const onSubmit = vi.fn();
    render(
      <PackageStartForm
        fields={fields}
        onSubmit={onSubmit}
        onDismiss={() => {}}
        onBack={() => {}}
      />,
    );
    fireEvent.change(screen.getByLabelText(/Topic/i), {
      target: { value: "X" },
    });
    fireEvent.change(screen.getByLabelText(/Context/i), {
      target: { value: "Y" },
    });
    fireEvent.submit(screen.getByRole("form"));
    expect(onSubmit).toHaveBeenCalledWith({ topic: "X", context: "Y" });
  });

  it("required 빈 상태면 submit 비활성", () => {
    render(
      <PackageStartForm
        fields={fields}
        onSubmit={() => {}}
        onDismiss={() => {}}
        onBack={() => {}}
      />,
    );
    expect(
      (screen.getByRole("button", { name: /Start work package/i }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("Back 버튼이 onBack 호출", () => {
    const onBack = vi.fn();
    render(
      <PackageStartForm
        fields={fields}
        onSubmit={() => {}}
        onDismiss={() => {}}
        onBack={onBack}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Back/i }));
    expect(onBack).toHaveBeenCalled();
  });
});
