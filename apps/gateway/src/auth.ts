import type { MiddlewareHandler } from "hono";

export function bearerAuth(expected: string): MiddlewareHandler {
  return async (c, next) => {
    const header = c.req.header("authorization") ?? "";
    const [scheme, token] = header.split(/\s+/);
    if (scheme?.toLowerCase() !== "bearer" || token !== expected) {
      return c.json({ error: "unauthorized" }, 401);
    }
    await next();
  };
}
