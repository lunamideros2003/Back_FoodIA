import { getDb } from "../db/connection.ts";
import { buildReason } from "../ai/recommender.ts";
import { diversify, MODEL_VERSION, rankDishes, STRATEGY, type RecommenderContext } from "../ai/recommender.ts";
import type {
  BalanceResponse,
  ConsumedDish,
  Dish,
  HealthCondition,
  Mood,
  MoodKey,
  RecommendedDish,
  User,
} from "../domain/types.ts";
import { listDishes, listInteractions } from "./repositories.ts";
import { modelStore } from "./modelStore.ts";

/**
 * Nutritional balance step.
 *
 * The mood step answers "what do I want to eat". This one answers "I already
 * ate a dessert, what should I have for the rest of the day instead". It reads
 * what the user actually logged as eaten, sums the energy, and ranks the
 * lightest safe options for the remaining budget.
 */

/** Anything logged as eaten today counts toward the budget. */
const CONSUMED_ACTIONS = new Set(["cook", "eat"]);

/**
 * Reference intake for free sugars. The WHO suggests keeping added sugars
 * under 10% of daily energy, which for a 2000 kcal day is roughly 50 g. Eating
 * one dessert can eat most of it, which is the point of this step.
 */
const DAILY_SUGAR_REFERENCE_G = 50;

/**
 * Severity is driven by the worst of the two loads, not just calories. A
 * 450 kcal dessert is unremarkable as energy but extreme as sugar, and the
 * advice the user needs is different.
 */
const SEVERITY_BANDS = {
  watch: 0.45,
  high: 0.7,
  over: 1,
} as const;

/** Moods where an extra warm option is worth offering even with energy to spare. */
const LOW_MOODS = new Set<MoodKey>(["sad", "tired", "stressed"]);

export interface BalanceInput {
  user: User | null;
  mood: Mood | null;
  /** Dish the user just committed to, added on top of the logged history. */
  justChosenDishId?: number | null;
  /** How many portions of that dish they are about to eat. */
  servingsEaten?: number;
  conditions?: HealthCondition[];
}

export function computeBalance(input: BalanceInput): BalanceResponse {
  modelStore.ensureReady();

  const dishes = listDishes();
  const dishById = new Map(dishes.map((dish) => [dish.id, dish]));
  const goal = input.user?.preferences.dailyCalorieGoal ?? 2000;

  const today = new Date().toISOString().slice(0, 10);
  const logged = input.user
    ? listInteractions({ userId: input.user.id, limit: 200 }).filter(
        (interaction) =>
          CONSUMED_ACTIONS.has(interaction.action) &&
          (interaction.createdAt.startsWith(today) ||
            new Date(interaction.createdAt.replace(" ", "T") + "Z")
              .toISOString()
              .slice(0, 10) === today),
      )
    : [];

  const consumed: ConsumedDish[] = [];
  const eatenServings = new Map<number, number>();

  const push = (dish: Dish, eatenAt: string, portions = 1): void => {
    const already = eatenServings.get(dish.id) ?? 0;
    eatenServings.set(dish.id, already + portions);

    const servings = already + portions;
    consumed.push({
      dishId: dish.id,
      nameEs: dish.nameEs,
      servings,
      calories: Math.round(dish.calories * servings),
      sugarGrams: round(dish.nutrition.sugarGrams * servings, 1),
      eatenAt,
    });
  };

  for (const interaction of logged) {
    const dish = dishById.get(interaction.dishId);
    if (dish) push(dish, interaction.createdAt, interaction.servings);
  }

  const justChosen = input.justChosenDishId ? dishById.get(input.justChosenDishId) : null;
  const portions = Math.min(6, Math.max(1, input.servingsEaten ?? 1));
  if (justChosen) push(justChosen, new Date().toISOString(), portions);

  const totals = {
    calories: consumed.reduce((sum, item) => sum + item.calories, 0),
    sugarGrams: round(consumed.reduce((sum, item) => sum + item.sugarGrams, 0), 1),
    proteinGrams: round(
      consumed.reduce((sum, item) => sum + (dishById.get(item.dishId)?.proteinGrams ?? 0), 0),
      1,
    ),
    fiberGrams: round(
      consumed.reduce((sum, item) => sum + (dishById.get(item.dishId)?.nutrition.fiberGrams ?? 0), 0),
      1,
    ),
    goalCalories: goal,
  };

  const calorieProgress = goal > 0 ? totals.calories / goal : 0;
  const sugarProgress = totals.sugarGrams / DAILY_SUGAR_REFERENCE_G;
  const load = Math.max(calorieProgress, sugarProgress);

  const severity =
    load > SEVERITY_BANDS.over
      ? "over"
      : load > SEVERITY_BANDS.high
        ? "high"
        : load > SEVERITY_BANDS.watch
          ? "watch"
          : "ok";

  const { headline, message } = composeMessage(
    severity,
    calorieProgress,
    sugarProgress,
    totals,
    justChosen ?? null,
  );

  const mood = input.mood ?? fallbackMood(dishes);
  const request = {
    moodKey: mood.key,
    userId: input.user?.id,
    limit: 3,
  } as const;

  const eatenIds = [...eatenServings.keys()];

  const context: RecommenderContext = {
    dishes,
    mood,
    interactions: listInteractions(),
    user: input.user,
    request: { ...request, excludeDishIds: eatenIds },
    moodModel: modelStore.moodModel,
    tasteProfile: modelStore.tasteProfile,
    collaborative: modelStore.collaborative,
  };

  const ranked = rankDishes(context, {
    lightMode: true,
    excludeIds: eatenIds,
    conditions: input.conditions,
    dailyCalorieGoal: goal,
  });

  const suggestions: RecommendedDish[] = diversify(ranked, 3).map((item) => ({
    dish: item.dish,
    score: item.breakdown.total,
    breakdown: item.breakdown,
    explanation: lightReason(item.dish, item.breakdown.healthFit, totals.calories, goal),
    aiSource: "local-model",
    modelVersion: MODEL_VERSION,
  }));

  // When the mood is still low, a purely salad-like answer can feel punishing.
  // Offer one warm, light comfort option alongside the healthy ones.
  const wantsComfort = severity !== "ok" || LOW_MOODS.has(mood.key);
  const comfortCandidate = wantsComfort
    ? diversify(
        ranked.filter(
          (item) => item.dish.axes.warmth >= 0.6 && item.dish.calories <= goal * 0.28,
        ),
        1,
      )[0]
    : undefined;

  const comfortOption: RecommendedDish | null = comfortCandidate
    ? {
        dish: comfortCandidate.dish,
        score: comfortCandidate.breakdown.total,
        breakdown: comfortCandidate.breakdown,
        explanation: `Si sigues con el ánimo bajo, este te abraza sin pasarte: ${comfortCandidate.dish.calories} kcal y ${comfortCandidate.dish.nutrition.sugarGrams} g de azúcar.`,
        aiSource: "local-model",
        modelVersion: MODEL_VERSION,
      }
    : null;

  return {
    consumed,
    totals,
    calorieProgress: round(calorieProgress, 3),
    severity,
    headline,
    message,
    suggestions,
    comfortOption,
  };
}

function lightReason(dish: Dish, healthFit: number, eaten: number, goal: number): string {
  const remaining = Math.max(0, goal - eaten);
  const parts: string[] = [];

  parts.push(`solo ${dish.calories} kcal`);
  if (dish.nutrition.fiberGrams >= 6) parts.push(`${dish.nutrition.fiberGrams} g de fibra`);
  if (dish.proteinGrams >= 20) parts.push(`${dish.proteinGrams} g de proteína`);
  if (dish.nutrition.sugarGrams <= 12) parts.push(`poquito azúcar (${dish.nutrition.sugarGrams} g)`);
  if (healthFit >= 0.85) parts.push("y seguro para tu perfil de salud");

  return `${parts.join(", ")}. Te quedan unas ${Math.round(remaining)} kcal de margen hoy.`;
}

function composeMessage(
  severity: BalanceResponse["severity"],
  calorieProgress: number,
  sugarProgress: number,
  totals: BalanceResponse["totals"],
  justChosen: Dish | null,
): { headline: string; message: string } {
  const percent = Math.round(calorieProgress * 100);
  const sugarPercent = Math.round(sugarProgress * 100);
  const name = justChosen?.nameEs ?? "Ese plato";

  switch (severity) {
    case "over":
      return {
        headline: "Ya te pasaste por hoy, y está bien",
        message: `${name} te dejó ${totals.calories} kcal (${percent}% de tu meta) y ${totals.sugarGrams} g de azúcar, que es ${sugarPercent}% de lo recomendable al día. No te castigues: lo que importa es lo que comes en las siguientes horas. Te dejamos opciones muy ligeras y, si sigues con el ánimo bajo, una que te abrigue.`,
      };
    case "high":
      return {
        headline: "Buen golpe de azúcar, ahora toca suave",
        message: `Con ${name} llevas ${totals.calories} kcal (${percent}% de tu meta) y ${totals.sugarGrams} g de azúcar (${sugarPercent}% del máximo diario recomendado). Para el resto del día conviene algo ligero, con fibra y proteína, y no otro dulce.`,
      };
    case "watch":
      return {
        headline: "Vas bien, pero cuídate el resto del día",
        message: `Ya llevas ${totals.calories} kcal (${percent}% de tu meta) y ${totals.sugarGrams} g de azúcar. Aún hay margen de energía, así que mejor sigue con platos ligeros y termina el día con algo fresco.`,
      };
    default:
      return {
        headline: "Todavía tienes mucho día por delante",
        message: `Van ${totals.calories} kcal de ${totals.goalCalories} y ${totals.sugarGrams} g de azúcar. Puedes elegir lo que te pida el cuerpo; te dejamos igual opciones más ligeras por si quieres cuidar la tarde.`,
      };
  }
}

/**
 * With no mood to work from, fall back to something the user is likely to be
 * open to. "tired" is the least demanding of the moods, so it is a safe default.
 */
function fallbackMood(dishes: Dish[]): Mood {
  void dishes;
  return {
    id: 1,
    key: "tired" as MoodKey,
    label: "Cansado",
    emoji: "😴",
    description: "",
    accent: "#8C6E86",
    sortOrder: 1,
  };
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function logConsumed(
  userId: number,
  dishId: number,
  moodKey?: MoodKey | null,
  servings = 1,
): void {
  getDb()
    .prepare(
      `INSERT INTO interactions (user_id, dish_id, mood_key, action, servings) VALUES (?, ?, ?, 'cook', ?)`,
    )
    .run(userId, dishId, moodKey ?? null, Math.min(6, Math.max(0.5, servings)));
}

export { buildReason, STRATEGY };
