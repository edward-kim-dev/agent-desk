import { describe, expect, it } from "vitest";
import { SHARED_VERSION } from "../src/index";

describe("@agent-desk/shared", () => {
  it("SHARED_VERSION을 export한다", () => {
    expect(SHARED_VERSION).toBe("0.1.0");
  });
});
