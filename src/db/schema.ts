import type { DatabaseSync } from "node:sqlite";

export function applySchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      email        TEXT    NOT NULL UNIQUE,
      display_name TEXT    NOT NULL,
      created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS user_preferences (
      user_id             INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      diet                TEXT    NOT NULL DEFAULT 'omnivore',
      max_prep_minutes    INTEGER,
      max_spice_level     REAL    NOT NULL DEFAULT 1,
      max_price_level     INTEGER NOT NULL DEFAULT 3,
      allergies           TEXT    NOT NULL DEFAULT '[]',
      disliked_ingredients TEXT   NOT NULL DEFAULT '[]',
      health              TEXT    NOT NULL DEFAULT '{}',
      daily_calorie_goal  INTEGER NOT NULL DEFAULT 2000
    );

    CREATE TABLE IF NOT EXISTS moods (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      key         TEXT    NOT NULL UNIQUE,
      label       TEXT    NOT NULL,
      emoji       TEXT    NOT NULL,
      description TEXT    NOT NULL,
      accent      TEXT    NOT NULL,
      sort_order  INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS ingredients (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      name     TEXT    NOT NULL UNIQUE,
      label    TEXT    NOT NULL,
      category TEXT    NOT NULL
    );

    CREATE TABLE IF NOT EXISTS dishes (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      name          TEXT    NOT NULL,
      name_es       TEXT    NOT NULL,
      slug          TEXT    NOT NULL UNIQUE,
      category      TEXT    NOT NULL,
      description   TEXT    NOT NULL,
      prep_minutes  INTEGER NOT NULL,
      difficulty    TEXT    NOT NULL,
      calories      INTEGER NOT NULL,
      protein_g     REAL    NOT NULL,
      carbs_g       REAL    NOT NULL,
      fat_g         REAL    NOT NULL,
      price_level   INTEGER NOT NULL DEFAULT 2,
      image_url     TEXT    NOT NULL DEFAULT '',
      tags          TEXT    NOT NULL DEFAULT '[]',
      axes          TEXT    NOT NULL DEFAULT '{}',
      is_vegetarian INTEGER NOT NULL DEFAULT 0,
      is_vegan      INTEGER NOT NULL DEFAULT 0,
      contains_gluten INTEGER NOT NULL DEFAULT 0,
      servings      INTEGER NOT NULL DEFAULT 2,
      steps         TEXT    NOT NULL DEFAULT '[]',
      chef_tip      TEXT,
      sugar_g       REAL    NOT NULL DEFAULT 0,
      fiber_g       REAL    NOT NULL DEFAULT 0,
      sodium_mg     REAL    NOT NULL DEFAULT 0,
      allergens     TEXT    NOT NULL DEFAULT '[]',
      verified_substitutions TEXT NOT NULL DEFAULT '[]',
      created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS dish_ingredients (
      dish_id       INTEGER NOT NULL REFERENCES dishes(id) ON DELETE CASCADE,
      ingredient_id INTEGER NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
      quantity      TEXT    NOT NULL DEFAULT '',
      optional      INTEGER NOT NULL DEFAULT 0,
      label         TEXT,
      PRIMARY KEY (dish_id, ingredient_id)
    );

    CREATE TABLE IF NOT EXISTS interactions (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      dish_id    INTEGER NOT NULL REFERENCES dishes(id) ON DELETE CASCADE,
      mood_key   TEXT,
      action     TEXT    NOT NULL,
      rating     INTEGER,
      servings   REAL    NOT NULL DEFAULT 1,
      created_at TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS recommendation_sessions (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id        INTEGER REFERENCES users(id) ON DELETE CASCADE,
      mood_key       TEXT    NOT NULL,
      model_version  TEXT    NOT NULL,
      strategy       TEXT    NOT NULL,
      payload        TEXT    NOT NULL,
      created_at     TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_interactions_user   ON interactions(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_interactions_dish   ON interactions(dish_id);
    CREATE INDEX IF NOT EXISTS idx_interactions_mood   ON interactions(mood_key);
    CREATE INDEX IF NOT EXISTS idx_dishes_category     ON dishes(category);
    CREATE INDEX IF NOT EXISTS idx_dish_ingredients_d  ON dish_ingredients(dish_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_user       ON recommendation_sessions(user_id, created_at DESC);
  `);

  applyAdditiveMigrations(db);
  createFavouritesTable(db);
  createRecipeEntriesTable(db);
  createSavedPreferencesTable(db);
}

/**
 * Recipes the user decided to keep. The primary key stops the same recipe
 * from being saved twice, which is what the UI needs to show a single
 * heart instead of a counter.
 */
export function createFavouritesTable(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS favorites (
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      dish_id    INTEGER NOT NULL REFERENCES dishes(id) ON DELETE CASCADE,
      created_at TEXT    NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, dish_id)
    );

    CREATE INDEX IF NOT EXISTS idx_favorites_user ON favorites(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_favorites_dish ON favorites(dish_id);
  `);
}

/**
 * The kitchen trail: which recipes the person opened, which ones they actually
 * cooked, and the optional notes they wrote about them. Every column beyond
 * the status is voluntary.
 */
export function createRecipeEntriesTable(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS recipe_entries (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      dish_id       INTEGER NOT NULL REFERENCES dishes(id) ON DELETE CASCADE,
      status        TEXT    NOT NULL DEFAULT 'viewed',
      rating        INTEGER,
      note          TEXT,
      feeling_note  TEXT,
      created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at    TEXT    NOT NULL DEFAULT (datetime('now')),
      UNIQUE (user_id, dish_id)
    );

    CREATE INDEX IF NOT EXISTS idx_entries_user   ON recipe_entries(user_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_entries_status ON recipe_entries(user_id, status);
  `);
}

/**
 * Preferences the user explicitly agreed to keep. They live in their own
 * table so the temporary answers of a single session are never mixed with
 * the long-term profile.
 */
export function createSavedPreferencesTable(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS saved_preferences (
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      key        TEXT    NOT NULL,
      value      TEXT    NOT NULL,
      created_at TEXT    NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, key)
    );

    CREATE INDEX IF NOT EXISTS idx_saved_prefs_user ON saved_preferences(user_id);
  `);
}

/**
 * `CREATE TABLE IF NOT EXISTS` never touches a table that already exists, so a
 * database created before a field was added would stay broken. New columns are
 * therefore added here idempotently. SQLite cannot drop columns in older
 * versions, so additions only.
 */
function applyAdditiveMigrations(db: DatabaseSync): void {
  const dishColumns = [
    ["servings", "INTEGER NOT NULL DEFAULT 2"],
    ["steps", "TEXT NOT NULL DEFAULT '[]'"],
    ["chef_tip", "TEXT"],
    ["sugar_g", "REAL NOT NULL DEFAULT 0"],
    ["fiber_g", "REAL NOT NULL DEFAULT 0"],
    ["sodium_mg", "REAL NOT NULL DEFAULT 0"],
    ["allergens", "TEXT NOT NULL DEFAULT '[]'"],
    ["verified_substitutions", "TEXT NOT NULL DEFAULT '[]'"],
  ] as const;

  const preferenceColumns = [
    ["health", "TEXT NOT NULL DEFAULT '{}'"],
    ["daily_calorie_goal", "INTEGER NOT NULL DEFAULT 2000"],
  ] as const;

  // The same ingredient can read differently from one recipe to the next
  // ("flour" is "Harina de trigo" in a cake and "Bizcocho savero" in a
  // tiramisu), so the label belongs to the link, not to the ingredient.
  const dishIngredientColumns = [["label", "TEXT"]] as const;
  const interactionColumns = [["servings", "REAL NOT NULL DEFAULT 1"]] as const;

  for (const [table, additions] of [
    ["dishes", dishColumns],
    ["user_preferences", preferenceColumns],
    ["dish_ingredients", dishIngredientColumns],
    ["interactions", interactionColumns],
  ] as const) {
    const existing = new Set(
      (db.prepare(`PRAGMA table_info(${table})`).all() as unknown as { name: string }[]).map(
        (column) => column.name,
      ),
    );

    for (const [column, definition] of additions) {
      if (existing.has(column)) continue;
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
  }
}
