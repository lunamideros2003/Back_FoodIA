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
      created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS dish_ingredients (
      dish_id       INTEGER NOT NULL REFERENCES dishes(id) ON DELETE CASCADE,
      ingredient_id INTEGER NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
      quantity      TEXT    NOT NULL DEFAULT '',
      optional      INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (dish_id, ingredient_id)
    );

    CREATE TABLE IF NOT EXISTS interactions (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      dish_id    INTEGER NOT NULL REFERENCES dishes(id) ON DELETE CASCADE,
      mood_key   TEXT,
      action     TEXT    NOT NULL,
      rating     INTEGER,
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
  ] as const;

  const preferenceColumns = [
    ["health", "TEXT NOT NULL DEFAULT '{}'"],
    ["daily_calorie_goal", "INTEGER NOT NULL DEFAULT 2000"],
  ] as const;

  for (const [table, additions] of [
    ["dishes", dishColumns],
    ["user_preferences", preferenceColumns],
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
