import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { cosine } from "../src/ai/vector.ts";
import { buildTfidfModel, tokenize, vectorizeQuery } from "../src/ai/text.ts";
import { MoodModel } from "../src/ai/moodModel.ts";
import { CollaborativeFilter } from "../src/ai/collaborative.ts";
import { TasteProfile } from "../src/ai/tasteProfile.ts";
import { diversify, rankDishes, type RecommenderContext } from "../src/ai/recommender.ts";
import { extractIntent, hasHardConstraints } from "../src/ai/intent.ts";
import {
  conditionsOf,
  evaluateDish,
  shouldAskAboutHealth,
  HEALTH_LIMITS,
} from "../src/ai/health.ts";
import { composeLocalNarrative } from "../src/ai/narrative.ts";
import { listDishes, listInteractions, findMood, findUserById } from "../src/services/repositories.ts";
import { modelStore } from "../src/services/modelStore.ts";
import { closeDb } from "../src/db/connection.ts";
import type { Dish, DishAxes, Mood, ScoreBreakdown } from "../src/domain/types.ts";
import { EMPTY_HEALTH_PROFILE } from "../src/domain/types.ts";

function makeDish(id: number, nameEs: string, axes: Partial<DishAxes> = {}, extra: Partial<Dish> = {}): Dish {
  return {
    id,
    name: nameEs,
    nameEs,
    slug: `dish-${id}`,
    category: "Almuerzo",
    description: "",
    prepMinutes: 20,
    difficulty: "facil",
    calories: 500,
    proteinGrams: 20,
    carbsGrams: 50,
    fatGrams: 15,
    priceLevel: 1,
    imageUrl: "",
    tags: [],
    axes: {
      comfort: 0.5, energy: 0.5, speed: 0.5, lightness: 0.5, richness: 0.5,
      spice: 0.5, sweetness: 0.5, freshness: 0.5, protein: 0.5, indulgence: 0.5,
      warmth: 0.5, complexity: 0.5, value: 0.5,
      ...axes,
    },
    ingredients: [],
    isVegetarian: true,
    isVegan: true,
    containsGluten: false,
    servings: 2,
    steps: ["Preparar y servir."],
    chefTip: null,
    nutrition: {
      calories: extra.calories ?? 500,
      proteinGrams: extra.proteinGrams ?? 20,
      carbsGrams: extra.carbsGrams ?? 50,
      fatGrams: extra.fatGrams ?? 15,
      sugarGrams: 8,
      fiberGrams: 5,
      sodiumMg: 300,
    },
    ...extra,
  };
}

function makeBreakdown(total: number): ScoreBreakdown {
  return {
    moodAffinity: 0.5, tasteMatch: 0.5, collaborative: 0.5, preferenceFit: 1,
    novelty: 0.5, popularity: 0.5, healthFit: 1, cravingFit: 0.5, timeFit: 0.5, total,
    topReasons: [], healthNotes: [],
  };
}

describe("vector maths", () => {
  it("returns 1 for identical vectors and 0 for orthogonal ones", () => {
    assert.equal(cosine([1, 2, 3], [1, 2, 3]), 1);
    assert.equal(cosine([1, 0], [0, 1]), 0);
  });

  it("is symmetric and handles the zero vector", () => {
    assert.equal(cosine([0, 0], [1, 2]), 0);
    assert.equal(cosine([0.3, 0.7], [1, 0.2]), cosine([1, 0.2], [0.3, 0.7]));
  });

  it("rejects mismatched dimensions", () => {
    assert.throws(() => cosine([1], [1, 2]));
  });
});

describe("text pipeline", () => {
  it("normalizes accents and drops stopwords", () => {
    const tokens = tokenize("Tengo MUCHAS ganas de algo RÁPIDO y barato");
    assert.ok(tokens.includes("rapido"));
    assert.ok(tokens.includes("barato"));
    assert.ok(!tokens.includes("de"));
  });

  it("scores a document closer to its own text than to an unrelated one", () => {
    const model = buildTfidfModel([
      { id: 1, text: "pollo a la plancha con arroz y limón" },
      { id: 2, text: "tarta de chocolate con helado de vainilla" },
    ]);
    const query = vectorizeQuery(model, "pollo con limón");
    const chicken = cosine(query, model.vectors.get(1)!);
    const cake = cosine(query, model.vectors.get(2)!);
    assert.ok(chicken > cake, `esperaba pollo > tarta, obtuve ${chicken} vs ${cake}`);
  });
});

describe("mood model", () => {
  it("ranks a comfort dish above a fresh salad for the tired mood", () => {
    const model = new MoodModel();
    const comfort = makeDish(1, "Sopa", { comfort: 0.95, warmth: 0.95, spice: 0.1, sweetness: 0.4 });
    const salad = makeDish(2, "Ensalada", { comfort: 0.3, warmth: 0.2, spice: 0.2, freshness: 0.95, sweetness: 0.3 });

    assert.ok(model.affinity("tired", comfort.axes).score > model.affinity("tired", salad.axes).score);
  });

  it("moves the target profile towards the dishes a user actually liked", () => {
    const model = new MoodModel();
    const before = model.learnedTarget("no_energy").freshness;

    for (let i = 0; i < 12; i += 1) {
      model.train([
        { moodKey: "no_energy", axes: makeDish(i, "x", { freshness: 0.05, richness: 0.95 }).axes, action: "like" },
        { moodKey: "no_energy", axes: makeDish(100 + i, "y", { freshness: 0.95, richness: 0.1 }).axes, action: "dislike" },
      ]);
    }

    const after = model.learnedTarget("no_energy").freshness;
    assert.ok(after < before, `esperaba que el target de frescura bajara: ${before} -> ${after}`);
  });

  it("keeps the curated axes in control when a mood is untrained", () => {
    const model = new MoodModel();
    const importance = model.learnedImportance("tired");
    const strongest = (Object.entries(importance) as [string, number][]).sort((a, b) => b[1] - a[1])[0];
    assert.equal(strongest[0], "comfort");
  });

  it("reports the axis contributions that drove a match", () => {
    const model = new MoodModel();
    const { contributions } = model.affinity("tired", makeDish(1, "x", { comfort: 1, warmth: 0.95 }).axes);
    assert.ok(contributions.length > 0);
    assert.equal(contributions[0].axis, "comfort");
  });
});

describe("collaborative filtering", () => {
  it("predicts an unseen dish that co-occurs with a liked one", () => {
    const cf = new CollaborativeFilter();
    cf.fit([
      { userId: 1, dishId: 10, action: "like" },
      { userId: 1, dishId: 11, action: "like" },
      { userId: 2, dishId: 10, action: "like" },
      { userId: 2, dishId: 11, action: "like" },
      { userId: 3, dishId: 10, action: "like" },
    ]);

    const similar = cf.similarItems(10).map((entry) => entry.dishId);
    assert.ok(similar.includes(11), `esperaba 11 entre los similares, obtuve ${similar}`);

    const predictions = cf.predict(3);
    assert.ok((predictions.get(11) ?? 0) > 0);
  });

  it("ignores a pairing that only one user has in common", () => {
    // With a single shared user both item vectors are parallel, so cosine
    // would report a flat 1.0 similarity for every candidate. That is not
    // evidence, so the pair must be discarded.
    const cf = new CollaborativeFilter();
    cf.fit([
      { userId: 1, dishId: 10, action: "like" },
      { userId: 1, dishId: 20, action: "like" },
      { userId: 1, dishId: 30, action: "like" },
    ]);

    assert.deepEqual(cf.similarItems(10), []);
  });

  it("ranks a strongly co-rated item above a weakly co-rated one", () => {
    const cf = new CollaborativeFilter();
    // Two shared users so the pair clears the evidence threshold, but dish 20
    // is rated far more strongly than dish 30 by the user they share.
    cf.fit([
      { userId: 1, dishId: 10, action: "like" },
      { userId: 1, dishId: 20, action: "cook" },
      { userId: 1, dishId: 30, action: "rate", rating: 1 },
      { userId: 2, dishId: 10, action: "like" },
      { userId: 2, dishId: 20, action: "like" },
      { userId: 2, dishId: 30, action: "rate", rating: 1 },
    ]);

    const byId = new Map(cf.similarItems(10).map((entry) => [entry.dishId, entry.similarity]));
    assert.ok((byId.get(20) ?? 0) > (byId.get(30) ?? 0), "el plato mejor valued debe ganar");
    assert.notEqual(byId.get(20), byId.get(30), "no todos los candidatos pueden empatar");
  });

  it("does not recommend a dish the user already reacted to", () => {
    const cf = new CollaborativeFilter();
    cf.fit([
      { userId: 1, dishId: 10, action: "like" },
      { userId: 1, dishId: 11, action: "like" },
      { userId: 2, dishId: 10, action: "like" },
      { userId: 2, dishId: 11, action: "like" },
    ]);
    const predictions = cf.predict(1, new Set([10, 11]));
    assert.equal(predictions.size, 0);
  });

  it("treats a shared dislike as negative evidence, not similarity", () => {
    const cf = new CollaborativeFilter();
    cf.fit([
      { userId: 1, dishId: 10, action: "like" },
      { userId: 1, dishId: 20, action: "dislike" },
      { userId: 2, dishId: 10, action: "like" },
      { userId: 2, dishId: 20, action: "dislike" },
    ]);
    const negative = cf.similarItems(10).find((entry) => entry.dishId === 20);
    assert.ok(!negative || negative.similarity <= 0.01, "un dislike compartido no es parecido");
  });
});

describe("taste profile", () => {
  it("moves a dish towards the centroid of the dishes a user liked", () => {
    const profile = new TasteProfile();
    profile.fit([
      makeDish(1, "Sopa de pollo", {}, { tags: ["pollo", "caliente"], description: "caldo dorado" }),
      makeDish(2, "Sopa de verduras", {}, { tags: ["verdura", "caliente"], description: "caldo ligero" }),
      makeDish(3, "Tarta de chocolate", {}, { tags: ["chocolate", "dulce"], description: "cacao intenso" }),
    ]);

    const vector = profile.buildUserVector([{ dishId: 1, weight: 1 }]);
    assert.ok(vector);
    assert.ok(
      profile.similarity(vector, 2) > profile.similarity(vector, 3),
      "el plato que comparte más términos debería ganar",
    );
  });

  it("maps positive and negative reactions to opposite weights", () => {
    const signals = TasteProfile.toSignals([
      { dishId: 1, action: "like" },
      { dishId: 2, action: "dislike" },
      { dishId: 3, action: "rate", rating: 5 },
      { dishId: 4, action: "view" },
    ]);
    assert.equal(signals.length, 3);
    assert.ok(signals.find((s) => s.dishId === 1)!.weight > 0);
    assert.ok(signals.find((s) => s.dishId === 2)!.weight < 0);
  });
});

describe("diversification (MMR)", () => {
  it("picks the different option when it scores nearly as high", () => {
    // Four near-identical comfort dishes plus one that is genuinely different
    // but only slightly behind. Raw ranking would return the cluster.
    const pool = [
      { dish: makeDish(1, "a", { comfort: 0.95, richness: 0.9 }), breakdown: makeBreakdown(0.9) },
      { dish: makeDish(2, "b", { comfort: 0.93, richness: 0.88 }), breakdown: makeBreakdown(0.88) },
      { dish: makeDish(3, "c", { comfort: 0.91, richness: 0.86 }), breakdown: makeBreakdown(0.86) },
      { dish: makeDish(4, "d", { freshness: 0.95, lightness: 0.9, comfort: 0.1 }), breakdown: makeBreakdown(0.84) },
    ];
    const raw = [...pool].sort((x, y) => y.breakdown.total - x.breakdown.total).slice(0, 2).map((i) => i.dish.id);
    assert.deepEqual(raw, [1, 2], "el ranking crudo elige el clump");

    const picked = diversify(pool, 3).map((item) => item.dish.id);
    assert.equal(picked.length, 3);
    assert.ok(picked.includes(4), `MMR debía meter la opción distinta, obtuve ${picked}`);
  });

  it("keeps the best dish first no matter how similar the rest are", () => {
    const pool = [
      { dish: makeDish(1, "a", { comfort: 0.95 }), breakdown: makeBreakdown(0.95) },
      { dish: makeDish(2, "b", { comfort: 0.94 }), breakdown: makeBreakdown(0.5) },
    ];
    assert.equal(diversify(pool, 2)[0].dish.id, 1);
  });

  it("returns everything untouched when the pool is smaller than the limit", () => {
    const pool = [{ dish: makeDish(1, "a"), breakdown: makeBreakdown(0.5) }];
    assert.equal(diversify(pool, 5).length, 1);
  });
});

describe("narrative", () => {
  it("mentions the mood and the top pick in Spanish", () => {
    const mood = { key: "tired", label: "Cansado", emoji: "😴", description: "", accent: "", sortOrder: 1, id: 1 };
    const text = composeLocalNarrative({
      mood: mood as Mood,
      items: [{
        dish: makeDish(1, "Ramen de miso"),
        score: 0.9,
        breakdown: makeBreakdown(0.9),
        explanation: "Porque se siente como un abrazo. 8 min · 480 kcal · Snack.",
        aiSource: "local-model",
        modelVersion: "test",
      }],
      request: { moodKey: "tired", freeText: "algo calientito" },
      alternatives: [{ dish: { nameEs: "Sopa de tomate" }, reason: "" }],
    });

    assert.match(text, /abrazo/);
    assert.match(text, /algo calientito/);
    assert.match(text, /sopa de tomate/);
    assert.match(text, /Ramen de miso/);
    assert.ok(!/\s\./.test(text), "no debe haber espacios antes de un punto");
    assert.ok(!/\.\s+\S/.test(text.slice(0, 1)), "no debe empezar con un punto suelto");
  });
});

describe("natural-language intent", () => {
  it("reads a negation of spice as a hard constraint", () => {
    const intent = extractIntent("no quiero nada picante");
    assert.equal(intent.maxSpiceLevel, 0.2);
    assert.ok(intent.signals.includes("sin picante"));
  });

  it("is not fooled by the word 'quiero' inside a negation", () => {
    const intent = extractIntent("no quiero nada picante");
    assert.notEqual(intent.maxSpiceLevel, null);
  });

  it("handles accented and unaccented spellings the same", () => {
    const withAccent = extractIntent("muy rápido por favor");
    const without = extractIntent("muy rapido por favor");
    assert.equal(withAccent.maxPrepMinutes, 20);
    assert.equal(without.maxPrepMinutes, 20);
  });

  it("extracts diet, price and lightness from one sentence", () => {
    const intent = extractIntent("algo vegano, barato y ligero");
    assert.equal(intent.diet, "vegan");
    assert.equal(intent.maxPriceLevel, 1);
    assert.equal(intent.minLightness, 0.6);
  });

  it("treats a plain wish as no constraint at all", () => {
    const intent = extractIntent("algo con pollo");
    assert.equal(hasHardConstraints(intent), false);
  });

  it("returns an empty intent for empty input", () => {
    assert.equal(hasHardConstraints(extractIntent(null)), false);
    assert.equal(hasHardConstraints(extractIntent("   ")), false);
  });
});

describe("health filters", () => {
  it("merges saved profile and per-request conditions without duplicates", () => {
    const merged = conditionsOf(
      { ...EMPTY_HEALTH_PROFILE, diabetes: true },
      ["diabetes" as const, "celiac" as const],
    );
    assert.deepEqual(merged.sort(), ["celiac", "diabetes"]);
  });

  it("blocks a dessert for someone with diabetes", () => {
    modelStore.ensureReady();
    const dishes = listDishes();
    const cocoa = dishes.find((dish) => dish.slug === "hot-chocolate-cinnamon")!;
    const tiramisu = dishes.find((dish) => dish.slug === "tiramisu-in-a-jar")!;

    // 26 g of sugar per serving is over the hard ceiling, so it is excluded.
    assert.ok(cocoa.nutrition.sugarGrams > HEALTH_LIMITS.sugarBlockGrams);
    assert.ok(evaluateDish(cocoa, ["diabetes"], 2000).blockingReason !== null);

    // 19 g is a warning rather than an exclusion: sometimes you want the tiramisu.
    const verdict = evaluateDish(tiramisu, ["diabetes"], 2000);
    assert.equal(verdict.blockingReason, null);
    assert.ok(
      verdict.warnings.some((warning) => warning.includes("azúcar")),
      "un tiramisú debe avisar, no desaparecer",
    );
  });

  it("blocks a dessert with more fat than the cholesterol limit", () => {
    modelStore.ensureReady();
    const brownie = listDishes().find((dish) => dish.slug === "brownie-salted-caramel")!;
    const verdict = evaluateDish(brownie, ["high_cholesterol"], 2000);
    assert.ok(
      verdict.blockingReason !== null || verdict.warnings.length > 0,
      "un postre con tanta grasa debe avisar o bloquear",
    );
  });

  it("lets a diabetic eat a low sugar high fibre bowl without complaint", () => {
    modelStore.ensureReady();
    const bowl = listDishes().find((dish) => dish.slug === "chia-pudding-berries")!;
    const verdict = evaluateDish(bowl, ["diabetes"], 2000);
    assert.equal(verdict.blockingReason, null);
  });

  it("removes gluten for celiac and lactose for intolerance", () => {
    modelStore.ensureReady();
    const dishes = listDishes();

    const celiac = rankDishes(
      buildContext(dishes, findMood("happy")!, { moodKey: "happy", conditions: ["celiac"] }),
    );
    assert.ok(celiac.length > 0);
    assert.ok(celiac.every((item) => !item.dish.containsGluten));

    const lactose = rankDishes(
      buildContext(dishes, findMood("happy")!, {
        moodKey: "happy",
        conditions: ["lactose_intolerance"],
      }),
    );
    assert.ok(lactose.length > 0);
    assert.ok(
      lactose.every((item) =>
        !item.dish.ingredients.some((ingredient) =>
          ["leche", "mantequilla", "parmesano", "mozzarella", "mascarpone", "feta", "crema de leche", "yogur griego"].includes(
            ingredient.label.toLowerCase(),
          ),
        ),
      ),
      "no debe quedar nada con lactosa",
    );
  });

  it("flags a high sodium dish for hypertension but not a light salad", () => {
    modelStore.ensureReady();
    const dishes = listDishes();
    const ramen = dishes.find((dish) => dish.slug === "instant-miso-ramen")!;

    assert.ok(ramen.nutrition.sodiumMg > HEALTH_LIMITS.sodiumBlockMg);
    assert.ok(
      evaluateDish(ramen, ["hypertension"], 2000).blockingReason !== null,
      "el ramen no debería aparecer para alguien con hipertensión",
    );

    const light = dishes.find((dish) => dish.slug === "chia-pudding-berries")!;
    assert.ok(light.nutrition.sodiumMg < HEALTH_LIMITS.sodiumWarningMg);
    assert.equal(evaluateDish(light, ["hypertension"], 2000).blockingReason, null);
  });

  it("asks about health only when the shortlist is risky and nothing is known", () => {
    modelStore.ensureReady();
    const dishes = listDishes();
    const risky = dishes.filter((dish) => dish.nutrition.sugarGrams > 15).slice(0, 3);
    const light = dishes.filter((dish) => dish.nutrition.sugarGrams < 5).slice(0, 3);

    assert.equal(shouldAskAboutHealth(risky, [], false), true);
    assert.equal(shouldAskAboutHealth(light, [], false), false);
    // Once the user has answered, or already has a condition, we stop asking.
    assert.equal(shouldAskAboutHealth(risky, [], true), false);
    assert.equal(shouldAskAboutHealth(risky, ["diabetes"], false), false);
  });
});

describe("recipes and nutrition", () => {
  it("has a recipe for every dish, with steps and no empty tip text", () => {
    modelStore.ensureReady();
    const dishes = listDishes();
    assert.equal(dishes.length, 40);

    for (const dish of dishes) {
      assert.ok(dish.steps.length >= 2, `${dish.nameEs} no tiene pasos suficientes`);
      assert.ok(dish.servings >= 1, `${dish.nameEs} no declara porciones`);
      assert.ok(dish.ingredients.length > 0, `${dish.nameEs} no tiene ingredientes`);
      assert.ok(dish.chefTip !== null && dish.chefTip.length > 10, `${dish.nameEs} sin consejo`);
      for (const step of dish.steps) {
        assert.ok(/[.!?]$/.test(step.trim()), `paso sin cierre en ${dish.nameEs}: ${step}`);
      }
    }
  });

  it("keeps nutrition per serving inside sane ranges", () => {
    modelStore.ensureReady();
    for (const dish of listDishes()) {
      assert.ok(dish.nutrition.sugarGrams >= 0, `${dish.nameEs} azúcar negativo`);
      assert.ok(
        dish.nutrition.sugarGrams <= 40,
        `${dish.nameEs} tiene ${dish.nutrition.sugarGrams} g de azúcar por porción, revisa la receta`,
      );
      assert.ok(dish.nutrition.fiberGrams >= 0);
      assert.ok(dish.nutrition.sodiumMg >= 0);
    }
  });
});

describe("end-to-end ranking against the real database", () => {
  it("respects diet filters", () => {
    modelStore.ensureReady();
    const dishes = listDishes();
    const mood = findMood("happy")!;
    const ranked = rankDishes(buildContext(dishes, mood, { moodKey: "happy", diet: "vegan", limit: 10 }));
    assert.ok(ranked.length > 0);
    assert.ok(ranked.every((item) => item.dish.isVegan));
  });

  it("excludes dishes over the requested prep time when nothing better exists", () => {
    modelStore.ensureReady();
    const dishes = listDishes();
    const mood = findMood("in_a_hurry")!;
    const ranked = rankDishes(buildContext(dishes, mood, { moodKey: "in_a_hurry", maxPrepMinutes: 10 }));
    const topIds = ranked.slice(0, 5).map((item) => item.dish.id);
    for (const id of topIds) {
      const dish = dishes.find((candidate) => candidate.id === id)!;
      assert.ok(dish.prepMinutes <= 10, `${dish.nameEs} tarda ${dish.prepMinutes} min`);
    }
  });

  it("produces a different ranking for each mood", () => {
    modelStore.ensureReady();
    const dishes = listDishes();
    const orderOf = (key: "tired" | "stressed" | "no_energy" | "in_a_hurry") =>
      diversify(
        rankDishes(buildContext(dishes, findMood(key)!, { moodKey: key, limit: 5 })),
        5,
      ).map((item) => item.dish.id);

    const tired = orderOf("tired");
    const stressed = orderOf("stressed");
    const noEnergy = orderOf("no_energy");
    const hurry = orderOf("in_a_hurry");

    const overlaps = (a: number[], b: number[]): number =>
      a.filter((id) => b.includes(id)).length;

    assert.notDeepEqual(tired, stressed);
    assert.notDeepEqual(noEnergy, hurry);
    // "tired" and "stressed" both chase comfort, so some overlap is expected,
    // but a quick-meal mood must barely overlap with either of them.
    assert.ok(overlaps(hurry, tired) <= 2, `rápido vs cansado se solaparon en ${overlaps(hurry, tired)}`);
    assert.ok(overlaps(noEnergy, stressed) <= 2, `sin energía vs estresado se solaparon en ${overlaps(noEnergy, stressed)}`);
  });

  it("boosts dishes that match a written note", () => {
    modelStore.ensureReady();
    const dishes = listDishes();
    const mood = findMood("no_energy")!;
    const withoutNote = rankDishes(buildContext(dishes, mood, { moodKey: "no_energy" }));
    const withNote = rankDishes(
      buildContext(dishes, mood, { moodKey: "no_energy", freeText: "sopa caliente de pollo" }),
    );
    // A note is the most explicit signal there is, so it must reorder results.
    assert.notDeepEqual(
      withNote.slice(0, 8).map((item) => item.dish.id),
      withoutNote.slice(0, 8).map((item) => item.dish.id),
    );
  });

  it("honours a negation typed in free text", () => {
    modelStore.ensureReady();
    const dishes = listDishes();
    const mood = findMood("happy")!;
    const ranked = rankDishes(
      buildContext(dishes, mood, { moodKey: "happy", freeText: "no quiero nada picante" }),
    );
    assert.ok(ranked.length > 0);
    for (const item of ranked.slice(0, 5)) {
      assert.ok(item.dish.axes.spice <= 0.2, `${item.dish.nameEs} sigue picante`);
    }
  });

  it("only returns vegan dishes when the note says vegano", () => {
    modelStore.ensureReady();
    const dishes = listDishes();
    const mood = findMood("happy")!;
    const ranked = rankDishes(
      buildContext(dishes, mood, { moodKey: "happy", freeText: "vegano por favor" }),
    );
    assert.ok(ranked.length > 0);
    for (const item of ranked.slice(0, 5)) {
      assert.ok(item.dish.isVegan, `${item.dish.nameEs} no es vegano`);
    }
  });

  it("lets an explicit mood override a learned taste that points elsewhere", () => {
    modelStore.ensureReady();
    const dishes = listDishes();

    // Lucía is a heavy comfort-food eater. Asking for "sad" must still surface
    // something sweet, not the pasta and ramen she already loves.
    const sad = diversify(
      rankDishes(buildContext(dishes, findMood("sad")!, { moodKey: "sad" })),
      4,
    );

    const sweetest = Math.max(...sad.map((item) => item.dish.axes.sweetness));
    assert.ok(
      sweetest >= 0.6,
      `se esperaba algo claramente dulce para el ánimo triste, el más dulce fue ${sweetest}`,
    );
    assert.ok(
      sad[0].dish.axes.sweetness >= 0.5,
      `el primerplatillo debe ser dulce, llegó ${sad[0].dish.nameEs} (${sad[0].dish.axes.sweetness})`,
    );
  });

  it("only returns Spanish explanations for every item", () => {
    modelStore.ensureReady();
    const dishes = listDishes();
    const mood = findMood("happy")!;
    const ranked = rankDishes(buildContext(dishes, mood, { moodKey: "happy", limit: 6 }));
    for (const item of ranked.slice(0, 6)) {
      assert.ok(item.breakdown.total > 0);
      assert.ok(item.breakdown.topReasons.length > 0);
    }
  });
});

function buildContext(
  dishes: Dish[],
  mood: Mood,
  request: Parameters<typeof rankDishes>[0]["request"],
): RecommenderContext {
  return {
    dishes,
    mood,
    interactions: listInteractions(),
    user: request.userId ? findUserById(request.userId) : null,
    request,
    moodModel: modelStore.moodModel,
    tasteProfile: modelStore.tasteProfile,
    collaborative: modelStore.collaborative,
  };
}

process.on("exit", () => closeDb());
