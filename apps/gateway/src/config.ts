import { readFileSync } from "node:fs";
import { parse as parseToml } from "smol-toml";
import { z } from "zod";
import { cliEntry, type CliEntry } from "@agent-desk/shared";

const tomlSchema = z.object({
  server: z
    .object({
      gateway_port: z.number().int().optional(),
      ui_port: z.number().int().optional(),
      bind: z.string().optional(),
    })
    .partial()
    .optional(),
  cli: z
    .array(
      z.object({
        name: z.string(),
        command: z.string(),
        default_args: z.array(z.string()).optional(),
      })
    )
    .optional(),
});

export interface GatewayConfig {
  server: { gatewayPort: number; uiPort: number; bind: string };
  cli: CliEntry[];
  token: string;
}

const DEFAULT_CLI: CliEntry[] = [
  { name: "claude", command: "claude", defaultArgs: [] },
  { name: "gemini", command: "gemini", defaultArgs: [] },
  { name: "codex", command: "codex", defaultArgs: [] },
];

export function loadConfig(opts: { configPath?: string } = {}): GatewayConfig {
  const token = process.env.AGENT_DESK_TOKEN;
  if (!token || token.trim() === "") {
    throw new Error(
      "AGENT_DESK_TOKEN environment variable is required to start the gateway"
    );
  }

  let raw: unknown = {};
  if (opts.configPath) {
    try {
      raw = parseToml(readFileSync(opts.configPath, "utf8"));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }
  }

  const parsed = tomlSchema.parse(raw);
  const cliFromToml = (parsed.cli ?? []).map((c) =>
    cliEntry.parse({
      name: c.name,
      command: c.command,
      defaultArgs: c.default_args ?? [],
    })
  );

  const merged = new Map<string, CliEntry>();
  for (const c of DEFAULT_CLI) merged.set(c.name, c);
  for (const c of cliFromToml) merged.set(c.name, c);

  return {
    server: {
      gatewayPort: parsed.server?.gateway_port ?? 3334,
      uiPort: parsed.server?.ui_port ?? 3333,
      bind: parsed.server?.bind ?? "127.0.0.1",
    },
    cli: Array.from(merged.values()),
    token,
  };
}
