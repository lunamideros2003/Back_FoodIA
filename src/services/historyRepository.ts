import type { DatabaseSync } from "node:sqlite";
import { getDb } from "../db/connection.ts";
import { listDishes } from "./repositories.ts";
import type { RecipeEntry, RecipeEntryStatus, RecipeEntryWithDish } from "../domain/saved.ts";

interface EntryRow {
  id: number;
  user_id: number;
  dish_id: number;
  status: string;
  rating: number | null;
  note: string | null;
  feeling_note: string | null;
  created_at: string;
  updated_at: string;
}

function mapRow(row: EntryRow): RecipeEntry {
  return {
    id: row.id,
    userId: row.user_id,
    dishId: row.dish_id,
    status: row.status as RecipeEntryStatus,
    rating: row.rating,
    note: row.note,
    feelingNote: row.feeling_note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * The kitchen trail of a user: the recipes they opened and the ones they
 * actually cooked, with their own optional notes.
 */
export function listRecipeEntries(
  userId: number,
  options: { status?: RecipeEntryStatus } = {},
  db: DatabaseSync = getDb(),
): RecipeEntryWithDish[] {
  const dishes = listDishes(db);
  const byId = new Map(dishes.map((dish) => [dish.id, dish]));

  const rows = options.status
    ? (db
        .prepare(
          `SELECT * FROM recipe_entries WHERE user_id = ? AND status = ?
           ORDER BY updated_at DESC, id DESC`,
        )
        .all(userId, options.status) as unknown as EntryRow[])
    : (db
        .prepare(
          `SELECT * FROM recipe_entries WHERE user_id = ?
           ORDER BY updated_at DESC, id DESC`,
        )
        .all(userId) as unknown as EntryRow[]);

  return rows
    .map((row) => {
      const dish = byId.get(row.dish_id);
      if (!dish) return null;
      return { ...mapRow(row), dish };
    })
    .filter((entry): entry is RecipeEntryWithDish => entry !== null);
}

/** A single entry, when it exists. */
export function findRecipeEntry(
  userId: number,
  dishId: number,
  db: DatabaseSync = getDb(),
): RecipeEntry | null {
  const row = db
    .prepare(`SELECT * FROM recipe_entries WHERE user_id = ? AND dish_id = ?`)
    .get(userId, dishId) as unknown as EntryRow | undefined;
  return row ? mapRow(row) : null;
}

export interface UpsertEntryInput {
  status: RecipeEntryStatus;
  rating?: number | null;
  note?: string | null;
  feelingNote?: string | null;
}

/**
 * Creates or updates the entry of a recipe. The rating, the note and the
 * feeling note are all voluntary: a user can mark a recipe as prepared
 * without saying anything else.
 */
export function upsertRecipeEntry(
  userId: number,
  dishId: number,
  input: UpsertEntryInput,
  db: DatabaseSync = getDb(),
): RecipeEntry {
  const rating = input.rating === undefined || input.rating === null
    ? null
    : Math.min(5, Math.max(1, Math.round(input.rating)));

  db.prepare(
    `INSERT INTO recipe_entries (user_id, dish_id, status, rating, note, feeling_note)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, dish_id) DO UPDATE SET
       status = excluded.status,
       rating = COALESCE(excluded.rating, recipe_entries.rating),
       note = COALESCE(excluded.note, recipe_entries.note),
       feeling_note = COALESCE(excluded.feeling_note, recipe_entries.feeling_note),
       updated_at = datetime('now')`,
  ).run(
    userId,
    dishId,
    input.status,
    rating,
    input.note ?? null,
    input.feelingNote ?? null,
  );

  const row = db
    .prepare(`SELECT * FROM recipe_entries WHERE user_id = ? AND dish_id = ?`)
    .get(userId, dishId) as unknown as EntryRow;

  return mapRow(row);
}

/** Removes an entry. It is safe to call it twice. */
export function deleteRecipeEntry(
  userId: number,
  dishId: number,
  db: DatabaseSync = getDb(),
): boolean {
  const result = db
    .prepare(`DELETE FROM recipe_entries WHERE user_id = ? AND dish_id = ?`)
    .run(userId, dishId);
  return result.changes > 0;
}

/** How many recipes the user cooked, used for the summary line. */
export function countPrepared(userId: number, db: DatabaseSync = getDb()): number {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS total FROM recipe_entries WHERE user_id = ? AND status = 'prepared'`,
    )
    .get(userId) as { total: number };
  return row.total;
}
