import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { recommend } from "../src/services/recommendationService.ts";
import { allergensOf } from "../src/ai/allergens.ts";
import type { RecommendationRequest } from "../src/domain/types.ts";

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

describe("questionnaire to recommendations", () => {
  it("never suggests a recipe above the short time budget", async () => {
    const response = await recommend({
      moodKey: "tired",
      moodOption: "low",
      timeBudget: "under_10",
      craving: "light",
      limit: 5,
    });

    assert.ok(response.items.length > 0);
    for (const item of response.items) assert.ok(item.dish.prepMinutes <= 10);
  });

  it("still returns recipes when the person has plenty of time", async () => {
    const response = await recommend({
      moodKey: "happy",
      moodOption: "calm",
      timeBudget: "plenty",
      craving: "comfort",
      limit: 3,
    });

    assert.equal(response.items.length, 3);
  });

  it("returns a summary, a support hint field and the structured payload", async () => {
    const response = await recommend({ moodKey: "happy", limit: 3 });

    assert.ok(response.summary.length > 0);
    assert.equal(response.supportHint, null);
    assert.equal(response.structured.length, response.items.length);
    assert.equal(response.structured[0].recipeId, response.items[0].dish.id);
  });

  it("offers human support only when the words suggest real distress", async () => {
    const calm = await recommend({ moodKey: "happy", freeText: "con ganas de algo rico" });
    assert.equal(calm.supportHint, null);

    const heavy = await recommend({
      moodKey: "sad",
      freeText: "me siento muy triste y sin ganas de nada",
    });
    assert.ok(heavy.supportHint);
    assert.match(heavy.supportHint, /no puede sustituir esa ayuda/);
  });

  it("never returns a dish with a declared allergy", async () => {
    const response = await recommend({
      moodKey: "happy",
      allergies: ["Gluten"],
      limit: 12,
    });

    assert.ok(response.items.length > 0);
    for (const item of response.items) {
      assert.ok(!allergensOf(item.dish).includes("Gluten"));
    }
  });

  it("never returns a dish with an ingredient the person excluded", async () => {
    const response = await recommend({
      moodKey: "happy",
      excludedIngredients: ["pollo"],
      limit: 12,
    });

    assert.ok(response.items.length > 0);
    for (const item of response.items) {
      const labels = item.dish.ingredients.map((ingredient) => normalize(ingredient.label));
      assert.ok(!labels.some((label) => label.includes("pollo")));
    }
  });

  it("respects the difficulty ceiling", async () => {
    const response = await recommend({
      moodKey: "stressed",
      difficulty: "facil",
      limit: 8,
    });

    assert.ok(response.items.length > 0);
    for (const item of response.items) assert.equal(item.dish.difficulty, "facil");
  });

  it("rejects an unknown mood with a 400", async () => {
    const request = { moodKey: "nope" } as unknown as RecommendationRequest;
    await assert.rejects(recommend(request), (error: { statusCode?: number }) => {
      assert.equal(error.statusCode, 400);
      return true;
    });
  });

  it("reports a 422 when nothing fits the restrictions", async () => {
    await assert.rejects(
      recommend({ moodKey: "happy", maxPrepMinutes: 1 }),
      (error: { statusCode?: number }) => {
        assert.equal(error.statusCode, 422);
        return true;
      },
    );
  });
});
