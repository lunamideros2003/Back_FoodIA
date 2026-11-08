import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { extractRecipeJson, parseGeneratedRecipe } from "../src/ai/recipeSchema.ts";
import { recipeFixture } from "./recipeFixture.ts";

describe("generated recipe schema", () => {
  it("accepts a complete recipe and normalizes the text", () => {
    const parsed = parseGeneratedRecipe(JSON.stringify(recipeFixture()));

    assert.equal(parsed.nameEs, "Tarta tibia de calabaza");
    assert.equal(parsed.category, "Cena");
    assert.equal(parsed.ingredients.length, 4);
    assert.equal(parsed.steps.length, 3);
  });

  it("reads a recipe wrapped in markdown fences", () => {
    const text = "Claro:\n```json\n" + JSON.stringify(recipeFixture()) + "\n```";
    const json = extractRecipeJson(text) as { nameEs?: string };

    assert.equal(json.nameEs, "Tarta tibia de calabaza");
  });

  it("rejects a recipe without ingredients", () => {
    assert.throws(() =>
      parseGeneratedRecipe(JSON.stringify(recipeFixture({ ingredients: [] }))),
    );
  });

  it("rejects an unknown category", () => {
    assert.throws(() =>
      parseGeneratedRecipe(JSON.stringify(recipeFixture({ category: "Brunch" }))),
    );
  });

  it("rejects an incomplete recipe", () => {
    const payload = { ...recipeFixture(), steps: ["Solo un paso."] };
    assert.throws(() => parseGeneratedRecipe(JSON.stringify(payload)));
  });

  it("rejects text that is not a JSON object", () => {
    assert.throws(() => extractRecipeJson("No pude crear la receta."));
  });

  it("removes duplicate tags and collapses spaces", () => {
    const parsed = parseGeneratedRecipe(
      JSON.stringify(
        recipeFixture({
          nameEs: "  Tarta   de calabaza  ",
          tags: ["horno", "horno", " calabaza "],
        }),
      ),
    );

    assert.equal(parsed.nameEs, "Tarta de calabaza");
    assert.deepEqual(parsed.tags, ["horno", "calabaza"]);
  });
});
