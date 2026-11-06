import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { env } from "../config/env.ts";
import { applySchema } from "./schema.ts";
import { applyPostgresSchema } from "./schema.postgres.ts";
import { createPostgresDatabase, type PostgresDatabase } from "./postgres.ts";

let instance: DatabaseSync | null = null;
let postgres: PostgresDatabase | null = null;
let activeFile = "";

/** Local fallback used when the configured path cannot be written. */
const FALLBACK_FILE = "./data/foodmood.db";

/**
 * `DATABASE_URL` is the switch between SQLite (development, tests) and
 * Postgres (Supabase in production).
 *
 * The test runner keeps using SQLite unless the URL explicitly asks for
 * PGlite, so a developer with a production URL in their `.env` never runs the
 * suite against the real database by accident.
 */
export function usesPostgres(): boolean {
  if (!env.databaseUrl) return false;
  const testing =
    process.env.NODE_TEST_CONTEXT !== undefined || process.env.NODE_ENV === "test";
  if (testing && !env.databaseUrl.startsWith("pglite:")) return false;
  return true;
}

function openDatabase(file: string): DatabaseSync {
  fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  applySchema(db);
  return db;
}

function openPostgres(): DatabaseSync {
  postgres = createPostgresDatabase({
    url: env.databaseUrl,
    ssl: env.databaseSsl,
    timeoutMs: env.databaseTimeoutMs,
  });
  applyPostgresSchema(postgres);
  activeFile = "PostgreSQL (DATABASE_URL)";
  return postgres as unknown as DatabaseSync;
}

export function getDb(): DatabaseSync {
  if (instance) return instance;

  if (usesPostgres()) {
    instance = openPostgres();
    return instance;
  }

  try {
    instance = openDatabase(env.databaseFile);
    activeFile = env.databaseFile;
  } catch (error) {
    // A hosted platform without a mounted volume has no /data to write to.
    // Losing the database is bad, but refusing to start is worse: fall back to
    // the app folder so the catalogue still works and say so loudly.
    if (env.databaseFile === FALLBACK_FILE) throw error;

    console.warn(
      `[db] No se pudo abrir ${env.databaseFile} (${(error as Error).message}).\n` +
        `     Se usará ${FALLBACK_FILE}. Los datos NO se guardarán de forma permanente:\n` +
        `     en un hosting sin disco montado agrega un volumen en ${path.dirname(env.databaseFile)}.`,
    );
    instance = openDatabase(FALLBACK_FILE);
    activeFile = FALLBACK_FILE;
  }

  return instance;
}

/** The file actually in use, which may differ from the configured one. */
export function activeDatabaseFile(): string {
  getDb();
  return activeFile;
}

/** Human-readable label for the startup log. */
export function databaseLabel(): string {
  return usesPostgres() ? "PostgreSQL (Supabase)" : env.databaseFile;
}

export function closeDb(): void {
  instance?.close();
  instance = null;
  postgres = null;
}

export function resetDb(): DatabaseSync {
  if (usesPostgres()) {
    const db = getDb();
    db.exec("DROP SCHEMA IF EXISTS public CASCADE;");
    db.exec("CREATE SCHEMA public;");
    applyPostgresSchema(db);
    return db;
  }

  closeDb();
  for (const file of new Set([env.databaseFile, activeFile, FALLBACK_FILE])) {
    fs.rmSync(file, { force: true });
    fs.rmSync(`${file}-wal`, { force: true });
    fs.rmSync(`${file}-shm`, { force: true });
  }
  return getDb();
}

export function transaction<T>(fn: (db: DatabaseSync) => T): T {
  const db = getDb();
  db.exec("BEGIN");
  try {
    const result = fn(db);
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
