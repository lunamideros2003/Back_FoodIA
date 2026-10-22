import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { allergenConflicts, allergensOf, normalizeLabel } from "../src/ai/allergens.ts";
import { rejectReason, validateAiRecipes } from "../src/ai/guardrails.ts";
import { listDishes } from "../src/services/repositories.ts";
import type { Dish } from "../src/domain/types.ts";

const dishes = listDishes();

function bySlug(slug: string): Dish {
  const dish = dishes.find((candidate) => candidate.slug === slug);
  assert.ok(dish, `No encontramos el plato ${slug}`);
  return dish;
}

const baseConstraints = {
  diet: "omnivore" as const,
  allergies: [] as string[],
  excludedIngredients: [] as string[],
  maxPrepMinutes: null as number | null,
};

describe("allergen detection", () => {
  it("normalises labels so accents do not matter", () => {
    assert.equal(normalizeLabel("Camarón"), "camaron");
    assert.equal(normalizeLabel("  Harina de Trigo "), "harina de trigo");
  });

  it("finds gluten in a recipe that has wheat", () => {
    const allergens = allergensOf(bySlug("fluffy-blueberry-pancakes"));
    assert.ok(allergens.includes("Gluten"));
  });

  it("finds dairy in a recipe that has milk", () => {
    assert.ok(allergensOf(bySlug("creamy-oat-porridge")).includes("Leche"));
  });

  it("reports no allergen for a dish without any of them", () => {
    const allergens = allergensOf(bySlug("homemade-lemonade"));
    assert.deepEqual(allergens, []);
  });

  it("detects the conflict between a dish and a declared allergy", () => {
    const conflicts = allergenConflicts(bySlug("fluffy-blueberry-pancakes"), ["Gluten"]);
    assert.ok(conflicts.length > 0);
  });

  it("reports no conflict when the allergy is not in the dish", () => {
    assert.deepEqual(allergenConflicts(bySlug("homemade-lemonade"), ["Mariscos"]), []);
  });
});

describe("hard constraint guardrails", () => {
  it("blocks a dish that breaks the diet", () => {
    const reason = rejectReason(bySlug("salmon-poke-bowl"), {
      ...baseConstraints,
      diet: "vegan",
    });
    assert.ok(reason);
    assert.match(reason, /vegan/i);
  });

  it("blocks a dish with a declared allergen", () => {
    const reason = rejectReason(bySlug("fluffy-blueberry-pancakes"), {
      ...baseConstraints,
      allergies: ["Gluten"],
    });
    assert.ok(reason);
    assert.match(reason, /alergia/i);
  });

  it("blocks a dish that takes longer than the time available", () => {
    const reason = rejectReason(bySlug("mushroom-risotto"), {
      ...baseConstraints,
      maxPrepMinutes: 10,
    });
    assert.ok(reason);
    assert.match(reason, /minutos/);
  });

  it("blocks an ingredient the person asked not to see", () => {
    const reason = rejectReason(bySlug("grilled-salmon-lemon-greens"), {
      ...baseConstraints,
      excludedIngredients: ["salmón"],
    });
    assert.ok(reason);
    assert.match(reason, /no te lo mostrara/i);
  });

  it("blocks a dish that is harder than the requested difficulty", () => {
    const reason = rejectReason(bySlug("mushroom-risotto"), {
      ...baseConstraints,
      difficulty: "facil",
    });
    assert.ok(reason);
    assert.match(reason, /difícil/i);
  });

  it("accepts a dish that breaks nothing", () => {
    assert.equal(rejectReason(bySlug("homemade-lemonade"), baseConstraints), null);
  });
});

describe("AI payload validation", () => {
  const catalogue = new Map(dishes.map((dish) => [dish.id, dish]));

  it("drops a recipe that is not in the catalogue", () => {
    const result = validateAiRecipes(
      [{ recipeId: 999999, reason: "inventada" }],
      catalogue,
      baseConstraints,
    );
    assert.equal(result.accepted.length, 0);
    assert.equal(result.rejected.length, 1);
  });

  it("keeps a recipe that exists and passes the constraints", () => {
    const dish = bySlug("homemade-lemonade");
    const result = validateAiRecipes(
      [{ recipeId: dish.id, reason: "Refrescante y rápida", timeMatch: true }],
      catalogue,
      baseConstraints,
    );
    assert.equal(result.accepted.length, 1);
    assert.equal(result.accepted[0].recipeId, dish.id);
  });

  it("drops a recipe that breaks an allergy even if the model asked for it", () => {
    const dish = bySlug("fluffy-blueberry-pancakes");
    const result = validateAiRecipes(
      [{ recipeId: dish.id, reason: "muy buena" }],
      catalogue,
      { ...baseConstraints, allergies: ["Gluten"] },
    );
    assert.equal(result.accepted.length, 0);
    assert.equal(result.rejected.length, 1);
  });

  it("ignores a payload that is not an array", () => {
    const result = validateAiRecipes({ nope: true }, catalogue, baseConstraints);
    assert.equal(result.accepted.length, 0);
    assert.equal(result.rejected.length, 0);
  });
});
