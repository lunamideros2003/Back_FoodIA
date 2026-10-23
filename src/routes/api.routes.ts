import { Router } from "express";
import { z } from "zod";
import { asyncRoute, HttpError } from "../middleware/error.ts";
import { getDb } from "../db/connection.ts";
import { recommend } from "../services/recommendationService.ts";
import { createUser, getUser, updatePreferences, getAllUsers } from "../services/userService.ts";
import {
  getInteractionHistory,
  recordInteraction,
  summarizeTaste,
} from "../services/interactionService.ts";
import { listRecentSessions } from "../services/recommendationService.ts";
import { computeBalance, logConsumed } from "../services/balanceService.ts";
import {
  CONDITION_LABELS,
  conditionsOf,
  evaluateDish,
  HEALTH_QUESTION,
} from "../ai/health.ts";
import {
  findDishBySlug,
  findMood,
  listDishes,
  listInteractions,
  listMoods,
} from "../services/repositories.ts";
import { modelStore } from "../services/modelStore.ts";
import { env } from "../config/env.ts";
import { allergensOf, ALLERGEN_LABELS_ES } from "../ai/allergens.ts";
import { GENERAL_SAFETY_NOTE, safetyNotesForDish } from "../ai/safety.ts";
import { findSubstitutionsFor } from "../db/seed/dietary.ts";
import type { Dish, MoodKey } from "../domain/types.ts";

export const router = Router();

const MOOD_KEYS = ["tired", "happy", "stressed", "sad", "no_energy", "in_a_hurry"] as const;
const ACTIONS = ["impression", "view", "like", "save", "cook", "eat", "rate", "dislike"] as const;
const DIETS = ["omnivore", "vegetarian", "vegan", "pescatarian"] as const;
const CONDITIONS = [
  "diabetes",
  "hypertension",
  "celiac",
  "lactose_intolerance",
  "high_cholesterol",
] as const;

const conditionList = z.array(z.enum(CONDITIONS)).max(CONDITIONS.length).optional();
const ingredientList = z.array(z.string().max(40)).max(20).optional();

const MOOD_OPTION_KEYS = [
  "energized",
  "low",
  "stressed_tired",
  "bored",
  "calm",
  "celebrating",
] as const;
const TIME_BUDGET_KEYS = ["under_10", "between_10_30", "plenty"] as const;
const CRAVING_KEYS = ["sweet", "savory", "light", "comfort", "surprise"] as const;

const recommendationSchema = z.object({
  moodKey: z.enum(MOOD_KEYS),
  userId: z.number().int().positive().optional(),
  limit: z.number().int().min(1).max(12).optional(),
  freeText: z.string().max(240).optional(),
  excludeDishIds: z.array(z.number().int().positive()).max(50).optional(),
  maxPrepMinutes: z.number().int().min(1).max(240).optional(),
  diet: z.enum(DIETS).optional(),
  conditions: conditionList,
  /** The plain-language answers of the wizard, when the request comes from it. */
  moodOption: z.enum(MOOD_OPTION_KEYS).optional(),
  timeBudget: z.enum(TIME_BUDGET_KEYS).optional(),
  craving: z.enum(CRAVING_KEYS).optional(),
  availableIngredients: ingredientList,
  excludedIngredients: ingredientList,
  allergies: ingredientList,
  difficulty: z.enum(["facil", "media", "avanzada"]).optional(),
});

const interactionSchema = z.object({
  userId: z.number().int().positive(),
  dishId: z.number().int().positive(),
  moodKey: z.enum(MOOD_KEYS).nullish(),
  action: z.enum(ACTIONS),
  rating: z.number().min(1).max(5).nullish(),
});

const balanceSchema = z.object({
  userId: z.number().int().positive(),
  moodKey: z.enum(MOOD_KEYS).optional(),
  justChosenDishId: z.number().int().positive().nullish(),
  /** How many portions of the chosen dish are being eaten. */
  servingsEaten: z.number().min(0.5).max(6).optional(),
  conditions: conditionList,
});

const healthProfileSchema = z.object({
  diabetes: z.boolean(),
  hypertension: z.boolean(),
  celiac: z.boolean(),
  lactoseIntolerance: z.boolean(),
  highCholesterol: z.boolean(),
  /** False means "prefiero no decir", which also stops the questions. */
  answered: z.boolean().default(true),
});

const preferencesSchema = z.object({
  diet: z.enum(DIETS).optional(),
  maxPrepMinutes: z.number().int().min(1).max(240).nullish(),
  maxSpiceLevel: z.number().min(0).max(1).optional(),
  maxPriceLevel: z.number().int().min(1).max(3).optional(),
  allergies: z.array(z.string().max(40)).max(20).optional(),
  dislikedIngredients: z.array(z.string().max(40)).max(20).optional(),
  dailyCalorieGoal: z.number().int().min(800).max(5000).optional(),
  health: healthProfileSchema
    .optional()
    .transform((value) =>
      value
        ? {
            diabetes: value.diabetes,
            hypertension: value.hypertension,
            celiac: value.celiac,
            lactoseIntolerance: value.lactoseIntolerance,
            highCholesterol: value.highCholesterol,
            answeredAt: value.answered ? new Date().toISOString() : null,
          }
        : undefined,
    ),
});

const createUserSchema = z.object({
  email: z.string().email(),
  displayName: z.string().min(2).max(40),
  preferences: preferencesSchema.optional(),
});

/* ------------------------------------------------------------------ *
 * System
 * ------------------------------------------------------------------ */

router.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "foodmood-ia-backend",
    version: modelStore.version,
    aiProvider: env.ai.provider,
    catalogue: {
      dishes: listDishes().length,
      moods: listMoods().length,
    },
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

router.get("/ai/stats", (_req, res) => {
  res.json(modelStore.stats());
});

router.post("/ai/retrain", (_req, res) => {
  modelStore.retrain();
  res.json({ message: "Modelos reentrenados", stats: modelStore.stats() });
});

/* ------------------------------------------------------------------ *
 * Catalogue
 * ------------------------------------------------------------------ */

router.get("/moods", (_req, res) => {
  res.json({ items: listMoods() });
});

router.get("/categories", (_req, res) => {
  const counts = new Map<string, number>();
  for (const dish of listDishes()) {
    counts.set(dish.category, (counts.get(dish.category) ?? 0) + 1);
  }
  res.json({
    items: [...counts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name, "es")),
  });
});

const dishQuerySchema = z.object({
  category: z.string().max(40).optional(),
  q: z.string().max(80).optional(),
  maxPrepMinutes: z.coerce.number().int().min(1).max(240).optional(),
  diet: z.enum(DIETS).optional(),
  difficulty: z.enum(["facil", "media", "avanzada"]).optional(),
  maxCalories: z.coerce.number().int().min(50).max(2000).optional(),
  excludeAllergen: z.string().max(30).optional(),
  sort: z.enum(["prep", "calories", "name"]).optional(),
  offset: z.coerce.number().int().min(0).max(1000).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

function matchesDiet(dish: Dish, diet: (typeof DIETS)[number] | undefined): boolean {
  if (!diet || diet === "omnivore") return true;
  if (diet === "vegetarian") return dish.isVegetarian;
  if (diet === "vegan") return dish.isVegan;
  const fish = ["salmón", "salmon", "atún", "camarón"];
  return (
    dish.isVegetarian ||
    dish.ingredients.some((item) =>
      fish.some((marker) => item.label.toLowerCase().includes(marker)),
    )
  );
}

router.get("/dishes", (req, res) => {
  const query = dishQuerySchema.parse(req.query);
  const needle = query.q?.toLowerCase().trim();

  let items = listDishes();

  if (query.category) {
    items = items.filter((dish) => dish.category === query.category);
  }
  if (needle) {
    items = items.filter((dish) =>
      [dish.name, dish.nameEs, dish.description, ...dish.tags]
        .join(" ")
        .toLowerCase()
        .includes(needle),
    );
  }
  if (query.maxPrepMinutes) {
    items = items.filter((dish) => dish.prepMinutes <= query.maxPrepMinutes!);
  }
  if (query.diet) {
    items = items.filter((dish) => matchesDiet(dish, query.diet));
  }
  if (query.difficulty) {
    items = items.filter((dish) => dish.difficulty === query.difficulty);
  }
  if (query.maxCalories) {
    items = items.filter((dish) => dish.calories <= query.maxCalories!);
  }
  if (query.excludeAllergen) {
    const allergen = query.excludeAllergen.toLowerCase().trim();
    items = items.filter(
      (dish) => !allergensOf(dish).some((item) => item.toLowerCase().includes(allergen)),
    );
  }

  if (query.sort === "prep") {
    items = [...items].sort((a, b) => a.prepMinutes - b.prepMinutes);
  } else if (query.sort === "calories") {
    items = [...items].sort((a, b) => a.calories - b.calories);
  } else if (query.sort === "name") {
    items = [...items].sort((a, b) => a.nameEs.localeCompare(b.nameEs, "es"));
  }

  const total = items.length;
  const offset = query.offset ?? 0;
  if (offset > 0) items = items.slice(offset);
  if (query.limit) items = items.slice(0, query.limit);

  res.json({
    total,
    offset,
    limit: query.limit ?? null,
    count: items.length,
    items,
  });
});

/** The counts the explore screen needs to build its filters without guessing. */
router.get("/catalog/facets", (_req, res) => {
  const dishes = listDishes();

  const tally = <T extends string>(values: T[]): { key: T; count: number }[] => {
    const counts = new Map<T, number>();
    for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
    return [...counts.entries()]
      .map(([key, count]) => ({ key, count }))
      .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key, "es"));
  };

  res.json({
    total: dishes.length,
    categories: tally(dishes.map((dish) => dish.category)),
    difficulties: tally(dishes.map((dish) => dish.difficulty)),
    diets: {
      vegetarian: dishes.filter((dish) => dish.isVegetarian).length,
      vegan: dishes.filter((dish) => dish.isVegan).length,
    },
    prepBuckets: [
      { key: "under_10", label: "10 minutos o menos", maxMinutes: 10 },
      { key: "under_20", label: "20 minutos o menos", maxMinutes: 20 },
      { key: "under_30", label: "30 minutos o menos", maxMinutes: 30 },
      { key: "more_than_30", label: "Más de 30 minutos", maxMinutes: null },
    ].map((bucket) => ({
      ...bucket,
      count: dishes.filter((dish) =>
        bucket.maxMinutes === null
          ? dish.prepMinutes > 30
          : dish.prepMinutes <= bucket.maxMinutes,
      ).length,
    })),
    allergens: tally(dishes.flatMap((dish) => allergensOf(dish))),
  });
});

router.get("/dishes/:slug", (req, res) => {
  const dish = findDishBySlug(req.params.slug);
  if (!dish) throw new HttpError(404, "No encontramos ese plato.");

  // Everything the recipe page needs to be honest in one response: what it
  // contains, what to be careful about and which ingredients can be replaced.
  const allergens = allergensOf(dish).map((allergen) => ({
    key: allergen,
    label: ALLERGEN_LABELS_ES[allergen] ?? allergen,
  }));
  const substitutions = [
    ...new Map(
      dish.ingredients
        .flatMap((item) => findSubstitutionsFor(item.label))
        .map((option) => [`${option.original}|${option.replacement}`, option]),
    ).values(),
  ];

  res.json({
    dish,
    similar: findSimilar(dish, 5),
    allergens,
    safetyNotes: safetyNotesForDish(dish),
    generalSafetyNote: GENERAL_SAFETY_NOTE,
    substitutions,
  });
});

/**
 * Similar dishes come from collaborative filtering when there is enough
 * co-click evidence, and fall back to flavour-profile similarity otherwise so
 * the UI always has something to show.
 */
function findSimilar(dish: Dish, limit: number) {
  type SimilarEntry = {
    dish: Dish;
    similarity: number;
    supportedBy: number;
    strategy: "collaborative" | "content";
  };

  const dishes = listDishes();
  const collaborative: SimilarEntry[] = modelStore.collaborative
    .similarItems(dish.id, limit)
    .map((entry) => ({
      dish: dishes.find((candidate) => candidate.id === entry.dishId) as Dish,
      similarity: Number(entry.similarity.toFixed(3)),
      supportedBy: entry.supportedBy,
      strategy: "collaborative" as const,
    }))
    .filter((entry) => entry.dish !== undefined);

  if (collaborative.length >= limit) return collaborative;

  const byProfile = dishes
    .filter((candidate) => candidate.id !== dish.id)
    .map((candidate) => ({ candidate, similarity: profileSimilarity(dish, candidate) }))
    .sort((a, b) => b.similarity - a.similarity);

  const seen = new Set(collaborative.map((entry) => entry.dish.id));
  for (const { candidate, similarity } of byProfile) {
    if (collaborative.length >= limit) break;
    if (seen.has(candidate.id) || candidate.category !== dish.category) continue;
    seen.add(candidate.id);
    collaborative.push({
      dish: candidate,
      similarity: Number((similarity * 0.85).toFixed(3)),
      supportedBy: 0,
      strategy: "content",
    });
  }

  return collaborative;
}

function profileSimilarity(a: Dish, b: Dish): number {
  const keys: (keyof Dish["axes"])[] = [
    "comfort", "richness", "spice", "sweetness", "freshness", "lightness", "protein",
  ];
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (const key of keys) {
    dot += a.axes[key] * b.axes[key];
    normA += a.axes[key] ** 2;
    normB += b.axes[key] ** 2;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / Math.sqrt(normA * normB);
}

router.get("/dishes/:id/similar", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) throw new HttpError(400, "El id del plato no es válido.");

  const dishes = listDishes();
  const dish = dishes.find((candidate) => candidate.id === id);
  if (!dish) throw new HttpError(404, "No encontramos ese plato.");

  res.json({ items: findSimilar(dish, 6) });
});

/* ------------------------------------------------------------------ *
 * Users
 * ------------------------------------------------------------------ */

router.get("/users", (_req, res) => {
  res.json({ items: getAllUsers() });
});

router.post("/users", (req, res) => {
  const body = createUserSchema.parse(req.body);
  res.status(201).json(createUser(body));
});

router.get("/users/:id", (req, res) => {
  const user = getUser(Number(req.params.id));
  if (!user) throw new HttpError(404, "Usuario no encontrado.");
  res.json(user);
});

router.patch("/users/:id/preferences", (req, res) => {
  const id = Number(req.params.id);
  const patch = preferencesSchema.parse(req.body);
  const user = updatePreferences(id, patch);
  modelStore.retrain();
  res.json(user);
});

router.get("/users/:id/interactions", (req, res) => {
  const id = Number(req.params.id);
  if (!getUser(id)) throw new HttpError(404, "Usuario no encontrado.");
  const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 30)));
  res.json({ items: getInteractionHistory(id, limit) });
});

router.get("/users/:id/taste", (req, res) => {
  const id = Number(req.params.id);
  if (!getUser(id)) throw new HttpError(404, "Usuario no encontrado.");
  res.json(summarizeTaste(id));
});

router.get("/users/:id/sessions", (req, res) => {
  const id = Number(req.params.id);
  if (!getUser(id)) throw new HttpError(404, "Usuario no encontrado.");
  res.json({ items: listRecentSessions(id, 10) });
});

/* ------------------------------------------------------------------ *
 * Recommendations
 * ------------------------------------------------------------------ */

router.post(
  "/recommendations",
  asyncRoute(async (req, res) => {
    const body = recommendationSchema.parse(req.body);
    const response = await recommend({
      moodKey: body.moodKey,
      userId: body.userId,
      limit: body.limit,
      freeText: body.freeText,
      excludeDishIds: body.excludeDishIds,
      maxPrepMinutes: body.maxPrepMinutes,
      diet: body.diet,
      conditions: body.conditions,
      moodOption: body.moodOption,
      timeBudget: body.timeBudget,
      craving: body.craving,
      availableIngredients: body.availableIngredients,
      excludedIngredients: body.excludedIngredients,
      allergies: body.allergies,
      difficulty: body.difficulty,
    });

    if (body.userId && response.items[0]) {
      const top = response.items[0];
      try {
        getDb()
          .prepare(
            `INSERT INTO interactions (user_id, dish_id, mood_key, action)
             VALUES (?, ?, ?, 'impression')`,
          )
          .run(body.userId, top.dish.id, body.moodKey);
      } catch {
        // Impressions are best-effort telemetry.
      }
    }

    res.json(response);
  }),
);

/**
 * Second stage of the flow. The user picked a dish (often something sweet),
 * tells us they are eating it, and gets back what to have for the rest of the
 * day plus a gentler comfort option if the mood has not lifted.
 */
router.post("/balance", (req, res) => {
  const body = balanceSchema.parse(req.body);
  const user = getUser(body.userId);
  if (!user) throw new HttpError(404, "Usuario no encontrado.");

  const mood = body.moodKey ? findMood(body.moodKey) : null;
  if (body.moodKey && !mood) {
    throw new HttpError(400, "Estado de ánimo no encontrado.");
  }

  const balance = computeBalance({
    user,
    mood,
    justChosenDishId: body.justChosenDishId ?? null,
    servingsEaten: body.servingsEaten,
    conditions: body.conditions,
  });

  res.json(balance);
});

/** Preview the balance without committing anything, used on page load. */
router.get("/balance", (req, res) => {
  const userId = Number(req.query.userId);
  if (!getUser(userId)) throw new HttpError(404, "Usuario no encontrado.");

  const moodKey = req.query.moodKey as MoodKey | undefined;
  res.json(computeBalance({ user: getUser(userId), mood: moodKey ? findMood(moodKey) : null }));
});

/* ------------------------------------------------------------------ *
 * Health
 * ------------------------------------------------------------------ */

router.get("/health-conditions", (_req, res) => {
  res.json({
    items: CONDITIONS.map((key) => ({
      key,
      label: CONDITION_LABELS[key],
    })),
    question: HEALTH_QUESTION,
  });
});

router.put("/users/:id/health", (req, res) => {
  const id = Number(req.params.id);
  const body = healthProfileSchema.parse(req.body);
  if (!getUser(id)) throw new HttpError(404, "Usuario no encontrado.");

  const health = {
    diabetes: body.diabetes,
    hypertension: body.hypertension,
    celiac: body.celiac,
    lactoseIntolerance: body.lactoseIntolerance,
    highCholesterol: body.highCholesterol,
    answeredAt: body.answered ? new Date().toISOString() : null,
  };

  const updated = updatePreferences(id, { health });
  modelStore.retrain();
  res.json(updated);
});
/** Explains, per condition, exactly which dishes get filtered out. */
router.get("/users/:id/health-report", (req, res) => {
  const id = Number(req.params.id);
  const user = getUser(id);
  if (!user) throw new HttpError(404, "Usuario no encontrado.");

  const conditions = conditionsOf(user.preferences.health);
  const dishes = listDishes();
  const goal = user.preferences.dailyCalorieGoal;

  const blocked = dishes
    .map((dish) => ({ dish, verdict: evaluateDish(dish, conditions, goal) }))
    .filter((entry) => entry.verdict.blockingReason !== null)
    .map((entry) => ({
      dishId: entry.dish.id,
      nameEs: entry.dish.nameEs,
      reason: entry.verdict.blockingReason,
    }));

  const warned = dishes
    .map((dish) => ({ dish, verdict: evaluateDish(dish, conditions, goal) }))
    .filter((entry) => entry.verdict.blockingReason === null && entry.verdict.warnings.length > 0)
    .map((entry) => ({
      dishId: entry.dish.id,
      nameEs: entry.dish.nameEs,
      warnings: entry.verdict.warnings,
    }));

  res.json({
    conditions,
    answered: Boolean(user.preferences.health.answeredAt),
    dailyCalorieGoal: goal,
    availableDishes: dishes.length - blocked.length,
    blocked,
    warned: warned.slice(0, 10),
  });
});

router.get("/interactions", (req, res) => {
  const userId = req.query.userId ? Number(req.query.userId) : undefined;
  const limit = Math.min(200, Math.max(1, Number(req.query.limit ?? 50)));
  res.json({ items: listInteractions({ userId, limit }) });
});

router.post("/interactions", (req, res) => {
  const body = interactionSchema.parse(req.body);
  if (!getUser(body.userId)) throw new HttpError(404, "Usuario no encontrado.");
  const created = recordInteraction(body);
  res.status(201).json(created);
});

/** Marks a dish as eaten, which feeds the nutritional balance step. */
router.post("/users/:id/consumed", (req, res) => {
  const id = Number(req.params.id);
  if (!getUser(id)) throw new HttpError(404, "Usuario no encontrado.");

  const body = z
    .object({ dishId: z.number().int().positive(), moodKey: z.enum(MOOD_KEYS).nullish() })
    .parse(req.body);

  if (!listDishes().some((dish) => dish.id === body.dishId)) {
    throw new HttpError(404, "El plato no existe.");
  }

  logConsumed(id, body.dishId, body.moodKey);
  res.status(201).json({ ok: true, dishId: body.dishId });
});

router.get("/moods/:key/summary", (req, res) => {
  const key = req.params.key as MoodKey;
  const mood = findMood(key);
  if (!mood) throw new HttpError(404, "Estado de ánimo no encontrado.");

  modelStore.ensureReady();
  res.json({
    mood,
    learnedTarget: modelStore.moodModel.learnedTarget(key),
    learnedImportance: modelStore.moodModel.learnedImportance(key),
  });
});
