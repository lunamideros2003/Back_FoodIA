import type { DatabaseSync } from "node:sqlite";
import { getDb } from "../db/connection.ts";
import { isSavedPreferenceKey, type SavedPreference } from "../domain/saved.ts";

interface PreferenceRow {
  user_id: number;
  key: string;
  value: string;
  created_at: string;
}

function mapRow(row: PreferenceRow): SavedPreference {
  return {
    userId: row.user_id,
    key: row.key,
    value: row.value,
    createdAt: row.created_at,
  };
}

/**
 * The preferences the user agreed to keep. They are stored apart from the
 * answers of a single session, so nothing becomes a permanent profile
 * without the person saying so.
 */
export function listSavedPreferences(
  userId: number,
  db: DatabaseSync = getDb(),
): SavedPreference[] {
  const rows = db
    .prepare(`SELECT * FROM saved_preferences WHERE user_id = ? ORDER BY key`)
    .all(userId) as unknown as PreferenceRow[];
  return rows.map(mapRow);
}

/** The preferences as a plain object, which is what the ranker consumes. */
export function savedPreferenceMap(
  userId: number,
  db: DatabaseSync = getDb(),
): Record<string, string> {
  const entries = listSavedPreferences(userId, db);
  const map: Record<string, string> = {};
  for (const entry of entries) map[entry.key] = entry.value;
  return map;
}

/**
 * Saves a preference. Only the keys the app knows about are accepted, so a
 * stray request cannot fill the table with whatever it wants.
 */
export function savePreference(
  userId: number,
  key: string,
  value: string,
  db: DatabaseSync = getDb(),
): SavedPreference | null {
  if (!isSavedPreferenceKey(key)) return null;

  db.prepare(
    `INSERT INTO saved_preferences (user_id, key, value) VALUES (?, ?, ?)
     ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value`,
  ).run(userId, key, value);

  const row = db
    .prepare(`SELECT * FROM saved_preferences WHERE user_id = ? AND key = ?`)
    .get(userId, key) as unknown as PreferenceRow;

  return mapRow(row);
}

/** Saves several preferences at once. */
export function savePreferences(
  userId: number,
  items: { key: string; value: string }[],
  db: DatabaseSync = getDb(),
): SavedPreference[] {
  const saved: SavedPreference[] = [];
  for (const item of items) {
    const result = savePreference(userId, item.key, item.value, db);
    if (result) saved.push(result);
  }
  return saved;
}

/** Removes one preference. It is safe to call it twice. */
export function deletePreference(
  userId: number,
  key: string,
  db: DatabaseSync = getDb(),
): boolean {
  const result = db
    .prepare(`DELETE FROM saved_preferences WHERE user_id = ? AND key = ?`)
    .run(userId, key);
  return result.changes > 0;
}

/** Removes every saved preference of a user. */
export function clearSavedPreferences(userId: number, db: DatabaseSync = getDb()): number {
  const result = db.prepare(`DELETE FROM saved_preferences WHERE user_id = ?`).run(userId);
  return result.changes;
}
