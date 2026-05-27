import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { WorkPackageDto } from "@agent-desk/shared";
import { ActivePackageCard } from "../components/active-package-card";

const baseInstance: WorkPackageDto = {
  id: 1,
  sessionId: 7,
  packageId: "planning",
  currentStep: 1,
  status: "active",
  inputs: { topic: "T" },
  createdAt: Date.now() - 60_000,
  advancedAt: Date.now() - 60_000,
  completedAt: null,
};

describe("<ActivePackageCard>", () => {
  it("진행도와 step 표시", () => {
    render(
      <ActivePackageCard
        instance={baseInstance}
        stepTitles={["Brainstorm", "Write plan"]}
        packageTitle="기획"
        artifacts={[]}
        onAdvance={() => {}}
        onComplete={() => {}}
      />,
    );
    expect(screen.getByText(/Step 1\/2/)).toBeTruthy();
    expect(screen.getByText(/Brainstorm/)).toBeTruthy();
  });

  it("Next step 클릭 시 onAdvance(currentStep)", () => {
    const onAdvance = vi.fn();
    render(
      <ActivePackageCard
        instance={baseInstance}
        stepTitles={["Brainstorm", "Write plan"]}
        packageTitle="기획"
        artifacts={[]}
        onAdvance={onAdvance}
        onComplete={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Next step/i }));
    expect(onAdvance).toHaveBeenCalledWith(1);
  });

  it("마지막 step 에선 Next 비활성", () => {
    render(
      <ActivePackageCard
        instance={{ ...baseInstance, currentStep: 2 }}
        stepTitles={["Brainstorm", "Write plan"]}
        packageTitle="기획"
        artifacts={[]}
        onAdvance={() => {}}
        onComplete={() => {}}
      />,
    );
    expect(
      (screen.getByRole("button", { name: /Next step/i }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("onScan prop 이 있으면 ↻ 버튼 표시 + 클릭 시 호출", () => {
    const onScan = vi.fn();
    render(
      <ActivePackageCard
        instance={baseInstance}
        stepTitles={["Brainstorm", "Write plan"]}
        packageTitle="기획"
        artifacts={[]}
        onAdvance={() => {}}
        onComplete={() => {}}
        onScan={onScan}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: /Scan for new artifacts/i }),
    );
    expect(onScan).toHaveBeenCalled();
  });

  it("onScan prop 이 없으면 ↻ 버튼 렌더링 안 됨", () => {
    render(
      <ActivePackageCard
        instance={baseInstance}
        stepTitles={["Brainstorm", "Write plan"]}
        packageTitle="기획"
        artifacts={[]}
        onAdvance={() => {}}
        onComplete={() => {}}
      />,
    );
    expect(
      screen.queryByRole("button", { name: /Scan for new artifacts/i }),
    ).toBeNull();
  });

  it("Complete 호출", () => {
    const onComplete = vi.fn();
    render(
      <ActivePackageCard
        instance={baseInstance}
        stepTitles={["Brainstorm", "Write plan"]}
        packageTitle="기획"
        artifacts={[]}
        onAdvance={() => {}}
        onComplete={onComplete}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Complete/i }));
    expect(onComplete).toHaveBeenCalled();
  });
});
