import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import { createApp } from "../src/app.ts";

let server: Server;
let base: string;

before(async () => {
  const app = createApp();
  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  base = `http://127.0.0.1:${address.port}/api`;
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

async function get(path: string) {
  return fetch(`${base}${path}`);
}

async function post(path: string, body: unknown) {
  return fetch(`${base}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("service routes", () => {
  it("answers the health check", async () => {
    const response = await get("/health");
    assert.equal(response.status, 200);
    const body = (await response.json()) as { status: string };
    assert.equal(body.status, "ok");
  });

  it("lists the mood, time and craving options of the wizard", async () => {
    const response = await get("/questionnaire");
    assert.equal(response.status, 200);
    const body = (await response.json()) as {
      moods: unknown[];
      timeBudgets: unknown[];
      cravings: unknown[];
    };
    assert.equal(body.moods.length, 6);
    assert.equal(body.timeBudgets.length, 3);
    assert.equal(body.cravings.length, 5);
  });

  it("recommends from the questionnaire answers", async () => {
    const response = await post("/questionnaire/recommend", {
      moodOption: "low",
      timeBudget: "under_10",
      craving: "light",
      limit: 2,
    });

    assert.equal(response.status, 200);
    const body = (await response.json()) as {
      items: { dish: { prepMinutes: number } }[];
      questionnaire: { matchedMood: string };
      summary: string;
    };
    assert.equal(body.items.length, 2);
    assert.equal(body.questionnaire.matchedMood, "sad");
    for (const item of body.items) assert.ok(item.dish.prepMinutes <= 10);
  });

  it("rejects an invalid questionnaire with the field that failed", async () => {
    const response = await post("/questionnaire/recommend", {
      moodOption: "not-a-mood",
      timeBudget: "under_10",
      craving: "light",
    });

    assert.equal(response.status, 400);
    const body = (await response.json()) as { error: string; details: { field: string }[] };
    assert.ok(body.details.some((detail) => detail.field === "moodOption"));
  });

  it("searches the catalogue", async () => {
    const response = await get("/dishes?q=huevo");
    assert.equal(response.status, 200);
    const body = (await response.json()) as { total: number; items: unknown[] };
    assert.ok(body.total > 0);
    assert.equal(body.total, body.items.length);
  });

  it("filters the catalogue and paginates without losing the total", async () => {
    const response = await get("/dishes?difficulty=facil&maxCalories=500&sort=prep&limit=3&offset=0");
    assert.equal(response.status, 200);
    const body = (await response.json()) as {
      total: number;
      offset: number;
      limit: number;
      count: number;
      items: { difficulty: string; calories: number; prepMinutes: number }[];
    };

    assert.ok(body.total > body.count);
    assert.equal(body.count, 3);
    assert.equal(body.limit, 3);
    for (const dish of body.items) {
      assert.equal(dish.difficulty, "facil");
      assert.ok(dish.calories <= 500);
    }
    for (let i = 1; i < body.items.length; i += 1) {
      assert.ok(body.items[i - 1].prepMinutes <= body.items[i].prepMinutes);
    }
  });

  it("excludes recipes with a given allergen", async () => {
    const response = await get("/dishes?excludeAllergen=Gluten&limit=100");
    assert.equal(response.status, 200);
    const body = (await response.json()) as { items: { containsGluten: boolean }[] };
    for (const dish of body.items) assert.equal(dish.containsGluten, false);
  });

  it("summarises the catalogue for the filters", async () => {
    const response = await get("/catalog/facets");
    assert.equal(response.status, 200);
    const body = (await response.json()) as {
      total: number;
      categories: { key: string; count: number }[];
      prepBuckets: { key: string; count: number }[];
      allergens: { key: string }[];
    };

    assert.equal(body.total, 40);
    assert.ok(body.categories.length > 0);
    assert.equal(body.prepBuckets.length, 4);
    assert.ok(body.allergens.some((allergen) => allergen.key === "Gluten"));
  });

  it("returns the allergens of a recipe", async () => {
    const response = await get("/recipes/huevos-rancheros/allergens");
    assert.equal(response.status, 200);
    const body = (await response.json()) as { allergens: string[] };
    assert.ok(body.allergens.includes("Huevo"));
  });

  it("gives the recipe page its allergens, safety notes and substitutions", async () => {
    const response = await get("/dishes/huevos-rancheros");
    assert.equal(response.status, 200);
    const body = (await response.json()) as {
      dish: { slug: string };
      allergens: { key: string; label: string }[];
      safetyNotes: unknown[];
      substitutions: unknown[];
      similar: unknown[];
    };

    assert.equal(body.dish.slug, "huevos-rancheros");
    assert.ok(body.allergens.some((allergen) => allergen.key === "Huevo"));
    assert.ok(body.safetyNotes.length > 0);
    assert.ok(body.substitutions.length > 0);
    assert.ok(Array.isArray(body.similar));
  });

  it("returns 404 for a recipe that does not exist", async () => {
    const response = await get("/recipes/no-existe/allergens");
    assert.equal(response.status, 404);
  });

  it("discovers recipes by ingredients and rejects an empty list", async () => {
    const ok = await post("/discover/by-ingredients", {
      ingredients: ["huevo", "tortilla"],
      limit: 3,
    });
    assert.equal(ok.status, 200);
    const body = (await ok.json()) as { items: unknown[] };
    assert.ok(body.items.length > 0);

    const empty = await post("/discover/by-ingredients", { ingredients: [] });
    assert.equal(empty.status, 400);
  });

  it("plans meals for a couple of days", async () => {
    const response = await post("/planning/meals", { days: 2 });
    assert.equal(response.status, 200);
    const body = (await response.json()) as {
      days: { meals: unknown[] }[];
      shoppingList: unknown[];
    };
    assert.equal(body.days.length, 2);
    assert.ok(body.shoppingList.length > 0);
  });

  it("adapts a recipe to more servings", async () => {
    const response = await post("/recipes/huevos-rancheros/adapt", { servings: 4 });
    assert.equal(response.status, 200);
    const body = (await response.json()) as {
      ingredients: { originalQuantity: string; quantity: string }[];
    };
    assert.ok(body.ingredients.length > 0);
    assert.ok(body.ingredients.some((item) => item.originalQuantity !== item.quantity));
  });

  it("answers a cooking question even without a model provider", async () => {
    const response = await post("/recipes/huevos-rancheros/assistant", {
      question: "no tengo huevo",
      stepIndex: 1,
    });
    assert.equal(response.status, 200);
    const body = (await response.json()) as { answer: string; source: string };
    assert.ok(body.answer.length > 0);
    assert.equal(body.source, "local-model");
  });

  it("gives the home screen a single overview call", async () => {
    const response = await get("/users/1/overview");
    assert.equal(response.status, 200);
    const body = (await response.json()) as {
      user: { id: number };
      counts: { favorites: number; prepared: number };
    };
    assert.equal(body.user.id, 1);
    assert.equal(typeof body.counts.favorites, "number");
    assert.equal(typeof body.counts.prepared, "number");
  });

  it("returns 404 for an overview of an unknown user", async () => {
    const response = await get("/users/999999/overview");
    assert.equal(response.status, 404);
  });

  it("toggles a favourite on and back off", async () => {
    const before = await post("/users/1/favorites/toggle", { dishId: 37 });
    assert.equal(before.status, 200);
    const first = (await before.json()) as { saved: boolean; ids: number[] };

    const second = await post("/users/1/favorites/toggle", { dishId: 37 });
    assert.equal(second.status, 200);
    const back = (await second.json()) as { saved: boolean };

    assert.notEqual(first.saved, back.saved);
  });

  it("returns a validation error for a bad recommendation request", async () => {
    const response = await post("/recommendations", { moodKey: "nope" });
    assert.equal(response.status, 400);
  });
});
