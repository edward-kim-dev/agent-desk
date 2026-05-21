import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AdrBoard } from "../components/tabs/wiki/adr-board";

const tree = {
  name: "wiki",
  path: "",
  type: "dir" as const,
  children: [
    {
      name: "decisions",
      path: "decisions",
      type: "dir" as const,
      children: [
        { name: "0001-foo.md", path: "decisions/0001-foo.md", type: "file" as const },
        { name: "0002-bar.md", path: "decisions/0002-bar.md", type: "file" as const },
      ],
    },
    { name: "log.md", path: "log.md", type: "file" as const },
  ],
};

describe("<AdrBoard>", () => {
  it("decisions 디렉터리의 .md 파일을 행으로 렌더", () => {
    render(<AdrBoard tree={tree} onOpen={() => {}} />);
    expect(screen.getByText("0001-foo.md")).toBeTruthy();
    expect(screen.getByText("0002-bar.md")).toBeTruthy();
    expect(screen.queryByText("log.md")).toBeNull();
  });

  it("행 클릭 시 onOpen에 path 전달", () => {
    const onOpen = vi.fn();
    render(<AdrBoard tree={tree} onOpen={onOpen} />);
    fireEvent.click(screen.getByText("0001-foo.md"));
    expect(onOpen).toHaveBeenCalledWith("decisions/0001-foo.md");
  });

  it("decisions 디렉터리가 없으면 안내 메시지", () => {
    render(
      <AdrBoard
        tree={{ name: "wiki", path: "", type: "dir", children: [] }}
        onOpen={() => {}}
      />
    );
    expect(screen.getByText(/wiki\/decisions 가 비어 있습니다/)).toBeTruthy();
  });
});
