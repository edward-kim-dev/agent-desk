import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { WikiTree } from "../components/wiki-tree";

const tree = {
  name: "wiki",
  path: "",
  type: "dir" as const,
  children: [
    {
      name: "L1-claims",
      path: "L1-claims",
      type: "dir" as const,
      children: [
        { name: "foo.md", path: "L1-claims/foo.md", type: "file" as const },
      ],
    },
    { name: "log.md", path: "log.md", type: "file" as const },
  ],
};

describe("<WikiTree>", () => {
  it("L-prefix 디렉터리에 layer 라벨을 렌더링한다", () => {
    render(<WikiTree node={tree} onOpen={() => {}} />);
    expect(screen.getByText("L1-claims")).toBeTruthy();
  });

  it("파일 클릭 시 상대 경로로 onOpen을 호출한다", () => {
    const onOpen = vi.fn();
    render(<WikiTree node={tree} onOpen={onOpen} />);
    fireEvent.click(screen.getByText("foo.md"));
    expect(onOpen).toHaveBeenCalledWith("L1-claims/foo.md");
  });
});
