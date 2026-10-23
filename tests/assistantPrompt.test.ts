import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ASSISTANT_SYSTEM_PROMPT,
  buildAssistantPrompt,
  buildHistoryBlock,
  buildRecipeContext,
  buildStepContext,
  trimTurn,
} from "../src/ai/assistantPrompt.ts";
import { allergensOf } from "../src/ai/allergens.ts";
import { findDishBySlug } from "../src/services/repositories.ts";
import type { AssistantContext } from "../src/domain/assistant.ts";

function bySlug(slug: string) {
  const dish = findDishBySlug(slug);
  if (!dish) throw new Error(`Falta el plato ${slug}`);
  return dish;
}

function context(overrides: Partial<AssistantContext> = {}): AssistantContext {
  const dish = overrides.dish ?? bySlug("huevos-rancheros");
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

describe("assistant system prompt", () => {
  it("forbids inventing ingredients or quantities", () => {
    assert.match(ASSISTANT_SYSTEM_PROMPT, /No inventes ingredientes/);
  });

  it("forbids medical claims and promises about mood", () => {
    assert.match(ASSISTANT_SYSTEM_PROMPT, /No das consejos médicos/);
    assert.match(ASSISTANT_SYSTEM_PROMPT, /cura o mejora un estado de ánimo/);
  });

  it("forbids pressuring the person to eat", () => {
    assert.match(ASSISTANT_SYSTEM_PROMPT, /No presionas/);
  });
});

describe("recipe context", () => {
  it("names the recipe and lists the real ingredients", () => {
    const text = buildRecipeContext(context());
    assert.match(text, /Receta: Huevos rancheros/);
    assert.match(text, /- Huevo: 3 unidades/);
  });

  it("keeps the step order", () => {
    const text = buildRecipeContext(context());
    assert.match(text, /1\. Calienta el aceite/);
    assert.match(text, /6\. Sirve sobre las tortillas/);
  });

  it("mentions the allergens of the recipe", () => {
    const text = buildRecipeContext(context());
    assert.match(text, /Alérgenos de esta receta: Huevo/);
  });

  it("mentions the declared allergies and diet when they exist", () => {
    const text = buildRecipeContext(context({ allergies: ["Gluten"], diet: "vegetarian" }));
    assert.match(text, /Alergias declaradas por la persona: Gluten/);
    assert.match(text, /Preferencia alimentaria: vegetarian/);
  });

  it("includes verified substitutions with their notes", () => {
    const text = buildRecipeContext(
      context({
        substitutions: [
          {
            original: "Huevo",
            replacement: "Puré de manzana",
            quantity: "2 cdas por huevo",
            note: "cambia la textura",
          },
        ],
      }),
    );
    assert.match(text, /Huevo → Puré de manzana/);
    assert.match(text, /cambia la textura/);
  });
});

describe("step and history context", () => {
  it("says which step the person is on", () => {
    assert.match(buildStepContext(context({ stepIndex: 2 })), /paso 3 de 6/);
  });

  it("handles the moment before the recipe starts", () => {
    assert.match(buildStepContext(context({ stepIndex: 99 })), /antes de empezar/);
  });

  it("trims a long previous answer", () => {
    const long = "palabra ".repeat(200);
    const trimmed = trimTurn(long, 50);
    assert.ok(trimmed.length <= 51);
    assert.ok(trimmed.endsWith("…"));
  });

  it("keeps only the last turns of a long conversation", () => {
    const history = Array.from({ length: 10 }, (_, index) => ({
      role: index % 2 === 0 ? ("user" as const) : ("assistant" as const),
      content: `turno-${index}`,
    }));

    const block = buildHistoryBlock(history, 4);
    assert.match(block, /turno-9/);
    assert.doesNotMatch(block, /turno-0/);
  });

  it("returns an empty block when there is no history", () => {
    assert.equal(buildHistoryBlock(undefined), "");
  });

  it("puts the question at the end of the prompt", () => {
    const prompt = buildAssistantPrompt(context(), "¿cuánto lo dejo?");
    assert.ok(prompt.trimEnd().endsWith("Pregunta de la persona: ¿cuánto lo dejo?"));
  });
});
