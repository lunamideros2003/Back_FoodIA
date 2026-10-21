import type { Dish } from "../domain/types.ts";
import { cravingScore, timeFitScore } from "../ai/taxonomy.ts";

/**
 * "What can I cook with what I have?".
 *
 * The score is the share of the recipe the person can already cover. A recipe
 * with four ingredients where they have three is a good match; a recipe with
 * twelve where they have two is not, no matter how nice it sounds.
 */

export interface IngredientMatch {
  dish: Dish;
  /** 0..1, the share of the recipe that is already in the kitchen. */
  coverage: number;
  /** The ingredients they have. */
  matched: string[];
  /** The ingredients they are missing. */
  missing: string[];
  /** True when they only miss optional ingredients. */
  almostThere: boolean;
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

/**
 * Matches one ingredient of the recipe against the list the person typed.
 * The comparison is tolerant: "tomate" matches "Tomate triturado" and
 * "perejil" matches "Perejil picado".
 */
export function ingredientMatches(ingredient: string, available: string[]): boolean {
  const needle = normalize(ingredient);
  if (!needle) return false;

  return available.some((item) => {
    const candidate = normalize(item);
    if (!candidate) return false;
    if (candidate === needle) return true;
    if (candidate.includes(needle) || needle.includes(candidate)) return true;
    // "Tomate triturado" should match "tomate".
    const firstWord = needle.split(" ")[0];
    return firstWord.length > 3 && candidate.includes(firstWord);
  });
}

/** Scores one dish against the ingredients the person has. */
export function scoreIngredientMatch(dish: Dish, available: string[]): IngredientMatch {
  const matched: string[] = [];
  const missing: string[] = [];
  const missingOptional: string[] = [];

  for (const item of dish.ingredients) {
    if (ingredientMatches(item.label, available)) {
      matched.push(item.label);
    } else if (item.optional) {
      missingOptional.push(item.label);
    } else {
      missing.push(item.label);
    }
  }

  const required = dish.ingredients.filter((item) => !item.optional);
  const requiredCount = Math.max(1, required.length);
  const matchedRequired = required.filter((item) => matched.includes(item.label)).length;

  const coverage = matchedRequired / requiredCount;

  return {
    dish,
    coverage: Math.round(coverage * 100) / 100,
    matched,
    missing,
    almostThere: missing.length === 0 && missingOptional.length > 0,
  };
}

export interface IngredientSearchOptions {
  limit?: number;
  maxPrepMinutes?: number | null;
  /** Only dishes the person can cook right now, missing nothing. */
  onlyComplete?: boolean;
  craving?: string | null;
}

/**
 * The recipes that match best with what the person has at home.
 */
export function matchByIngredients(
  dishes: Dish[],
  available: string[],
  options: IngredientSearchOptions = {},
): IngredientMatch[] {
  const limit = options.limit ?? 12;
  const cleaned = available.map((item) => item.trim()).filter(Boolean);

  const matches = dishes
    .map((dish) => scoreIngredientMatch(dish, cleaned))
    .filter((match) => {
      if (options.onlyComplete && match.missing.length > 0) return false;
      if (options.maxPrepMinutes !== null && options.maxPrepMinutes !== undefined) {
        if (match.dish.prepMinutes > options.maxPrepMinutes) return false;
      }
      return match.coverage > 0;
    });

  matches.sort((a, b) => {
    if (b.coverage !== a.coverage) return b.coverage - a.coverage;
    if (a.missing.length !== b.missing.length) return a.missing.length - b.missing.length;
    const cravingDelta =
      cravingScore(b.dish, options.craving) - cravingScore(a.dish, options.craving);
    if (Math.abs(cravingDelta) > 0.01) return cravingDelta;
    return a.dish.prepMinutes - b.dish.prepMinutes;
  });

  return matches.slice(0, limit);
}

/**
 * A short explanation of why a dish matches, written with the real numbers.
 */
export function explainIngredientMatch(match: IngredientMatch): string {
  if (match.missing.length === 0) {
    return `Tienes todo lo que necesita: ${match.matched.slice(0, 4).join(", ")}.`;
  }

  const have = match.matched.length > 0 ? match.matched.slice(0, 3).join(", ") : "pocos ingredientes";
  return `Con ${have} cubres casi todo. Solo falta ${match.missing.slice(0, 3).join(", ")}.`;
}

/** How well a match fits the time the person has, used to order the list. */
export function matchTimeFit(match: IngredientMatch, maxMinutes: number | null): number {
  return timeFitScore(match.dish, maxMinutes);
}
