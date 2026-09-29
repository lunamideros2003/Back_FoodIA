import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { env } from "../config/env.ts";
import { applySchema } from "./schema.ts";

let instance: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (instance) return instance;

  fs.mkdirSync(path.dirname(env.databaseFile), { recursive: true });
  instance = new DatabaseSync(env.databaseFile);
  instance.exec("PRAGMA journal_mode = WAL;");
  instance.exec("PRAGMA foreign_keys = ON;");
  applySchema(instance);
  return instance;
}

export function closeDb(): void {
  instance?.close();
  instance = null;
}

export function resetDb(): DatabaseSync {
  closeDb();
  fs.rmSync(env.databaseFile, { force: true });
  fs.rmSync(`${env.databaseFile}-wal`, { force: true });
  fs.rmSync(`${env.databaseFile}-shm`, { force: true });
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
