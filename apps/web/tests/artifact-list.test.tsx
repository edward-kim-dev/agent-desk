import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { WorkPackageArtifactDto } from "@agent-desk/shared";
import { ArtifactList } from "../components/artifact-list";

const a: WorkPackageArtifactDto = {
  id: 1,
  stepIndex: 1,
  filePath: "docs/superpowers/specs/foo.md",
  sha256: "a".repeat(64),
  size: 100,
  recordedAt: 1,
  lastSeenSha256: "a".repeat(64),
  lastSeenAt: 1,
  driftDetected: false,
};
const aDrift: WorkPackageArtifactDto = {
  ...a,
  id: 2,
  lastSeenSha256: "b".repeat(64),
  driftDetected: true,
};

describe("<ArtifactList>", () => {
  it("파일 경로를 표시한다", () => {
    render(<ArtifactList artifacts={[a]} />);
    expect(screen.getByText(/specs\/foo\.md/)).toBeTruthy();
  });

  it("drift 면 수정됨 배지", () => {
    render(<ArtifactList artifacts={[aDrift]} />);
    expect(screen.getByText(/수정됨/)).toBeTruthy();
  });

  it("비어있으면 안내 텍스트", () => {
    render(<ArtifactList artifacts={[]} />);
    expect(screen.getByText(/아직 산출물 없음/)).toBeTruthy();
  });
});
