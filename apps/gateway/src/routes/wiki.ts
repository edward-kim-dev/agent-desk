import { Hono } from "hono";
import {
  appendFileSync,
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join, relative, resolve } from "node:path";
import { eq } from "drizzle-orm";
import matter from "gray-matter";
import {
  appendLogRequest,
  readWikiFileRequest,
  workspaces,
  writeWikiFileRequest,
} from "@agent-desk/shared";
import type { DbHandle } from "../db";

const LAYER_PREFIXES = ["L0-", "L1-", "L2-", "L3-", "L4-", "L5-"];

function wikiRoot(workspacePath: string): string {
  return resolve(workspacePath, "wiki");
}

function safeJoin(root: string, rel: string): string | null {
  const absolute = resolve(root, rel);
  const r = relative(root, absolute);
  if (r.startsWith("..") || resolve(root, r) !== absolute) return null;
  return absolute;
}

interface TreeNode {
  name: string;
  path: string;
  type: "dir" | "file";
  children?: TreeNode[];
}

function readTree(absRoot: string, absPath: string): TreeNode {
  const stat = statSync(absPath);
  const name = absPath === absRoot ? "wiki" : (absPath.split("/").pop() ?? "");
  if (stat.isFile()) {
    return {
      name,
      path: relative(absRoot, absPath),
      type: "file",
    };
  }
  const entries = readdirSync(absPath)
    .filter((e) => !e.startsWith("."))
    .map((e) => readTree(absRoot, join(absPath, e)));
  return {
    name,
    path: relative(absRoot, absPath),
    type: "dir",
    children: entries,
  };
}

function schemaWarnings(filePath: string, content: string): string[] {
  const warnings: string[] = [];
  const parsed = matter(content);
  const fm = parsed.data;
  if (!fm || Object.keys(fm).length === 0) {
    warnings.push("missing frontmatter");
    return warnings;
  }
  const layer = typeof fm.layer === "string" ? fm.layer : null;
  if (!layer) warnings.push("frontmatter missing 'layer'");
  const segments = filePath.split("/");
  const top = segments[0];
  if (top && LAYER_PREFIXES.some((p) => top.startsWith(p))) {
    const dirLayer = top.slice(0, 2);
    if (layer && layer !== dirLayer) {
      warnings.push(
        `frontmatter layer '${layer}' does not match directory '${top}'`
      );
    }
  }
  return warnings;
}

export function wikiRoutes(db: DbHandle["db"]): Hono {
  const r = new Hono();

  r.get("/:wsId/wiki/tree", (c) => {
    const wsId = Number(c.req.param("wsId"));
    const ws = db.select().from(workspaces).where(eq(workspaces.id, wsId)).get();
    if (!ws || ws.deletedAt != null) return c.json({ error: "not_found" }, 404);
    const root = wikiRoot(ws.path);
    if (!existsSync(root)) return c.json({ root: null });
    return c.json({ root: readTree(root, root) });
  });

  r.get("/:wsId/wiki/file", (c) => {
    const wsId = Number(c.req.param("wsId"));
    const parsed = readWikiFileRequest.safeParse({ path: c.req.query("path") });
    if (!parsed.success) return c.json({ error: "invalid_path" }, 400);
    const ws = db.select().from(workspaces).where(eq(workspaces.id, wsId)).get();
    if (!ws || ws.deletedAt != null) return c.json({ error: "not_found" }, 404);
    const root = wikiRoot(ws.path);
    const abs = safeJoin(root, parsed.data.path);
    if (!abs) return c.json({ error: "path_traversal" }, 400);
    if (!existsSync(abs)) return c.json({ error: "not_found" }, 404);
    const content = readFileSync(abs, "utf8");
    const fm = matter(content);
    return c.json({
      path: parsed.data.path,
      content,
      frontmatter: Object.keys(fm.data).length ? fm.data : null,
      schemaWarnings: schemaWarnings(parsed.data.path, content),
    });
  });

  r.put("/:wsId/wiki/file", async (c) => {
    const wsId = Number(c.req.param("wsId"));
    const parsed = writeWikiFileRequest.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: "invalid_request" }, 400);
    const ws = db.select().from(workspaces).where(eq(workspaces.id, wsId)).get();
    if (!ws || ws.deletedAt != null) return c.json({ error: "not_found" }, 404);
    const root = wikiRoot(ws.path);
    const abs = safeJoin(root, parsed.data.path);
    if (!abs) return c.json({ error: "path_traversal" }, 400);
    writeFileSync(abs, parsed.data.content, "utf8");
    return c.json({
      path: parsed.data.path,
      schemaWarnings: schemaWarnings(parsed.data.path, parsed.data.content),
    });
  });

  r.post("/:wsId/wiki/log", async (c) => {
    const wsId = Number(c.req.param("wsId"));
    const parsed = appendLogRequest.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: "invalid_request" }, 400);
    const ws = db.select().from(workspaces).where(eq(workspaces.id, wsId)).get();
    if (!ws || ws.deletedAt != null) return c.json({ error: "not_found" }, 404);
    const root = wikiRoot(ws.path);
    const logFile = join(root, "log.md");
    const ts = new Date().toISOString();
    const line = `\n\n## ${ts}\n\n${parsed.data.body}\n`;
    appendFileSync(logFile, line, "utf8");
    return c.body(null, 204);
  });

  return r;
}
