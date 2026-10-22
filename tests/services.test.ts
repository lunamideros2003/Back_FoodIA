import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  explainIngredientMatch,
  ingredientMatches,
  matchByIngredients,
  matchTimeFit,
  scoreIngredientMatch,
} from "../src/services/ingredientService.ts";
import {
  adaptRecipe,
  formatQuantity,
  parseQuantity,
  scaleIngredients,
  scaleQuantity,
} from "../src/services/adaptationService.ts";
import {
  buildMealPlan,
  buildShoppingList,
  mergeQuantities,
  planReason,
} from "../src/services/planningService.ts";
import { findDishBySlug, listDishes } from "../src/services/repositories.ts";

const found = findDishBySlug("huevos-rancheros");
if (!found) throw new Error("El plato de prueba debe existir");
const dish = found;

describe("ingredient matching", () => {
  it("matches an ingredient through its label", () => {
    assert.equal(ingredientMatches("Huevo", ["huevo"]), true);
    assert.equal(ingredientMatches("Tomate triturado", ["tomate"]), true);
  });

  it("does not match an ingredient that is not there", () => {
    assert.equal(ingredientMatches("Huevo", ["arroz"]), false);
    assert.equal(ingredientMatches("   ", ["arroz"]), false);
  });

  it("reaches full coverage when the person has everything", () => {
    const match = scoreIngredientMatch(dish, [
      "aguacate",
      "frijol",
      "huevo",
      "salsa",
      "tortilla",
    ]);

    assert.equal(match.coverage, 1);
    assert.deepEqual(match.missing, []);
    assert.equal(match.matched.length, dish.ingredients.length);
  });

  it("reports the missing ingredients when the person has only some", () => {
    const match = scoreIngredientMatch(dish, ["huevo"]);

    assert.ok(match.coverage > 0 && match.coverage < 1);
    assert.ok(match.missing.includes("Aguacate"));
    assert.ok(match.matched.includes("Huevo"));
  });

  it("orders the best-covered recipes first", () => {
    const matches = matchByIngredients(listDishes(), ["huevo", "tortilla", "aguacate"]);

    assert.ok(matches.length > 0);
    for (let i = 1; i < matches.length; i += 1) {
      assert.ok(matches[i - 1].coverage >= matches[i].coverage);
    }
  });

  it("filters to the recipes that can be cooked right now", () => {
    const complete = matchByIngredients(listDishes(), ["huevo", "tortilla", "aguacate"], {
      onlyComplete: true,
    });

    for (const match of complete) assert.equal(match.missing.length, 0);
  });

  it("filters by the time available", () => {
    const matches = matchByIngredients(listDishes(), ["huevo"], { maxPrepMinutes: 10 });
    for (const match of matches) assert.ok(match.dish.prepMinutes <= 10);
  });

  it("explains a complete match with the real ingredients", () => {
    const match = scoreIngredientMatch(dish, [
      "aguacate",
      "frijol",
      "huevo",
      "salsa",
      "tortilla",
    ]);
    assert.match(explainIngredientMatch(match), /Tienes todo lo que necesita/);
  });

  it("explains a partial match with what is missing", () => {
    const match = scoreIngredientMatch(dish, ["huevo"]);
    assert.match(explainIngredientMatch(match), /Solo falta/);
  });

  it("scores the time fit of a match", () => {
    const quick = scoreIngredientMatch(dish, ["huevo"]);
    assert.equal(matchTimeFit(quick, 5), 0);
    assert.ok(matchTimeFit(quick, 60) > 0);
  });
});

describe("quantity parsing", () => {
  it("parses a plain quantity", () => {
    assert.deepEqual(parseQuantity("200 g"), { value: 200, rest: "g" });
  });

  it("parses a decimal with a comma", () => {
    assert.deepEqual(parseQuantity("1,5 tazas"), { value: 1.5, rest: "tazas" });
  });

  it("parses a fraction as the real amount", () => {
    assert.deepEqual(parseQuantity("1/2 unidad"), { value: 0.5, rest: "unidad" });
  });

  it("returns null for a quantity that is not a number", () => {
    assert.equal(parseQuantity("al gusto"), null);
    assert.equal(parseQuantity(""), null);
  });
});

describe("quantity scaling", () => {
  it("keeps the unit and multiplies the amount", () => {
    assert.deepEqual(scaleQuantity("200 g", 1.5), { quantity: "300 g", approximate: false });
  });

  it("writes a half as a fraction a cook can read", () => {
    assert.equal(formatQuantity(0.5, "unidad"), "1/2 unidad");
  });

  it("keeps an unscalable amount and marks it as approximate", () => {
    const scaled = scaleQuantity("al gusto", 3);
    assert.equal(scaled.quantity, "al gusto");
    assert.equal(scaled.approximate, true);
  });

  it("scales every ingredient of a recipe", () => {
    const scaled = scaleIngredients(dish.ingredients, 2, 4);
    const huevo = scaled.find((item) => item.label === "Huevo");

    assert.ok(huevo);
    assert.equal(huevo.originalQuantity, "3 unidades");
    assert.equal(huevo.quantity, "6 unidades");
    assert.equal(huevo.approximate, false);
  });

  it("keeps the original quantity next to the scaled one", () => {
    const scaled = scaleIngredients(dish.ingredients, 2, 1);
    const huevo = scaled.find((item) => item.label === "Huevo");

    assert.ok(huevo);
    assert.equal(huevo.originalQuantity, "3 unidades");
    assert.equal(huevo.quantity, "1.5 unidades");
  });
});

describe("recipe adaptation", () => {
  it("notes that the quantities were adjusted", () => {
    const result = adaptRecipe(dish, { servings: 4 });
    assert.ok(result.notes.some((note) => note.includes("de 2 a 4 porciones")));
  });

  it("offers a verified substitution for an excluded ingredient", () => {
    const result = adaptRecipe(dish, { excludeIngredients: ["huevo"] });
    assert.ok(result.substitutions.length > 0);
    assert.match(result.notes.join(" "), /Huevo/);
  });

  it("warns when the substitution could add an allergen", () => {
    const result = adaptRecipe(dish, { excludeIngredients: ["huevo"] });
    assert.ok(result.warnings.some((warning) => warning.includes("alérgeno")));
  });

  it("warns honestly when a vegan adaptation is not possible", () => {
    const result = adaptRecipe(dish, { diet: "vegan" });
    assert.ok(result.warnings.some((warning) => warning.includes("no es vegana")));
  });

  it("keeps the steps untouched", () => {
    const result = adaptRecipe(dish, { servings: 6 });
    assert.deepEqual(result.steps, dish.steps);
  });
});

describe("meal planning", () => {
  it("plans the requested number of days", () => {
    const plan = buildMealPlan({ days: 3 });
    assert.equal(plan.days.length, 3);
  });

  it("fills several slots per day with real dishes", () => {
    const plan = buildMealPlan({ days: 1 });
    assert.ok(plan.days[0].meals.length >= 2);
    for (const meal of plan.days[0].meals) assert.ok(meal.dish.id > 0);
  });

  it("does not repeat the same dish across days", () => {
    const plan = buildMealPlan({ days: 3 });
    const ids = plan.days.flatMap((day) => day.meals.map((meal) => meal.dish.id));
    assert.equal(new Set(ids).size, ids.length);
  });

  it("includes the reminder that it is a suggestion, not a diet", () => {
    const plan = buildMealPlan({ days: 1 });
    assert.match(plan.note, /no un plan alimentario/);
  });

  it("builds a shopping list with the recipes each item comes from", () => {
    const plan = buildMealPlan({ days: 2 });
    assert.ok(plan.shoppingList.length > 0);
    for (const item of plan.shoppingList) assert.ok(item.dishes.length > 0);
  });

  it("merges quantities when the units match", () => {
    assert.equal(mergeQuantities("100 g", "50 g"), "150 g");
  });

  it("keeps the first quantity when the units differ", () => {
    assert.equal(mergeQuantities("100 g", "2 unidades"), "100 g");
  });

  it("explains a planned meal with the real recipe data", () => {
    const reason = planReason(dish, "almuerzo");
    assert.match(reason, new RegExp(`${dish.prepMinutes} minutos`));
  });

  it("never returns an empty shopping list for a non-empty plan", () => {
    const plan = buildMealPlan({ days: 1 });
    const list = buildShoppingList(plan.days);
    assert.ok(list.length > 0);
  });
});
