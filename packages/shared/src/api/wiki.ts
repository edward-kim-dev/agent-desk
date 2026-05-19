import { z } from "zod";

const safeRelativePath = z
  .string()
  .min(1)
  .refine((p) => !p.startsWith("/") && !p.startsWith("\\"), {
    message: "path must be relative to wiki/",
  })
  .refine((p) => !p.split(/[\\/]/).some((seg) => seg === ".." || seg === ""), {
    message: "path must not traverse out of wiki/",
  });

export const readWikiFileRequest = z.object({ path: safeRelativePath });
export const writeWikiFileRequest = z.object({
  path: safeRelativePath,
  content: z.string(),
});
export const appendLogRequest = z.object({ body: z.string().min(1) });

export const wikiTreeNode: z.ZodType<{
  name: string;
  path: string;
  type: "dir" | "file";
  children?: Array<{ name: string; path: string; type: "dir" | "file" }>;
}> = z.lazy(() =>
  z.object({
    name: z.string(),
    path: z.string(),
    type: z.enum(["dir", "file"]),
    children: z.array(wikiTreeNode).optional(),
  })
);

export const wikiFileDto = z.object({
  path: z.string(),
  content: z.string(),
  frontmatter: z.record(z.string(), z.unknown()).nullable(),
  schemaWarnings: z.array(z.string()),
});
export type WikiFileDto = z.infer<typeof wikiFileDto>;
