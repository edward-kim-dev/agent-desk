import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { WikiMetaPanel } from "../components/tabs/wiki/meta-panel";

describe("<WikiMetaPanel>", () => {
  it("열린 파일이 없으면 안내 텍스트를 보여준다", () => {
    render(<WikiMetaPanel openFile={null} brokenLinks={[]} />);
    expect(screen.getByText(/문서가 선택되지 않음/)).toBeTruthy();
  });

  it("열린 파일의 layer, claim 카운트, 깨진 링크 수를 렌더링한다", () => {
    render(
      <WikiMetaPanel
        openFile={{
          path: "concepts/foo.md",
          layer: "concept",
          claimCounts: { source: 5, analysis: 3, unverified: 1, gap: 0 },
        }}
        brokenLinks={["bar.md"]}
      />
    );
    expect(screen.getByText(/concepts\/foo.md/)).toBeTruthy();
    expect(screen.getByText(/layer:.*concept/)).toBeTruthy();
    expect(screen.getByText(/source.*5/)).toBeTruthy();
    expect(screen.getByText(/analysis.*3/)).toBeTruthy();
    expect(screen.getByText(/broken.*1/)).toBeTruthy();
  });
});
