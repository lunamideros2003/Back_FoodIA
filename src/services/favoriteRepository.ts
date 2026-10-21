import type { DatabaseSync } from "node:sqlite";
import { getDb } from "../db/connection.ts";
import { listDishes } from "./repositories.ts";
import type { Dish } from "../domain/types.ts";
import type { Favorite, FavoriteWithDish } from "../domain/saved.ts";

interface FavoriteRow {
  user_id: number;
  dish_id: number;
  created_at: string;
}

/**
 * The recipes a user decided to keep. The primary key of the table makes a
 * duplicate impossible, so saving the same recipe twice is a no-op and the
 * user never ends up with the same dish listed two times.
 */
export function listFavoriteRows(
  userId: number,
  db: DatabaseSync = getDb(),
): FavoriteRow[] {
  return db
    .prepare(`SELECT * FROM favorites WHERE user_id = ? ORDER BY created_at DESC, dish_id`)
    .all(userId) as unknown as FavoriteRow[];
}

/** The favourite recipes with the dish already joined, ready for the UI. */
export function listFavorites(userId: number, db: DatabaseSync = getDb()): FavoriteWithDish[] {
  const dishes = listDishes(db);
  const byId = new Map(dishes.map((dish) => [dish.id, dish]));

  return listFavoriteRows(userId, db)
    .map((row) => {
      const dish = byId.get(row.dish_id);
      if (!dish) return null;
      return {
        userId: row.user_id,
        dishId: row.dish_id,
        createdAt: row.created_at,
        dish,
      };
    })
    .filter((entry): entry is FavoriteWithDish => entry !== null);
}

/** The ids only, which is what the recommendation cards need. */
export function listFavoriteIds(userId: number, db: DatabaseSync = getDb()): number[] {
  return listFavoriteRows(userId, db).map((row) => row.dish_id);
}

export function isFavorite(
  userId: number,
  dishId: number,
  db: DatabaseSync = getDb(),
): boolean {
  const row = db
    .prepare(`SELECT 1 AS found FROM favorites WHERE user_id = ? AND dish_id = ?`)
    .get(userId, dishId) as { found: number } | undefined;
  return row !== undefined;
}

/**
 * Saves a recipe. The insert ignores conflicts, so saving twice leaves a
 * single entry instead of a duplicated one.
 */
export function addFavorite(
  userId: number,
  dishId: number,
  db: DatabaseSync = getDb(),
): Favorite {
  db.prepare(
    `INSERT OR IGNORE INTO favorites (user_id, dish_id) VALUES (?, ?)`,
  ).run(userId, dishId);

  const row = db
    .prepare(`SELECT * FROM favorites WHERE user_id = ? AND dish_id = ?`)
    .get(userId, dishId) as unknown as FavoriteRow;

  return {
    userId: row.user_id,
    dishId: row.dish_id,
    createdAt: row.created_at,
  };
}

/** Removes a recipe from the favourites. It is safe to call it twice. */
export function removeFavorite(
  userId: number,
  dishId: number,
  db: DatabaseSync = getDb(),
): boolean {
  const result = db
    .prepare(`DELETE FROM favorites WHERE user_id = ? AND dish_id = ?`)
    .run(userId, dishId);
  return result.changes > 0;
}

/** Flips the state and returns what the new state is. */
export function toggleFavorite(
  userId: number,
  dishId: number,
  db: DatabaseSync = getDb(),
): { saved: boolean; favorite: Favorite | null } {
  if (isFavorite(userId, dishId, db)) {
    removeFavorite(userId, dishId, db);
    return { saved: false, favorite: null };
  }
  return { saved: true, favorite: addFavorite(userId, dishId, db) };
}

/** How many users saved each dish, used to rank the catalogue a little. */
export function favoriteCounts(db: DatabaseSync = getDb()): Map<number, number> {
  const rows = db
    .prepare(`SELECT dish_id, COUNT(*) AS total FROM favorites GROUP BY dish_id`)
    .all() as unknown as { dish_id: number; total: number }[];

  return new Map(rows.map((row) => [row.dish_id, row.total]));
}

/** The dishes that are not in the catalogue anymore are cleaned up. */
export function pruneFavorites(
  userId: number,
  dishes: Dish[],
  db: DatabaseSync = getDb(),
): number {
  const known = new Set(dishes.map((dish) => dish.id));
  const orphans = listFavoriteRows(userId, db).filter((row) => !known.has(row.dish_id));
  for (const orphan of orphans) {
    removeFavorite(userId, orphan.dish_id, db);
  }
  return orphans.length;
}
