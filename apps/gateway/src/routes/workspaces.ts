import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { workspaces, createWorkspaceRequest } from "@agent-desk/shared";
import type { DbHandle } from "../db";

export function workspaceRoutes(db: DbHandle["db"]): Hono {
  const r = new Hono();

  r.get("/", (c) => {
    const rows = db.select().from(workspaces).all();
    return c.json({ workspaces: rows });
  });

  r.post("/", async (c) => {
    const parsed = createWorkspaceRequest.safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json({ error: "invalid_request", details: parsed.error.format() }, 400);
    }
    try {
      const inserted = db
        .insert(workspaces)
        .values({
          name: parsed.data.name,
          path: parsed.data.path,
          createdAt: Date.now(),
        })
        .returning()
        .all();
      return c.json(inserted[0], 201);
    } catch (err) {
      if (String(err).includes("UNIQUE constraint failed")) {
        return c.json({ error: "workspace_exists" }, 409);
      }
      throw err;
    }
  });

  r.delete("/:id", (c) => {
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id)) return c.json({ error: "bad_id" }, 400);
    db.delete(workspaces).where(eq(workspaces.id, id)).run();
    return c.body(null, 204);
  });

  return r;
}
