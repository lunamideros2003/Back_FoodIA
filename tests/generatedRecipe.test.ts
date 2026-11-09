import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { allergensOf } from "../src/ai/allergens.ts";
import { recipeFixture } from "./recipeFixture.ts";

// The service seeds and writes a real database, so this suite gets its own
// throwaway file and never touches the development one.
const databaseDir = fs.mkdtempSync(path.join(os.tmpdir(), "foodmood-recipes-"));
process.env.DATABASE_FILE = path.join(databaseDir, "recipes.test.sqlite");

let service: typeof import("../src/services/generatedRecipeService.ts");
let repositories: typeof import("../src/services/repositories.ts");
let closeDb: () => void;

before(async () => {
  service = await import("../src/services/generatedRecipeService.ts");
  repositories = await import("../src/services/repositories.ts");
  const connection = await import("../src/db/connection.ts");
  const seedModule = await import("../src/db/seed.ts");

  closeDb = connection.closeDb;
  seedModule.seed();
});

after(() => {
  closeDb();
  fs.rmSync(databaseDir, { recursive: true, force: true });
});

describe("generated recipe storage", () => {
  it("builds a URL-safe slug", () => {
    assert.equal(service.recipeSlug("Tarta de calabaza y queso"), "tarta-de-calabaza-y-queso");
    assert.equal(service.recipeSlug("  Tarta   de calabaza  "), "tarta-de-calabaza");
    assert.equal(service.recipeSlug("Ñandú al ají"), "nandu-al-aji");
    assert.equal(service.recipeSlug("¡Sin números 123!"), "sin-numeros-123");
  });

  it("keeps a generated slug short enough for a URL", () => {
    const name = "Receta de la abuela con muchos ingredientes y un nombre largo".repeat(4);

    assert.ok(service.recipeSlug(name).length <= 60);
  });

  it("adds the recipe to the catalogue with its ingredients and steps", () => {
    const before = repositories.listDishes().length;
    const dish = service.saveGeneratedRecipe(recipeFixture());

    assert.equal(repositories.listDishes().length, before + 1);
    assert.equal(dish.slug, "tarta-tibia-de-calabaza");
    assert.equal(dish.servings, 2);
    assert.equal(dish.steps.length, 3);
    assert.equal(dish.ingredients.length, 4);
    assert.ok(dish.tags.includes("creada con IA"));
    assert.ok(dish.nutrition.sodiumMg > 0);
  });

  it("derives allergens from the ingredient labels", () => {
    const dish = repositories.findDishBySlug("tarta-tibia-de-calabaza");

    assert.ok(dish);
    assert.ok(allergensOf(dish).includes("Gluten"));
  });

  it("does not overwrite a previous recipe with the same name", () => {
    const first = repositories.findDishBySlug("tarta-tibia-de-calabaza");
    const dish = service.saveGeneratedRecipe(recipeFixture());

    assert.equal(dish.slug, "tarta-tibia-de-calabaza-2");
    assert.notEqual(dish.id, first?.id);
  });
});
