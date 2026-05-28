import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { StepReadyOverlay } from "../components/step-ready-overlay";

const baseProps = {
  stepTitle: "Brainstorm",
  nextStepTitle: "Write plan" as string | null,
  isLastStep: false,
  onAdvance: vi.fn(),
  onDismiss: vi.fn(),
};

describe("<StepReadyOverlay>", () => {
  it("현재 step 제목과 다음 step 제목을 표시", () => {
    render(<StepReadyOverlay {...baseProps} />);
    expect(screen.getByText(/Brainstorm/)).toBeTruthy();
    expect(screen.getByText(/Write plan/)).toBeTruthy();
  });

  it("[다음 단계로] 클릭 시 onAdvance 호출", () => {
    const onAdvance = vi.fn();
    render(<StepReadyOverlay {...baseProps} onAdvance={onAdvance} />);
    fireEvent.click(screen.getByRole("button", { name: /다음 단계/ }));
    expect(onAdvance).toHaveBeenCalledOnce();
  });

  it("[지금은 괜찮아요] 클릭 시 onDismiss 호출", () => {
    const onDismiss = vi.fn();
    render(<StepReadyOverlay {...baseProps} onDismiss={onDismiss} />);
    fireEvent.click(screen.getByRole("button", { name: /지금은/ }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it("마지막 step이면 '완료로 처리' 버튼 표시 (다음 단계로 버튼 없음)", () => {
    render(<StepReadyOverlay {...baseProps} isLastStep={true} />);
    expect(screen.getByRole("button", { name: /완료/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /다음 단계/ })).toBeFalsy();
  });

  it("nextStepTitle null이면 '다음 단계:' 줄 미표시", () => {
    render(<StepReadyOverlay {...baseProps} nextStepTitle={null} />);
    expect(screen.queryByText(/다음 단계:/)).toBeFalsy();
  });
});
