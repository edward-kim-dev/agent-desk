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

  it("select 필드를 optionsByField 옵션으로 렌더하고 선택값을 제출한다", () => {
    const onSubmit = vi.fn();
    const selectFields: FieldSpec[] = [
      {
        name: "planPath",
        label: "Plan",
        kind: "select",
        required: true,
        optionsSource: "plans",
      },
    ];
    render(
      <PackageStartForm
        fields={selectFields}
        optionsByField={{
          planPath: ["docs/superpowers/plans/a.md", "docs/superpowers/plans/b.md"],
        }}
        onSubmit={onSubmit}
        onDismiss={() => {}}
        onBack={() => {}}
      />,
    );
    const select = screen.getByLabelText(/Plan/i) as HTMLSelectElement;
    expect(select.tagName).toBe("SELECT");
    fireEvent.change(select, {
      target: { value: "docs/superpowers/plans/b.md" },
    });
    fireEvent.submit(screen.getByRole("form"));
    expect(onSubmit).toHaveBeenCalledWith({
      planPath: "docs/superpowers/plans/b.md",
    });
  });

  it("select 옵션이 비면 disabled + 안내 옵션", () => {
    const selectFields: FieldSpec[] = [
      {
        name: "planPath",
        label: "Plan",
        kind: "select",
        required: true,
        optionsSource: "plans",
      },
    ];
    render(
      <PackageStartForm
        fields={selectFields}
        optionsByField={{ planPath: [] }}
        onSubmit={() => {}}
        onDismiss={() => {}}
        onBack={() => {}}
      />,
    );
    const select = screen.getByLabelText(/Plan/i) as HTMLSelectElement;
    expect(select.disabled).toBe(true);
    expect(screen.getByText(/사용 가능한 문서 없음/)).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: /Start work package/i }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });
});
