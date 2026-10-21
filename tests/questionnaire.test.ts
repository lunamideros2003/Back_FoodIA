import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  mapMoodOption,
  cravingScore,
  timeBudgetCeiling,
  timeFitScore,
  availableIngredientBonus,
} from "../src/ai/taxonomy.ts";
import { MOOD_OPTIONS, TIME_BUDGETS } from "../src/domain/questionnaire.ts";
import { listDishes } from "../src/services/repositories.ts";
import type { Dish } from "../src/domain/types.ts";

function makeDish(overrides: Partial<Dish> = {}): Dish {
  return {
    id: 1,
    name: "test",
    nameEs: "Prueba",
    slug: "prueba",
    category: "Almuerzo",
    description: "Plato de prueba",
    prepMinutes: 20,
    difficulty: "facil",
    calories: 400,
    proteinGrams: 20,
    carbsGrams: 40,
    fatGrams: 12,
    priceLevel: 1,
    imageUrl: "",
    tags: [],
    axes: {
      comfort: 0.5,
      energy: 0.5,
      speed: 0.5,
      lightness: 0.5,
      richness: 0.5,
      spice: 0.2,
      sweetness: 0.2,
      freshness: 0.5,
      protein: 0.5,
      indulgence: 0.2,
      warmth: 0.5,
      complexity: 0.3,
      value: 0.7,
    },
    ingredients: [],
    isVegetarian: true,
    isVegan: true,
    containsGluten: false,
    servings: 2,
    steps: ["Mezcla todo."],
    chefTip: null,
    nutrition: {
      calories: 400,
      proteinGrams: 20,
      carbsGrams: 40,
      fatGrams: 12,
      sugarGrams: 5,
      fiberGrams: 4,
      sodiumMg: 300,
    },
    ...overrides,
  };
}

describe("mood questionnaire taxonomy", () => {
  it("maps every wizard option to a canonical model mood", () => {
    for (const option of MOOD_OPTIONS) {
      const mapped = mapMoodOption(option.key);
      assert.equal(mapped.moodKey, option.moodKey);
      assert.equal(mapped.optionLabel, option.label);
    }
  });

  it("maps the low mood option to the sad mood", () => {
    assert.equal(mapMoodOption("low").moodKey, "sad");
  });

  it("gives the bored option the strongest novelty weight", () => {
    const bored = mapMoodOption("bored");
    for (const option of MOOD_OPTIONS) {
      const mapped = mapMoodOption(option.key);
      assert.ok(bored.noveltyWeight >= mapped.noveltyWeight);
    }
  });

  it("falls back to a safe mood for an unknown option", () => {
    const mapped = mapMoodOption("nope" as never);
    assert.ok(mapped.moodKey);
    assert.ok(mapped.cravingWeight > 0);
  });
});

describe("craving scoring", () => {
  it("scores a sweet dish higher for the sweet craving", () => {
    const sweetDish = makeDish({
      axes: { ...makeDish().axes, sweetness: 0.95, indulgence: 0.9 },
    });
    const savoryDish = makeDish({
      axes: { ...makeDish().axes, sweetness: 0.05, indulgence: 0.1 },
    });

    assert.ok(cravingScore(sweetDish, "sweet") > cravingScore(savoryDish, "sweet"));
  });

  it("scores a light dish higher for the light craving", () => {
    const lightDish = makeDish({
      axes: { ...makeDish().axes, lightness: 0.95, freshness: 0.9 },
    });
    const heavyDish = makeDish({
      axes: { ...makeDish().axes, lightness: 0.1, freshness: 0.2 },
    });

    assert.ok(cravingScore(lightDish, "light") > cravingScore(heavyDish, "light"));
  });

  it("returns zero when the person asked to be surprised", () => {
    assert.equal(cravingScore(makeDish(), "surprise"), 0);
  });

  it("never returns a value outside zero and one", () => {
    const dish = makeDish();
    for (const craving of ["sweet", "savory", "light", "comfort"] as const) {
      const score = cravingScore(dish, craving);
      assert.ok(score >= 0 && score <= 1);
    }
  });
});

describe("time budgets", () => {
  it("turns the short budget into a ten minute ceiling", () => {
    assert.equal(timeBudgetCeiling("under_10"), 10);
  });

  it("turns the medium budget into a thirty minute ceiling", () => {
    assert.equal(timeBudgetCeiling("between_10_30"), 30);
  });

  it("leaves the generous budget without a ceiling", () => {
    assert.equal(timeBudgetCeiling("plenty"), null);
  });

  it("scores a dish that fits the time better than one that does not", () => {
    const quick = makeDish({ prepMinutes: 8 });
    const slow = makeDish({ prepMinutes: 25 });

    assert.ok(timeFitScore(quick, 10) > timeFitScore(slow, 10));
    assert.equal(timeFitScore(slow, 10), 0);
  });

  it("keeps every budget label written for the user", () => {
    for (const budget of TIME_BUDGETS) {
      assert.ok(budget.label.trim().length > 0);
      assert.ok(budget.description.trim().length > 0);
    }
  });
});

describe("available ingredients", () => {
  it("gives no bonus when nothing was declared", () => {
    assert.equal(availableIngredientBonus(makeDish(), undefined), 0);
    assert.equal(availableIngredientBonus(makeDish(), []), 0);
  });

  it("gives a higher bonus when more of the recipe is at hand", () => {
    const dish = makeDish({
      ingredients: [
        { ingredientId: 1, name: "tomate", label: "Tomate", quantity: "2", optional: false },
        { ingredientId: 2, name: "cebolla", label: "Cebolla", quantity: "1", optional: false },
        { ingredientId: 3, name: "ajo", label: "Ajo", quantity: "2", optional: false },
      ],
    });

    const one = availableIngredientBonus(dish, ["tomate"]);
    const two = availableIngredientBonus(dish, ["tomate", "cebolla"]);

    assert.ok(two > one);
    assert.ok(two <= 1);
  });
});

describe("catalogue time coverage", () => {
  it("has a dish for every short preparation time", () => {
    const dishes = listDishes();
    assert.ok(dishes.some((dish) => dish.prepMinutes <= 10));
  });
});
