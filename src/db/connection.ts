import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { env } from "../config/env.ts";
import { applySchema } from "./schema.ts";

let instance: DatabaseSync | null = null;
let activeFile = "";

/** Local fallback used when the configured path cannot be written. */
const FALLBACK_FILE = "./data/foodmood.db";

function openDatabase(file: string): DatabaseSync {
  fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  applySchema(db);
  return db;
}

export function getDb(): DatabaseSync {
  if (instance) return instance;

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

export function closeDb(): void {
  instance?.close();
  instance = null;
}

export function resetDb(): DatabaseSync {
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
