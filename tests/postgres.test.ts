import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { toPostgresSql } from "../src/db/postgresSql.ts";

/**
 * The SQL translator is pure, so it can be checked without a database. The
 * adapter itself is exercised against PGlite (Postgres compiled to WASM),
 * which means no Docker and no external service are needed for the suite.
 */
describe("SQLite → Postgres translation", () => {
  it("numbers the placeholders in order", () => {
    assert.equal(
      toPostgresSql("SELECT * FROM users WHERE id = ? AND email = ?"),
      "SELECT * FROM users WHERE id = $1 AND email = $2",
    );
  });

  it("leaves question marks inside string literals alone", () => {
    assert.equal(
      toPostgresSql("SELECT * FROM dishes WHERE name = '¿Qué?' AND id = ?"),
      "SELECT * FROM dishes WHERE name = '¿Qué?' AND id = $1",
    );
  });

  it("turns INSERT OR IGNORE into ON CONFLICT DO NOTHING", () => {
    const sql = toPostgresSql(
      "INSERT OR IGNORE INTO favorites (user_id, dish_id) VALUES (?, ?)",
    );
    assert.match(sql, /^INSERT INTO favorites/);
    assert.match(sql, /ON CONFLICT DO NOTHING$/);
  });

  it("rewrites the SQLite date helpers", () => {
    assert.match(
      toPostgresSql("UPDATE recipe_entries SET updated_at = datetime('now') WHERE id = ?"),
      /updated_at = now\(\)/,
    );
    assert.match(
      toPostgresSql("VALUES (?, datetime('now', ?))"),
      /\(now\(\) \+ \$2::interval\)/,
    );
  });

  it("adds RETURNING id to inserts that need the new id", () => {
    assert.match(
      toPostgresSql("INSERT INTO users (email) VALUES (?)"),
      /RETURNING id$/,
    );
  });

  it("does not add RETURNING to tables without an id column", () => {
    assert.doesNotMatch(
      toPostgresSql("INSERT INTO favorites (user_id, dish_id) VALUES (?, ?)"),
      /RETURNING/,
    );
  });

  it("drops statements that only exist in SQLite", () => {
    assert.equal(toPostgresSql("PRAGMA foreign_keys = ON;"), "");
    assert.equal(
      toPostgresSql("DELETE FROM sqlite_sequence WHERE name IN ('users');"),
      "",
    );
  });
});

describe("Postgres adapter against PGlite", () => {
  let connection: typeof import("../src/db/connection.ts");
  let seedModule: typeof import("../src/db/seed.ts");

  before(async () => {
    process.env.DATABASE_URL = "pglite://memory";
    process.env.DATABASE_SSL = "false";
    connection = await import("../src/db/connection.ts");
    seedModule = await import("../src/db/seed.ts");
  });

  after(() => {
    connection.closeDb();
  });

  it("creates the schema and seeds the catalogue", () => {
    connection.getDb();
    const report = seedModule.seed();
    assert.equal(report.dishes, 40);
    assert.equal(report.moods, 6);

    const dishes = connection
      .getDb()
      .prepare("SELECT COUNT(*) AS total FROM dishes")
      .get() as { total: number };
    assert.equal(dishes.total, 40);
  });

  it("keeps the id of an inserted row", () => {
    const result = connection
      .getDb()
      .prepare("INSERT INTO users (email, display_name) VALUES (?, ?)")
      .run("pg-adapter@example.com", "Prueba");
    assert.ok(Number(result.lastInsertRowid) > 0);

    const row = connection
      .getDb()
      .prepare("SELECT * FROM users WHERE id = ?")
      .get(Number(result.lastInsertRowid)) as { email: string };
    assert.equal(row.email, "pg-adapter@example.com");
  });

  it("rolls a transaction back when something throws", () => {
    const db = connection.getDb();
    const before = db.prepare("SELECT COUNT(*) AS total FROM users").get() as {
      total: number;
    };

    assert.throws(() =>
      connection.transaction((conn) => {
        conn.prepare("INSERT INTO users (email, display_name) VALUES (?, ?)").run(
          "rollback@example.com",
          "Rollback",
        );
        throw new Error("boom");
      }),
    );

    const after = db.prepare("SELECT COUNT(*) AS total FROM users").get() as {
      total: number;
    };
    assert.equal(after.total, before.total);
  });

  it("reads timestamps and counts with the same shape as SQLite", () => {
    const row = connection
      .getDb()
      .prepare("SELECT created_at, COUNT(*) AS total FROM users GROUP BY created_at LIMIT 1")
      .get() as { created_at: string; total: number };

    assert.equal(typeof row.total, "number");
    assert.equal(typeof row.created_at, "string");
    assert.ok(!Number.isNaN(Date.parse(row.created_at)));
  });
});
