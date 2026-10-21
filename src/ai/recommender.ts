import type {
  Dish,
  Interaction,
  Mood,
  MoodKey,
  RecommendationRequest,
  ScoreBreakdown,
  User,
  AxisName,
} from "../domain/types.ts";
import { AXIS_PHRASES_ES } from "../domain/types.ts";
import type { HealthCondition } from "../domain/types.ts";
import { clamp, round } from "./vector.ts";
import { cosine } from "./vector.ts";
import { CollaborativeFilter } from "./collaborative.ts";
import { allergenConflicts } from "./allergens.ts";
import { conditionsOf, DAILY_SUGAR_REFERENCE_G, evaluateDish } from "./health.ts";
import { extractIntent, type ExtractedIntent } from "./intent.ts";
import { MoodModel, type TrainingSample } from "./moodModel.ts";
import { TasteProfile } from "./tasteProfile.ts";
import { cravingScore, mapMoodOption, timeBudgetCeiling, timeFitScore } from "./taxonomy.ts";

export const MODEL_VERSION = "foodmood-1.4.0";
export const STRATEGY = "hybrid-mood-taste-itemknn-mmr";

interface Weights {
  mood: number;
  taste: number;
  collaborative: number;
  preference: number;
  novelty: number;
  popularity: number;
  /** Only used by the light-mode weights. */
  light?: number;
  /** Only used by the questionnaire weights. */
  craving?: number;
  /** Only used by the questionnaire weights. */
  time?: number;
}

const COLD_START_WEIGHTS: Weights = {
  mood: 0.52,
  taste: 0.14,
  collaborative: 0.12,
  preference: 0.12,
  novelty: 0.04,
  popularity: 0.06,
};

const TRAINED_WEIGHTS: Weights = {
  mood: 0.3,
  taste: 0.2,
  collaborative: 0.26,
  preference: 0.14,
  novelty: 0.05,
  popularity: 0.05,
};

/**
 * The wizard tells three things at once: how the person feels, how much time
 * they have and what they feel like eating. Those answers are explicit, so
 * they get their own channels instead of being mixed into the mood score.
 */
const QUESTIONNAIRE_WEIGHTS: Weights = {
  mood: 0.34,
  taste: 0.12,
  collaborative: 0.08,
  preference: 0.14,
  novelty: 0.08,
  popularity: 0.04,
  craving: 0.14,
  time: 0.06,
};

export interface ScoredDish {
  dish: Dish;
  breakdown: ScoreBreakdown;
}

export interface RecommenderContext {
  dishes: Dish[];
  mood: Mood;
  interactions: Interaction[];
  user: User | null;
  request: RecommendationRequest;
  moodModel: MoodModel;
  tasteProfile: TasteProfile;
  collaborative: CollaborativeFilter;
}

export function prepareModels(
  dishes: Dish[],
  interactions: Interaction[],
  moodModel: MoodModel,
  tasteProfile: TasteProfile,
  collaborative: CollaborativeFilter,
): void {
  tasteProfile.fit(dishes);

  collaborative.fit(
    interactions.map((interaction) => ({
      userId: interaction.userId,
      dishId: interaction.dishId,
      action: interaction.action,
      rating: interaction.rating,
    })),
  );

  const dishById = new Map(dishes.map((dish) => [dish.id, dish]));
  const samples: TrainingSample[] = [];
  for (const interaction of interactions) {
    if (!interaction.moodKey) continue;
    const dish = dishById.get(interaction.dishId);
    if (!dish) continue;
    samples.push({
      moodKey: interaction.moodKey as MoodKey,
      axes: dish.axes,
      action: interaction.action,
      rating: interaction.rating,
    });
  }
  moodModel.train(samples);
}

function passesDiet(dish: Dish, diet: User["preferences"]["diet"]): boolean {
  if (diet === "omnivore") return true;
  if (diet === "vegetarian") return dish.isVegetarian;
  if (diet === "vegan") return dish.isVegan;
  if (diet === "pescatarian") return dish.isVegetarian || isFishDish(dish);
  return true;
}

const FISH_MARKERS = new Set([
  "salmon", "lomo de salmon", "atun en lata", "camaron",
]);

function isFishDish(dish: Dish): boolean {
  return dish.ingredients.some((item) => FISH_MARKERS.has(normalizeToken(item.label)));
}

function normalizeToken(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function preferencePenalty(dish: Dish, request: RecommendationRequest, user: User | null): number {
  const preferences = user?.preferences;
  const diet = request.diet ?? preferences?.diet ?? "omnivore";
  const maxPrep = request.maxPrepMinutes ?? preferences?.maxPrepMinutes ?? null;
  const maxSpice = preferences?.maxSpiceLevel ?? 1;
  const maxPrice = preferences?.maxPriceLevel ?? 3;

  let penalty = 0;
  if (maxPrep !== null && dish.prepMinutes > maxPrep) {
    penalty += clamp((dish.prepMinutes - maxPrep) / maxPrep, 0, 1) * 0.6;
  }
  if (dish.axes.spice > maxSpice) {
    penalty += clamp((dish.axes.spice - maxSpice) / Math.max(0.05, 1 - maxSpice), 0, 1) * 0.5;
  }
  if (dish.priceLevel > maxPrice) {
    penalty += (dish.priceLevel - maxPrice) * 0.15;
  }
  return penalty;
}

function hardFilters(
  dish: Dish,
  request: RecommendationRequest,
  user: User | null,
  intent: ExtractedIntent,
  conditions: HealthCondition[],
  dailyCalorieGoal: number,
  effectiveMaxPrepMinutes: number | null,
): string | null {
  const preferences = user?.preferences;
  const diet = request.diet ?? intent.diet ?? preferences?.diet ?? "omnivore";
  if (!passesDiet(dish, diet)) return "No coincide con tu dieta";

  const allergies = [
    ...(preferences?.allergies ?? []),
    ...(request.allergies ?? []),
  ].map(normalizeToken);
  const disliked = [
    ...(preferences?.dislikedIngredients ?? []),
    ...(request.excludedIngredients ?? []),
  ].map(normalizeToken);
  const labels = dish.ingredients.map((item) => normalizeToken(item.label));

  if (allergies.some((item) => labels.includes(item))) return "Contiene un ingrediente que te causa alergia";
  if (disliked.some((item) => labels.includes(item))) return "No te gusta ese ingrediente";

  // A declared allergy is a hard restriction, not a preference: the recipe is
  // removed from the list even when the model would have loved it.
  const conflicts = allergenConflicts(dish, request.allergies ?? []);
  if (conflicts.length > 0) {
    return `Tiene ${conflicts.join(", ")} y lo tienes entre tus alergias`;
  }

  // Health conditions outrank the mood: a wrong suggestion costs more than a
  // boring one, so a real conflict is an exclusion, never a penalty.
  const verdict = evaluateDish(dish, conditions, dailyCalorieGoal);
  if (verdict.blockingReason) return verdict.blockingReason;

  // Hard constraints read out of what the user actually typed.
  if (intent.maxSpiceLevel !== null && dish.axes.spice > intent.maxSpiceLevel) {
    return "Lo pediste sin picante";
  }
  if (intent.maxSweetness !== null && dish.axes.sweetness > intent.maxSweetness) {
    return "Lo pediste sin tanto dulce";
  }
  if (intent.maxPrepMinutes !== null && dish.prepMinutes > intent.maxPrepMinutes) {
    return "Lo pediste rápido";
  }
  if (intent.maxPriceLevel !== null && dish.priceLevel > intent.maxPriceLevel) {
    return "Lo pediste económico";
  }
  if (intent.minLightness !== null && dish.axes.lightness < intent.minLightness) {
    return "Lo pediste ligero";
  }
  if (intent.minWarmth !== null && dish.axes.warmth < intent.minWarmth) {
    return "Lo pediste caliente";
  }

  if ((request.excludeDishIds ?? []).includes(dish.id)) return "Ya lo viste";

  // The time limit for THIS search is a hard constraint. The one stored in the
  // profile stays a soft penalty, because it is a standing habit rather than
  // an instruction for the current meal.
  if (effectiveMaxPrepMinutes !== null && dish.prepMinutes > effectiveMaxPrepMinutes) {
    return "Se pasó del tiempo que pediste";
  }

  if (
    request.difficulty &&
    DIFFICULTY_RANK[dish.difficulty] > DIFFICULTY_RANK[request.difficulty]
  ) {
    return "Es más difícil de lo que pediste";
  }

  return null;
}

const DIFFICULTY_RANK: Record<Dish["difficulty"], number> = {
  facil: 1,
  media: 2,
  avanzada: 3,
};

const STRONG_AXIS_THRESHOLD = 0.5;

/** A detail that varies per dish so the explanation never reads like a template. */
function dishDetail(dish: Dish): string | null {
  if (dish.prepMinutes <= 10) return `y en ${dish.prepMinutes} minutos ya está`;
  if (dish.proteinGrams >= 30) return `y aporta ${dish.proteinGrams} g de proteína`;
  if (dish.calories <= 300) return `y son solo ${dish.calories} kcal`;
  if (dish.ingredients.length <= 4) {
    return `y solo lleva ${dish.ingredients.length} ingredientes`;
  }
  if (dish.priceLevel === 1) return "y es de lo más económico de la carta";
  return null;
}

function buildReason(
  dish: Dish,
  breakdown: ScoreBreakdown,
  mood: Mood,
  note?: string | null,
): string {
  const parts: string[] = [];

  const strongAxes = breakdown.topReasons
    .filter((reason) => reason.contribution >= STRONG_AXIS_THRESHOLD)
    .slice(0, 2)
    .map((reason) => AXIS_PHRASES_ES[reason.axis]);

  parts.push(...strongAxes);

  if (note?.trim()) {
    parts.push(`lee tu nota sobre «${note.trim()}»`);
  }
  if (breakdown.cravingFit > 0.55) {
    parts.push("coincide con lo que dijiste que te apetece");
  }
  if (breakdown.timeFit > 0.7) {
    parts.push(`se prepara en ${dish.prepMinutes} minutos`);
  }
  if (breakdown.preferenceFit > 0.6) {
    parts.push("encaja con las preferencias que tienes guardadas");
  }
  if (breakdown.collaborative > 0.45) {
    parts.push("a otros con tu mismo gusto les suele encantar");
  }
  if (breakdown.novelty > 0.72) {
    parts.push("igual todavía no te lo has probado");
  }

  const detail = dishDetail(dish);

  if (parts.length === 0) {
    return `Una opción sólida para cuando estás ${mood.label.toLowerCase()}: ${dish.prepMinutes} min, ${dish.calories} kcal y ${dish.category.toLowerCase()}.`;
  }

  const list = parts.slice(0, 2).join(", ");
  const extra = parts.length > 2 ? `, ${parts[2]}` : "";
  const tail = detail ? `, ${detail}` : "";
  return `Porque ${list}${extra}${tail}. ${dish.prepMinutes} min · ${dish.calories} kcal · ${dish.category}.`;
}

const NOTE_DRIVEN_WEIGHTS: Weights = {
  mood: 0.18,
  taste: 0.57,
  collaborative: 0.08,
  preference: 0.1,
  novelty: 0.02,
  popularity: 0.05,
};

/**
 * Choosing a mood is a deliberate instruction, while the learned taste profile
 * is only a prior built from past behaviour. When the two disagree sharply, the
 * explicit instruction has to win: someone who says "I feel sad" wants comfort
 * and something sweet, not the pasta they happened to love last month.
 */
const MOOD_OVERRIDE_GAP = 0.15;
const MOOD_OVERRIDE_WEIGHTS: Weights = {
  mood: 0.62,
  taste: 0.08,
  collaborative: 0.08,
  preference: 0.14,
  novelty: 0.03,
  popularity: 0.05,
};

export interface RankOptions {
  /** Ignore the mood and rank purely on how light the dish is. */
  lightMode?: boolean;
  /** Dish ids already handled this turn, so the balance step avoids them. */
  excludeIds?: number[];
  conditions?: HealthCondition[];
  dailyCalorieGoal?: number;
}

/**
 * If the dish the learned taste would pick is a poor match for the mood the
 * user just declared, the taste channel is demoted to a tiebreaker. Without
 * this, a heavy pasta eater asking to feel better never gets anything different.
 */
function resolveWeights(
  weights: Weights,
  context: {
    lightMode: boolean;
    affinityByDish: Map<number, ReturnType<MoodModel["affinity"]>>;
    tasteProfile: TasteProfile;
    tasteVector: number[] | null;
    predicted: Map<number, number>;
    excluded: Set<number>;
  },
): Weights {
  const { lightMode, affinityByDish, tasteProfile, tasteVector, predicted, excluded } = context;
  if (lightMode || !tasteVector) return weights;

  let tasteLeader: { id: number; score: number } | null = null;
  for (const [dishId, affinity] of affinityByDish) {
    if (excluded.has(dishId)) continue;
    const score = tasteProfile.similarity(tasteVector, dishId) + (predicted.get(dishId) ?? 0);
    if (!tasteLeader || score > tasteLeader.score) {
      tasteLeader = { id: dishId, score };
    }
  }
  if (!tasteLeader) return weights;

  const leaderAffinity = affinityByDish.get(tasteLeader.id)?.score ?? 0;
  let bestAffinity = 0;
  for (const [dishId, affinity] of affinityByDish) {
    if (excluded.has(dishId)) continue;
    if (affinity.score > bestAffinity) bestAffinity = affinity.score;
  }

  return bestAffinity - leaderAffinity > MOOD_OVERRIDE_GAP
    ? MOOD_OVERRIDE_WEIGHTS
    : weights;
}

export const LIGHT_WEIGHTS: Weights = {
  mood: 0.12,
  taste: 0.1,
  collaborative: 0.08,
  preference: 0.1,
  novelty: 0.05,
  popularity: 0.05,
  light: 0.5,
};

export function rankDishes(
  context: RecommenderContext,
  options: RankOptions = {},
): ScoredDish[] {
  const { dishes, mood, request, moodModel, tasteProfile, collaborative, user } = context;

  const intent = extractIntent(request.freeText);
  const conditions = conditionsOf(user?.preferences.health, options.conditions ?? request.conditions);
  const dailyCalorieGoal = options.dailyCalorieGoal ?? user?.preferences.dailyCalorieGoal ?? 2000;
  const lightMode = options.lightMode ?? false;

  const userInteractions = user
    ? context.interactions.filter((interaction) => interaction.userId === user.id)
    : [];

  const historyStrength = userInteractions.length;
  const baseWeights = historyStrength >= 5 ? TRAINED_WEIGHTS : COLD_START_WEIGHTS;
  // The wizard carries explicit answers, so it gets its own weight set.
  const usesQuestionnaire = Boolean(
    request.moodOption || request.timeBudget || request.craving,
  );
  // An explicit note from the user is a stronger signal than their mood pick,
  // so the text channel takes over the ranking.
  const weights: Weights = lightMode
    ? LIGHT_WEIGHTS
    : request.freeText?.trim()
      ? NOTE_DRIVEN_WEIGHTS
      : usesQuestionnaire
        ? QUESTIONNAIRE_WEIGHTS
        : baseWeights;

  const tasteVector = tasteProfile.combineWithQuery(
    tasteProfile.buildUserVector(TasteProfile.toSignals(userInteractions)),
    request.freeText ?? null,
  );

  const excluded = new Set(request.excludeDishIds ?? []);
  const predicted = user
    ? collaborative.predict(user.id, new Set([...excluded, ...userInteractions.map((i) => i.dishId)]))
    : new Map<number, number>();

  const popularityScores = new Map(collaborative.popularity(200).map((item) => [item.dishId, item.score]));
  const maxPopularity = Math.max(1, ...popularityScores.values());

  const affinityByDish = new Map<number, ReturnType<MoodModel["affinity"]>>();
  for (const dish of dishes) {
    affinityByDish.set(dish.id, moodModel.affinity(mood.key as MoodKey, dish.axes));
  }

  // The time the person declared wins over the ceiling stored in the profile.
  const effectiveMaxPrepMinutes =
    request.maxPrepMinutes ?? timeBudgetCeiling(request.timeBudget);

  // A written note is the most explicit signal of all, so the mood-override
  // rebalance must not touch it.
  const noteDriven = Boolean(request.freeText?.trim());
  const effectiveWeights = noteDriven
    ? weights
    : resolveWeights(weights, {
        lightMode,
        affinityByDish,
        tasteProfile,
        tasteVector,
        predicted,
        excluded: new Set([...excluded, ...userInteractions.map((item) => item.dishId)]),
      });

  // The wizard channels are scaled by how much the selected mood option cares
  // about them: "aburrido" leans on novelty, "con el ánimo bajo" on comfort.
  const mappedMood = request.moodOption ? mapMoodOption(request.moodOption) : null;
  const cravingChannelWeight =
    (effectiveWeights.craving ?? 0) * (mappedMood ? mappedMood.cravingWeight : 1);
  const noveltyChannelWeight =
    (effectiveWeights.novelty ?? 0) * (mappedMood ? mappedMood.noveltyWeight : 1);

  const scored: ScoredDish[] = [];

  for (const dish of dishes) {
    if (
      hardFilters(
        dish,
        request,
        user,
        intent,
        conditions,
        dailyCalorieGoal,
        effectiveMaxPrepMinutes,
      ) !== null
    ) {
      continue;
    }
    if (options.excludeIds?.includes(dish.id)) continue;

    const affinity = affinityByDish.get(dish.id);
    if (!affinity) continue;

    const collaborativeScore = predicted.get(dish.id) ?? 0;
    const preferenceFit = clamp(1 - preferencePenalty(dish, request, user));

    const seenDocuments = userInteractions
      .filter((interaction) => interaction.action !== "impression" && interaction.action !== "view")
      .map((interaction) => tasteProfile.documentVector(interaction.dishId))
      .filter((vector) => vector.length > 0);

    let novelty = 0.6;
    if (seenDocuments.length > 0) {
      const current = tasteProfile.documentVector(dish.id);
      let maxSimilarity = 0;
      for (const document of seenDocuments) {
        maxSimilarity = Math.max(maxSimilarity, cosine(current, document));
      }
      novelty = clamp(1 - maxSimilarity);
    }

    const popularity = clamp((popularityScores.get(dish.id) ?? 0) / maxPopularity);

    const freeText = request.freeText?.trim();
    let tasteMatch = tasteProfile.similarity(tasteVector, dish.id);
    if (freeText) {
      const terms = TasteProfile.keywords(freeText);
      const dishTags = new Set(dish.tags.map((tag) => tag.toLowerCase()));
      const matched = terms.filter((term) => dishTags.has(term));
      tasteMatch = clamp(tasteMatch + 0.15 * matched.length);
    }

    const health = evaluateDish(dish, conditions, dailyCalorieGoal);

    // Lightness is not an axis in the mood space: it is the calorie and sugar
    // load of the plate, inverted and capped against a quarter of the daily
    // goal (what a light meal should be). This is what the "rest of the day"
    // step ranks on. Sugar is weighted heavily because a dessert is what
    // leaves the biggest sugar debt behind.
    const light =
      lightMode && dailyCalorieGoal > 0
        ? clamp(
            1 -
              (dish.calories / (dailyCalorieGoal * 0.25)) * 0.55 -
              (dish.nutrition.sugarGrams / DAILY_SUGAR_REFERENCE_G) * 0.4 -
              (dish.fatGrams / 60) * 0.15,
          )
        : 0;

    const breakdown: ScoreBreakdown = {
      moodAffinity: round(lightMode ? light : affinity.score, 4),
      tasteMatch: round(tasteMatch, 4),
      collaborative: round(collaborativeScore, 4),
      preferenceFit: round(preferenceFit, 4),
      novelty: round(novelty, 4),
      popularity: round(popularity, 4),
      healthFit: round(lightMode ? health.score * 0.6 + light * 0.4 : health.score, 4),
      cravingFit: round(cravingScore(dish, request.craving), 4),
      timeFit: round(timeFitScore(dish, effectiveMaxPrepMinutes), 4),
      total: 0,
      topReasons: lightMode
        ? ([
            { axis: "lightness" as AxisName, value: dish.axes.lightness },
            { axis: "protein" as AxisName, value: dish.axes.protein },
            { axis: "freshness" as AxisName, value: dish.axes.freshness },
          ]
            .sort((a, b) => b.value - a.value)
            .slice(0, 4)
            .map((item) => ({
              axis: item.axis,
              contribution: round(item.value, 4),
              weight: round(item.value, 4),
            })))
        : affinity.contributions.slice(0, 4).map((item) => ({
            axis: item.axis as AxisName,
            contribution: round(item.contribution, 4),
            weight: round(item.weight, 4),
          })),
      healthNotes: health.warnings,
    };

    const total =
      breakdown.moodAffinity * effectiveWeights.mood +
      breakdown.tasteMatch * effectiveWeights.taste +
      breakdown.collaborative * effectiveWeights.collaborative +
      breakdown.preferenceFit * effectiveWeights.preference +
      breakdown.novelty * noveltyChannelWeight +
      breakdown.popularity * effectiveWeights.popularity +
      breakdown.cravingFit * cravingChannelWeight +
      breakdown.timeFit * (effectiveWeights.time ?? 0) +
      (lightMode ? breakdown.healthFit * (effectiveWeights.light ?? 0) : 0) +
      (!lightMode && conditions.length > 0 ? breakdown.healthFit * 0.25 : 0);

    breakdown.total = round(total, 4);
    scored.push({ dish, breakdown });
  }

  scored.sort((a, b) => b.breakdown.total - a.breakdown.total);
  return scored;
}

/**
 * Maximal Marginal Relevance: trades a bit of raw score for a set of picks that
 * are not near-duplicates of each other. Without it a "comfort food" mood
 * returns five variations of the same soup.
 */
export function diversify(scored: ScoredDish[], limit: number, lambda = 0.78): ScoredDish[] {
  if (scored.length <= limit) return scored;

  const vectors = new Map(scored.map((item) => [item.dish.id, item.dish]));
  const selected: ScoredDish[] = [];
  const pool = [...scored];

  while (selected.length < limit && pool.length > 0) {
    let bestIndex = 0;
    let bestValue = -Infinity;

    for (let index = 0; index < pool.length; index += 1) {
      const candidate = pool[index];
      let maxSimilarity = 0;
      for (const chosen of selected) {
        const similarity = axisSimilarity(vectors.get(candidate.dish.id)!, vectors.get(chosen.dish.id)!);
        maxSimilarity = Math.max(maxSimilarity, similarity);
      }
      const value = lambda * candidate.breakdown.total - (1 - lambda) * maxSimilarity;
      if (value > bestValue) {
        bestValue = value;
        bestIndex = index;
      }
    }

    selected.push(pool[bestIndex]);
    pool.splice(bestIndex, 1);
  }

  return selected;
}

function axisSimilarity(a: Dish, b: Dish): number {
  return cosine(
    [a.axes.comfort, a.axes.richness, a.axes.spice, a.axes.sweetness, a.axes.freshness],
    [b.axes.comfort, b.axes.richness, b.axes.spice, b.axes.sweetness, b.axes.freshness],
  );
}

export { buildReason };
