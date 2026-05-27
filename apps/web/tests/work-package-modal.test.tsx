import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { PackageCatalogEntry } from "@agent-desk/shared";
import { WorkPackageModal } from "../components/work-package-modal";

const planning: PackageCatalogEntry = {
  id: "planning",
  title: "기획",
  description: "test",
  cliRequirement: "claude",
  fields: [
    {
      name: "topic",
      label: "Topic",
      kind: "text",
      required: true,
      maxLength: 100,
    },
  ],
  stepTitles: ["Brainstorm", "Write plan"],
};

describe("<WorkPackageModal>", () => {
  it("열리면 picker 부터 표시 (V1 패키지 1 개여도)", () => {
    render(
      <WorkPackageModal
        open
        packages={[planning]}
        sessionCli="claude"
        onStart={() => {}}
        onDismiss={() => {}}
      />,
    );
    expect(screen.getByText(/기획/)).toBeTruthy();
    expect(screen.queryByLabelText(/Topic/i)).toBeNull();
  });

  it("카드 클릭 → form 표시", async () => {
    render(
      <WorkPackageModal
        open
        packages={[planning]}
        sessionCli="claude"
        onStart={() => {}}
        onDismiss={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /기획/ }));
    await waitFor(() =>
      expect(screen.getByLabelText(/Topic/i)).toBeTruthy(),
    );
  });

  it("form 의 Back → picker 로 복귀", async () => {
    render(
      <WorkPackageModal
        open
        packages={[planning]}
        sessionCli="claude"
        onStart={() => {}}
        onDismiss={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /기획/ }));
    await waitFor(() => screen.getByLabelText(/Topic/i));
    fireEvent.click(screen.getByRole("button", { name: /Back/i }));
    await waitFor(() =>
      expect(screen.queryByLabelText(/Topic/i)).toBeNull(),
    );
    expect(screen.getByText(/기획/)).toBeTruthy();
  });

  it("Start 시 onStart({packageId, inputs}) 호출", async () => {
    const onStart = vi.fn();
    render(
      <WorkPackageModal
        open
        packages={[planning]}
        sessionCli="claude"
        onStart={onStart}
        onDismiss={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /기획/ }));
    await waitFor(() => screen.getByLabelText(/Topic/i));
    fireEvent.change(screen.getByLabelText(/Topic/i), {
      target: { value: "T" },
    });
    fireEvent.submit(screen.getByRole("form"));
    await waitFor(() =>
      expect(onStart).toHaveBeenCalledWith({
        packageId: "planning",
        inputs: { topic: "T" },
      }),
    );
  });

  it("open=false 면 렌더 안 함", () => {
    const { container } = render(
      <WorkPackageModal
        open={false}
        packages={[planning]}
        sessionCli="claude"
        onStart={() => {}}
        onDismiss={() => {}}
      />,
    );
    expect(container.innerHTML).toBe("");
  });
});
