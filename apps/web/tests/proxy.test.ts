import { describe, expect, it, vi, beforeEach } from "vitest";

beforeEach(() => {
  process.env.AGENT_DESK_TOKEN = "tkn";
  process.env.AGENT_DESK_GATEWAY_URL = "http://gateway.test";
  vi.resetModules();
});

describe("proxy 라우트 핸들러", () => {
  it("GET 요청을 bearer 토큰과 함께 전달하고 본문을 반환한다", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ workspaces: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const { GET } = await import("../app/api/proxy/[...path]/route");
    const req = new Request("http://web.test/api/proxy/workspaces");
    const res = await GET(req, { params: Promise.resolve({ path: ["workspaces"] }) });
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://gateway.test/workspaces",
      expect.objectContaining({
        headers: expect.objectContaining({ authorization: "Bearer tkn" }),
      })
    );
  });
});
