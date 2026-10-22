import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { applySchema } from "../src/db/schema.ts";
import {
  addFavorite,
  favoriteCounts,
  isFavorite,
  listFavoriteIds,
  listFavorites,
  pruneFavorites,
  removeFavorite,
  toggleFavorite,
} from "../src/services/favoriteRepository.ts";
import {
  countPrepared,
  deleteRecipeEntry,
  findRecipeEntry,
  listRecipeEntries,
  upsertRecipeEntry,
} from "../src/services/historyRepository.ts";
import {
  clearSavedPreferences,
  deletePreference,
  listSavedPreferences,
  savePreference,
  savePreferences,
  savedPreferenceMap,
} from "../src/services/preferenceRepository.ts";
import { listDishes } from "../src/services/repositories.ts";

let userSeq = 1;

function makeDb(): { db: DatabaseSync; userId: number; dishId: number } {
  const db = new DatabaseSync(":memory:");
  applySchema(db);

  db.prepare(`INSERT INTO users (email, display_name) VALUES (?, ?)`).run(
    `test-${userSeq}@example.com`,
    `Test ${userSeq}`,
  );
  userSeq += 1;

  const userRow = db
    .prepare(`SELECT id FROM users ORDER BY id DESC LIMIT 1`)
    .get() as { id: number };

  db.prepare(
    `INSERT INTO dishes (name, name_es, slug, category, description, prep_minutes,
       difficulty, calories, protein_g, carbs_g, fat_g)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    "Test dish",
    "Plato de prueba",
    `plato-de-prueba-${userRow.id}`,
    "Almuerzo",
    "Un plato para las pruebas",
    20,
    "facil",
    400,
    20,
    40,
    12,
  );

  const dishRow = db
    .prepare(`SELECT id FROM dishes ORDER BY id DESC LIMIT 1`)
    .get() as { id: number };

  return { db, userId: userRow.id, dishId: dishRow.id };
}

describe("favourites", () => {
  it("starts empty for a new user", () => {
    const { db, userId } = makeDb();
    assert.deepEqual(listFavoriteIds(userId, db), []);
  });

  it("saves a recipe and reads it back with the dish joined", () => {
    const { db, userId, dishId } = makeDb();
    const saved = addFavorite(userId, dishId, db);

    assert.equal(saved.userId, userId);
    assert.equal(saved.dishId, dishId);
    assert.equal(isFavorite(userId, dishId, db), true);

    const list = listFavorites(userId, db);
    assert.equal(list.length, 1);
    assert.equal(list[0].dish.id, dishId);
  });

  it("does not duplicate a recipe saved twice", () => {
    const { db, userId, dishId } = makeDb();
    addFavorite(userId, dishId, db);
    addFavorite(userId, dishId, db);
    assert.deepEqual(listFavoriteIds(userId, db), [dishId]);
  });

  it("toggles a recipe on and off", () => {
    const { db, userId, dishId } = makeDb();

    const on = toggleFavorite(userId, dishId, db);
    assert.equal(on.saved, true);
    assert.equal(isFavorite(userId, dishId, db), true);

    const off = toggleFavorite(userId, dishId, db);
    assert.equal(off.saved, false);
    assert.equal(isFavorite(userId, dishId, db), false);
  });

  it("removes a recipe and reports whether it existed", () => {
    const { db, userId, dishId } = makeDb();
    addFavorite(userId, dishId, db);

    assert.equal(removeFavorite(userId, dishId, db), true);
    assert.equal(removeFavorite(userId, dishId, db), false);
  });

  it("counts how many users saved each recipe", () => {
    const { db, userId, dishId } = makeDb();
    addFavorite(userId, dishId, db);
    assert.equal(favoriteCounts(db).get(dishId), 1);
  });

  it("drops saved recipes that left the catalogue", () => {
    const { db, userId, dishId } = makeDb();
    addFavorite(userId, dishId, db);

    const dishesWithoutIt = listDishes(db).filter((dish) => dish.id !== dishId);
    assert.equal(pruneFavorites(userId, dishesWithoutIt, db), 1);
    assert.deepEqual(listFavoriteIds(userId, db), []);
  });
});

describe("history", () => {
  it("records that a recipe was opened", () => {
    const { db, userId, dishId } = makeDb();
    const entry = upsertRecipeEntry(userId, dishId, { status: "viewed" }, db);

    assert.equal(entry.userId, userId);
    assert.equal(entry.dishId, dishId);
    assert.equal(entry.status, "viewed");
    assert.equal(findRecipeEntry(userId, dishId, db)?.status, "viewed");
  });

  it("upgrades the same recipe from viewed to prepared", () => {
    const { db, userId, dishId } = makeDb();
    upsertRecipeEntry(userId, dishId, { status: "viewed" }, db);
    upsertRecipeEntry(userId, dishId, { status: "prepared", rating: 5 }, db);

    const entry = findRecipeEntry(userId, dishId, db);
    assert.equal(entry?.status, "prepared");
    assert.equal(entry?.rating, 5);
  });

  it("keeps an existing rating when a later update does not send one", () => {
    const { db, userId, dishId } = makeDb();
    upsertRecipeEntry(userId, dishId, { status: "prepared", rating: 4 }, db);
    upsertRecipeEntry(userId, dishId, { status: "prepared" }, db);

    assert.equal(findRecipeEntry(userId, dishId, db)?.rating, 4);
  });

  it("clamps the rating into the one to five range", () => {
    const { db, userId, dishId } = makeDb();
    const entry = upsertRecipeEntry(userId, dishId, { status: "prepared", rating: 9 }, db);
    assert.equal(entry.rating, 5);
  });

  it("counts only the recipes that were really cooked", () => {
    const { db, userId, dishId } = makeDb();
    upsertRecipeEntry(userId, dishId, { status: "viewed" }, db);
    assert.equal(countPrepared(userId, db), 0);

    upsertRecipeEntry(userId, dishId, { status: "prepared" }, db);
    assert.equal(countPrepared(userId, db), 1);
  });

  it("filters by status and joins the dish", () => {
    const { db, userId, dishId } = makeDb();
    upsertRecipeEntry(userId, dishId, { status: "prepared", note: "Quedó rico" }, db);

    const prepared = listRecipeEntries(userId, { status: "prepared" }, db);
    assert.equal(prepared.length, 1);
    assert.equal(prepared[0].dish.id, dishId);
    assert.equal(prepared[0].note, "Quedó rico");

    assert.equal(listRecipeEntries(userId, { status: "viewed" }, db).length, 0);
  });

  it("deletes an entry and tolerates a second delete", () => {
    const { db, userId, dishId } = makeDb();
    upsertRecipeEntry(userId, dishId, { status: "prepared" }, db);

    assert.equal(deleteRecipeEntry(userId, dishId, db), true);
    assert.equal(deleteRecipeEntry(userId, dishId, db), false);
    assert.equal(findRecipeEntry(userId, dishId, db), null);
  });
});

describe("saved preferences", () => {
  it("saves a known preference", () => {
    const { db, userId } = makeDb();
    const saved = savePreference(userId, "maxPrepMinutes", "30", db);

    assert.ok(saved);
    assert.equal(saved.value, "30");
    assert.equal(savedPreferenceMap(userId, db).maxPrepMinutes, "30");
  });

  it("refuses a key the app does not know", () => {
    const { db, userId } = makeDb();
    assert.equal(savePreference(userId, "hackThePlanet", "yes", db), null);
    assert.deepEqual(listSavedPreferences(userId, db), []);
  });

  it("updates the value of an existing preference instead of duplicating it", () => {
    const { db, userId } = makeDb();
    savePreference(userId, "maxPrepMinutes", "30", db);
    savePreference(userId, "maxPrepMinutes", "45", db);

    const list = listSavedPreferences(userId, db);
    assert.equal(list.length, 1);
    assert.equal(list[0].value, "45");
  });

  it("saves several preferences at once and skips the invalid ones", () => {
    const { db, userId } = makeDb();
    const saved = savePreferences(
      userId,
      [
        { key: "vegetarian", value: "true" },
        { key: "notAKey", value: "x" },
        { key: "sweetToothed", value: "true" },
      ],
      db,
    );

    assert.equal(saved.length, 2);
    assert.equal(listSavedPreferences(userId, db).length, 2);
  });

  it("deletes one preference and then all of them", () => {
    const { db, userId } = makeDb();
    savePreferences(
      userId,
      [
        { key: "vegetarian", value: "true" },
        { key: "sweetToothed", value: "true" },
      ],
      db,
    );

    assert.equal(deletePreference(userId, "vegetarian", db), true);
    assert.equal(listSavedPreferences(userId, db).length, 1);

    assert.equal(clearSavedPreferences(userId, db), 1);
    assert.deepEqual(listSavedPreferences(userId, db), []);
  });
});
