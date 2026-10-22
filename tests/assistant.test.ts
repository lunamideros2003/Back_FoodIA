import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildAdaptationAnswer,
  buildGenericAnswer,
  buildStepAnswer,
  buildSubstitutionAnswer,
  detectIngredient,
  looksLikeAdaptation,
  looksLikeSubstitution,
} from "../src/ai/assistantLocal.ts";
import { allergensOf } from "../src/ai/allergens.ts";
import { findDishBySlug } from "../src/services/repositories.ts";
import type { AssistantContext } from "../src/domain/assistant.ts";

const found = findDishBySlug("huevos-rancheros");
if (!found) throw new Error("El plato de prueba debe existir");
const dish = found;

function context(overrides: Partial<AssistantContext> = {}): AssistantContext {
  return {
    dish,
    ingredients: dish.ingredients,
    steps: dish.steps,
    stepIndex: 0,
    allergens: allergensOf(dish),
    substitutions: [],
    allergies: [],
    diet: "omnivore",
    ...overrides,
  };
}

describe("intent detection", () => {
  it("recognises a substitution question", () => {
    assert.equal(looksLikeSubstitution("no tengo huevo"), true);
    assert.equal(looksLikeSubstitution("¿puedo hacer un cambio?"), true);
    assert.equal(looksLikeSubstitution("me falta leche"), true);
  });

  it("does not confuse a cooking question with a substitution", () => {
    assert.equal(looksLikeSubstitution("¿cuánto tiempo lo dejo al fuego?"), false);
  });

  it("recognises an adaptation question", () => {
    assert.equal(looksLikeAdaptation("quiero hacerlo para 6 personas"), true);
    assert.equal(looksLikeAdaptation("¿cómo doblar la receta?"), true);
    assert.equal(looksLikeAdaptation("para la mitad"), true);
  });

  it("does not confuse a step question with an adaptation", () => {
    assert.equal(looksLikeAdaptation("¿cómo frío las tortillas?"), false);
  });
});

describe("ingredient detection", () => {
  it("finds a label of the recipe inside the question", () => {
    assert.equal(detectIngredient("me falta huevo para la receta", context()), "Huevo");
  });

  it("finds a generic ingredient that is not written as a label", () => {
    assert.equal(detectIngredient("no tengo crema", context()), "crema");
  });

  it("returns null when the question names nothing edible", () => {
    assert.equal(detectIngredient("¿cuántos minutos son?", context()), null);
  });
});

describe("local substitution answers", () => {
  it("offers a verified substitution with a real quantity", () => {
    const result = buildSubstitutionAnswer("no tengo huevo", context());
    assert.ok(result);
    assert.equal(result.uncertain, false);
    assert.match(result.answer, /Puedes usar/);
    assert.match(result.answer, /Para Huevo/);
  });

  it("warns about the allergens the recipe already has", () => {
    const result = buildSubstitutionAnswer("no tengo huevo", context());
    assert.ok(result);
    assert.match(result.answer, /Esta receta lleva/);
  });

  it("is honest when there is no verified substitution", () => {
    const result = buildSubstitutionAnswer("no tengo aguacate", context());
    assert.ok(result);
    assert.equal(result.uncertain, true);
    assert.match(result.answer, /No tengo una sustitución verificada/);
  });

  it("returns null when the question does not name an ingredient", () => {
    assert.equal(buildSubstitutionAnswer("¿cuánto tarda?", context()), null);
  });
});

describe("local adaptation answers", () => {
  it("explains multiplication for more servings", () => {
    const result = buildAdaptationAnswer("para 4 personas", context(), 4);
    assert.ok(result);
    assert.equal(result.uncertain, false);
    assert.match(result.answer, /multiplica las cantidades por 2/);
  });

  it("explains halving for fewer servings", () => {
    const result = buildAdaptationAnswer("para 1 persona", context(), 1);
    assert.ok(result);
    assert.equal(result.uncertain, true);
    assert.match(result.answer, /la mitad/);
  });

  it("says nothing changes when the servings are the same", () => {
    const result = buildAdaptationAnswer("¿para cuántas personas es?", context(), dish.servings);
    assert.ok(result);
    assert.match(result.answer, /justo como está escrita/);
  });
});

describe("local step answers", () => {
  it("points back to the step that shares words with the question", () => {
    const result = buildStepAnswer("¿cómo frío las tortillas?", context());
    assert.ok(result);
    assert.match(result.answer, /paso 1/);
  });

  it("returns null when the step index does not exist", () => {
    assert.equal(buildStepAnswer("¿qué hago?", context({ stepIndex: 99 })), null);
  });

  it("falls back to an honest answer when nothing matches", () => {
    const result = buildStepAnswer("zzzzz qqqqq", context());
    assert.ok(result);
    assert.equal(result.uncertain, true);
  });
});

describe("generic answer", () => {
  it("names the recipe and lists what is needed", () => {
    const result = buildGenericAnswer("hola", context());
    assert.match(result.answer, /Huevos rancheros/);
    assert.equal(result.uncertain, true);
  });
});
