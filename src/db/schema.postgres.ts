/**
 * Postgres equivalent of `schema.ts`. Same tables, same columns, same
 * defaults; only the dialect changes: `SERIAL` instead of `AUTOINCREMENT`,
 * `TIMESTAMPTZ` instead of text dates and `DOUBLE PRECISION` instead of REAL.
 *
 * Every statement is idempotent, so the backend can create the schema itself
 * the first time it boots against a fresh Supabase project.
 */

export interface ExecLike {
  exec(sql: string): void;
}

export function applyPostgresSchema(db: ExecLike): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id            SERIAL PRIMARY KEY,
      email         TEXT NOT NULL UNIQUE,
      display_name  TEXT NOT NULL,
      password_hash TEXT,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS user_preferences (
      user_id              INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      diet                 TEXT NOT NULL DEFAULT 'omnivore',
      max_prep_minutes     INTEGER,
      max_spice_level      DOUBLE PRECISION NOT NULL DEFAULT 1,
      max_price_level      INTEGER NOT NULL DEFAULT 3,
      allergies            TEXT NOT NULL DEFAULT '[]',
      disliked_ingredients TEXT NOT NULL DEFAULT '[]',
      health               TEXT NOT NULL DEFAULT '{}',
      daily_calorie_goal   INTEGER NOT NULL DEFAULT 2000
    );

    CREATE TABLE IF NOT EXISTS moods (
      id          SERIAL PRIMARY KEY,
      key         TEXT NOT NULL UNIQUE,
      label       TEXT NOT NULL,
      emoji       TEXT NOT NULL,
      description TEXT NOT NULL,
      accent      TEXT NOT NULL,
      sort_order  INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS ingredients (
      id       SERIAL PRIMARY KEY,
      name     TEXT NOT NULL UNIQUE,
      label    TEXT NOT NULL,
      category TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS dishes (
      id                     SERIAL PRIMARY KEY,
      name                   TEXT NOT NULL,
      name_es                TEXT NOT NULL,
      slug                   TEXT NOT NULL UNIQUE,
      category               TEXT NOT NULL,
      description            TEXT NOT NULL,
      prep_minutes           INTEGER NOT NULL,
      difficulty             TEXT NOT NULL,
      calories               INTEGER NOT NULL,
      protein_g              DOUBLE PRECISION NOT NULL,
      carbs_g                DOUBLE PRECISION NOT NULL,
      fat_g                  DOUBLE PRECISION NOT NULL,
      price_level            INTEGER NOT NULL DEFAULT 2,
      image_url              TEXT NOT NULL DEFAULT '',
      tags                   TEXT NOT NULL DEFAULT '[]',
      axes                   TEXT NOT NULL DEFAULT '{}',
      is_vegetarian          INTEGER NOT NULL DEFAULT 0,
      is_vegan               INTEGER NOT NULL DEFAULT 0,
      contains_gluten        INTEGER NOT NULL DEFAULT 0,
      servings               INTEGER NOT NULL DEFAULT 2,
      steps                  TEXT NOT NULL DEFAULT '[]',
      chef_tip               TEXT,
      sugar_g                DOUBLE PRECISION NOT NULL DEFAULT 0,
      fiber_g                DOUBLE PRECISION NOT NULL DEFAULT 0,
      sodium_mg              DOUBLE PRECISION NOT NULL DEFAULT 0,
      allergens              TEXT NOT NULL DEFAULT '[]',
      verified_substitutions TEXT NOT NULL DEFAULT '[]',
      created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS dish_ingredients (
      dish_id       INTEGER NOT NULL REFERENCES dishes(id) ON DELETE CASCADE,
      ingredient_id INTEGER NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
      quantity      TEXT NOT NULL DEFAULT '',
      optional      INTEGER NOT NULL DEFAULT 0,
      label         TEXT,
      PRIMARY KEY (dish_id, ingredient_id)
    );

    CREATE TABLE IF NOT EXISTS interactions (
      id         SERIAL PRIMARY KEY,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      dish_id    INTEGER NOT NULL REFERENCES dishes(id) ON DELETE CASCADE,
      mood_key   TEXT,
      action     TEXT NOT NULL,
      rating     INTEGER,
      servings   DOUBLE PRECISION NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS recommendation_sessions (
      id            SERIAL PRIMARY KEY,
      user_id       INTEGER REFERENCES users(id) ON DELETE CASCADE,
      mood_key      TEXT NOT NULL,
      model_version TEXT NOT NULL,
      strategy      TEXT NOT NULL,
      payload       TEXT NOT NULL,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS favorites (
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      dish_id    INTEGER NOT NULL REFERENCES dishes(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (user_id, dish_id)
    );

    CREATE TABLE IF NOT EXISTS recipe_entries (
      id           SERIAL PRIMARY KEY,
      user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      dish_id      INTEGER NOT NULL REFERENCES dishes(id) ON DELETE CASCADE,
      status       TEXT NOT NULL DEFAULT 'viewed',
      rating       INTEGER,
      note         TEXT,
      feeling_note TEXT,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (user_id, dish_id)
    );

    CREATE TABLE IF NOT EXISTS saved_preferences (
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      key        TEXT NOT NULL,
      value      TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (user_id, key)
    );

    CREATE TABLE IF NOT EXISTS auth_sessions (
      token_hash TEXT PRIMARY KEY,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_interactions_user ON interactions(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_interactions_dish ON interactions(dish_id);
    CREATE INDEX IF NOT EXISTS idx_interactions_mood ON interactions(mood_key);
    CREATE INDEX IF NOT EXISTS idx_dishes_category   ON dishes(category);
    CREATE INDEX IF NOT EXISTS idx_dish_ingredients_d ON dish_ingredients(dish_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_user     ON recommendation_sessions(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_favorites_user    ON favorites(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_favorites_dish    ON favorites(dish_id);
    CREATE INDEX IF NOT EXISTS idx_entries_user      ON recipe_entries(user_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_entries_status    ON recipe_entries(user_id, status);
    CREATE INDEX IF NOT EXISTS idx_saved_prefs_user  ON saved_preferences(user_id);
    CREATE INDEX IF NOT EXISTS idx_auth_sessions_user ON auth_sessions(user_id, expires_at);
  `);

  applyAdditiveMigrations(db);
}

/**
 * `CREATE TABLE IF NOT EXISTS` never updates an existing table, so columns
 * added after the first deploy are declared here. Postgres supports
 * `IF NOT EXISTS` on `ALTER TABLE`, which keeps it idempotent.
 */
function applyAdditiveMigrations(db: ExecLike): void {
  const additions: Array<[string, string, string]> = [
    ["users", "password_hash", "TEXT"],
    ["dishes", "servings", "INTEGER NOT NULL DEFAULT 2"],
    ["dishes", "steps", "TEXT NOT NULL DEFAULT '[]'"],
    ["dishes", "chef_tip", "TEXT"],
    ["dishes", "sugar_g", "DOUBLE PRECISION NOT NULL DEFAULT 0"],
    ["dishes", "fiber_g", "DOUBLE PRECISION NOT NULL DEFAULT 0"],
    ["dishes", "sodium_mg", "DOUBLE PRECISION NOT NULL DEFAULT 0"],
    ["dishes", "allergens", "TEXT NOT NULL DEFAULT '[]'"],
    ["dishes", "verified_substitutions", "TEXT NOT NULL DEFAULT '[]'"],
    ["user_preferences", "health", "TEXT NOT NULL DEFAULT '{}'"],
    ["user_preferences", "daily_calorie_goal", "INTEGER NOT NULL DEFAULT 2000"],
    ["dish_ingredients", "label", "TEXT"],
    ["interactions", "servings", "DOUBLE PRECISION NOT NULL DEFAULT 1"],
  ];

  for (const [table, column, definition] of additions) {
    db.exec(
      `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${column} ${definition}`,
    );
  }
}
