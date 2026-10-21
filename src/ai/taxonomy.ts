import {
  findMoodOption,
  type CravingKey,
  type MoodOptionKey,
  type TimeBudgetKey,
} from "../domain/questionnaire.ts";
import type { Dish, MoodKey } from "../domain/types.ts";

/**
 * The wizard vocabulary and the model vocabulary are different things. The
 * model knows six moods; the wizard asks six questions. This module is the
 * bridge, so the ranking engine keeps working exactly as before.
 */
export interface MappedMood {
  /** The mood the model understands. */
  moodKey: MoodKey;
  /** How much the craving answer should weigh, 0..1. */
  cravingWeight: number;
  /** How much "something different" should weigh, 0..1. */
  noveltyWeight: number;
  /** The label of the option the person picked. */
  optionLabel: string;
}

export function mapMoodOption(key: MoodOptionKey): MappedMood {
  const option = findMoodOption(key);
  if (!option) {
    return {
      moodKey: "tired",
      cravingWeight: 0.5,
      noveltyWeight: 0.2,
      optionLabel: "Con energía",
    };
  }
  return {
    moodKey: option.moodKey,
    cravingWeight: option.cravingWeight,
    noveltyWeight: option.noveltyWeight,
    optionLabel: option.label,
  };
}

/**
 * The craving the person asked for, expressed as weights over the axes of the
 * flavour space. "Algo dulce" is not a filter, it is a pull towards the
 * sweetness axis.
 */
export const CRAVING_AXIS_WEIGHTS: Record<
  Exclude<CravingKey, "surprise">,
  Partial<Record<keyof Dish["axes"], number>>
> = {
  sweet: { sweetness: 0.8, indulgence: 0.3, comfort: 0.2 },
  savory: { richness: 0.6, protein: 0.4, warmth: 0.3, spice: 0.2 },
  light: { lightness: 0.8, freshness: 0.5, value: 0.2 },
  comfort: { comfort: 0.8, warmth: 0.6, richness: 0.3 },
};

/**
 * How well a dish answers the craving. The result is 0..1, and it is a soft
 * signal: the craving never removes a dish, it only orders the ones that
 * survive the hard filters.
 */
export function cravingScore(dish: Dish, craving: CravingKey | null | undefined): number {
  if (!craving || craving === "surprise") return 0;

  const weights = CRAVING_AXIS_WEIGHTS[craving];
  if (!weights) return 0;

  const entries = Object.entries(weights) as [keyof Dish["axes"], number][];
  let total = 0;
  let weightSum = 0;
  for (const [axis, weight] of entries) {
    total += dish.axes[axis] * weight;
    weightSum += weight;
  }
  if (weightSum === 0) return 0;

  const raw = total / weightSum;
  // A craving needs to be visible, not just slightly better than average.
  return Math.max(0, Math.min(1, (raw - 0.25) / 0.75));
}

/**
 * How well a dish fits the time the person said they have. Exact fits score
 * high, and anything over the ceiling scores zero because the hard filter
 * already removed it.
 */
export function timeFitScore(dish: Dish, maxMinutes: number | null): number {
  if (maxMinutes === null) return 0.5;
  if (dish.prepMinutes > maxMinutes) return 0;
  const ratio = dish.prepMinutes / maxMinutes;
  return Math.max(0, Math.min(1, 1 - ratio * 0.6));
}

/**
 * The time budget as a hard ceiling. "Menos de 10 minutos" really means ten
 * minutes or less, so a recipe that takes forty-five is never recommended
 * for this search.
 */
export function timeBudgetCeiling(budget: TimeBudgetKey | null | undefined): number | null {
  if (!budget) return null;
  switch (budget) {
    case "under_10":
      return 10;
    case "between_10_30":
      return 30;
    case "plenty":
      return null;
    default:
      return null;
  }
}

/**
 * How much of the recipe the person already has at home. It is a soft signal
 * on purpose: having the ingredients is a good reason to suggest a dish, but
 * it is never a reason to hide the other options.
 */
export function availableIngredientBonus(
  dish: Dish,
  available: string[] | undefined,
): number {
  if (!available || available.length === 0) return 0;

  const cleaned = available.map(normalizeToken).filter(Boolean);
  if (cleaned.length === 0) return 0;

  const required = dish.ingredients.filter((item) => !item.optional);
  const pool = required.length > 0 ? required : dish.ingredients;
  if (pool.length === 0) return 0;

  const hits = pool.filter((item) =>
    cleaned.some((entry) => {
      const label = normalizeToken(item.label);
      return label.includes(entry) || entry.includes(label);
    }),
  ).length;

  return Math.max(0, Math.min(1, hits / pool.length));
}

function normalizeToken(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}
