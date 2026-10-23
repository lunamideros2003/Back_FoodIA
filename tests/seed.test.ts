import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getDb } from "../src/db/connection.ts";
import { isSeeded } from "../src/db/seed.ts";
import { listDishes } from "../src/services/repositories.ts";
import { allergensOf } from "../src/ai/allergens.ts";

interface StoredDish {
  slug: string;
  allergens: string;
  verified_substitutions: string;
}

describe("seeded catalogue", () => {
  it("is marked as seeded", () => {
    assert.equal(isSeeded(), true);
  });

  it("has the expected number of dishes", () => {
    assert.equal(listDishes().length, 40);
  });

  it("stores the allergens that the ingredient list implies", () => {
    const rows = getDb()
      .prepare(`SELECT slug, allergens FROM dishes`)
      .all() as unknown as StoredDish[];
    const bySlug = new Map(listDishes().map((dish) => [dish.slug, dish]));

    for (const row of rows) {
      const dish = bySlug.get(row.slug);
      assert.ok(dish, `El plato ${row.slug} debe poder leerse`);
      assert.deepEqual(
        JSON.parse(row.allergens),
        allergensOf(dish),
        `Los alérgenos guardados de ${row.slug} deben coincidir con sus ingredientes`,
      );
    }
  });

  it("stores a parseable substitution list for every dish", () => {
    const rows = getDb()
      .prepare(`SELECT verified_substitutions FROM dishes`)
      .all() as unknown as StoredDish[];

    for (const row of rows) {
      const parsed = JSON.parse(row.verified_substitutions);
      assert.ok(Array.isArray(parsed));
    }
  });

  it("stores at least one verified substitution for the recipes that need it", () => {
    const rows = getDb()
      .prepare(
        `SELECT verified_substitutions FROM dishes WHERE slug IN (?, ?, ?)`,
      )
      .all("fluffy-blueberry-pancakes", "huevos-rancheros", "homemade-lemonade") as unknown as StoredDish[];

    for (const row of rows) {
      const parsed = JSON.parse(row.verified_substitutions) as unknown[];
      assert.ok(parsed.length > 0);
    }
  });
});
