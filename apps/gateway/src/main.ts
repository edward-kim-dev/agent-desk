import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadConfig } from "./config";
import { openDatabase, DEFAULT_DB_PATH } from "./db";
import { createServer } from "./server";

async function bootstrap() {
  const localConfig = resolve(process.cwd(), "agent-desk.config.toml");
  const globalConfig = resolve(
    process.env.HOME ?? "",
    ".config/agent-desk/config.toml"
  );
  const configPath = existsSync(localConfig)
    ? localConfig
    : existsSync(globalConfig)
      ? globalConfig
      : undefined;

  const config = loadConfig({ configPath });
  const db = openDatabase({ filePath: DEFAULT_DB_PATH });
  const server = await createServer({
    db,
    token: config.token,
    cli: config.cli,
    bind: config.server.bind,
    port: config.server.gatewayPort,
    startBackgroundJobs: true,
  });
  console.log(`[gateway] listening on ${server.url}`);
}

bootstrap().catch((err) => {
  console.error("[gateway] failed to start:", err);
  process.exit(1);
});
