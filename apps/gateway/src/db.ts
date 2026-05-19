import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "@agent-desk/shared/db/schema";

export interface DbHandle {
  db: BetterSQLite3Database<typeof schema>;
  raw: Database.Database;
  close: () => void;
}

const MIGRATIONS_FOLDER = resolve(
  new URL("../drizzle", import.meta.url).pathname
);

export function openDatabase(opts: { filePath: string }): DbHandle {
  mkdirSync(dirname(opts.filePath), { recursive: true });
  const raw = new Database(opts.filePath);
  raw.pragma("journal_mode = WAL");
  raw.pragma("foreign_keys = ON");
  const db = drizzle(raw, { schema });
  migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  return {
    db,
    raw,
    close: () => raw.close(),
  };
}

export const DEFAULT_DB_PATH = resolve(
  new URL("../../../data/agent-desk.sqlite", import.meta.url).pathname
);
