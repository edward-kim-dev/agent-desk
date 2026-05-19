import { describe, expect, it } from "vitest";
import { generateSessionName, slugify } from "../src/util/slug";

describe("slug", () => {
  it("워크스페이스 이름을 소문자 영숫자와 -로 슬러그화한다", () => {
    expect(slugify("Own Go Wiki!")).toBe("own-go-wiki");
  });

  it("슬러그를 16자로 잘라낸다", () => {
    expect(slugify("the-quick-brown-fox-jumps-over").length).toBeLessThanOrEqual(
      16
    );
  });

  it("세션 이름을 ad-<slug>-<6자> 형식으로 만든다", () => {
    const name = generateSessionName("Owngo Wiki");
    expect(name).toMatch(/^ad-[a-z0-9-]{1,16}-[a-z0-9]{6}$/);
  });
});
