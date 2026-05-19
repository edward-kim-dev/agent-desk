import { randomBytes } from "node:crypto";

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 16);
}

export function generateSessionName(workspaceName: string): string {
  const suffix = randomBytes(4).toString("hex").slice(0, 6);
  const slug = slugify(workspaceName) || "ws";
  return `ad-${slug}-${suffix}`;
}
