import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { PackageCatalogEntry } from "@agent-desk/shared";
import { WorkPackageModal } from "../components/work-package-modal";

const planning: PackageCatalogEntry = {
  id: "planning",
  title: "기획",
  description: "test",
  cliRequirement: "claude",
  forms: [
    {
      step: 1,
      fields: [
        {
          name: "topic",
          label: "Topic",
          kind: "text",
          required: true,
          maxLength: 100,
        },
      ],
    },
  ],
  stepTitles: ["Brainstorm", "Write plan"],
};

const develop: PackageCatalogEntry = {
  id: "develop",
  title: "구현",
  description: "executing-plans",
  cliRequirement: "claude",
  forms: [
    {
      step: 1,
      fields: [
        {
          name: "planPath",
          label: "Plan document",
          kind: "select",
          required: true,
          optionsSource: "plans",
        },
      ],
    },
  ],
  stepTitles: ["Execute plan"],
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

  it("optionsSource 필드가 있는 패키지 선택 시 loadOptions 로 옵션을 채운다", async () => {
    const loadOptions = vi.fn(async (source: string) =>
      source === "plans" ? ["docs/superpowers/plans/x.md"] : [],
    );
    const onStart = vi.fn();
    render(
      <WorkPackageModal
        open
        packages={[develop]}
        sessionCli="claude"
        loadOptions={loadOptions}
        onStart={onStart}
        onDismiss={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /구현/ }));
    await waitFor(() =>
      expect(loadOptions).toHaveBeenCalledWith("plans"),
    );
    const select = (await screen.findByLabelText(
      /Plan document/i,
    )) as HTMLSelectElement;
    await waitFor(() =>
      expect(
        screen.getByRole("option", { name: "docs/superpowers/plans/x.md" }),
      ).toBeTruthy(),
    );
    fireEvent.change(select, {
      target: { value: "docs/superpowers/plans/x.md" },
    });
    fireEvent.submit(screen.getByRole("form"));
    await waitFor(() =>
      expect(onStart).toHaveBeenCalledWith({
        packageId: "develop",
        inputs: { planPath: "docs/superpowers/plans/x.md" },
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
