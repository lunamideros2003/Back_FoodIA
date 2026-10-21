import type { Dish } from "../domain/types.ts";
import { allergenConflicts } from "./allergens.ts";

export interface RecipeConstraints {
  diet: "omnivore" | "vegetarian" | "vegan" | "pescatarian";
  /** Hard restriction. Never a preference the model can talk its way around. */
  allergies: string[];
  /** Ingredients the person does not want to see. */
  excludedIngredients: string[];
  /** Hard ceiling on preparation time, in minutes. */
  maxPrepMinutes: number | null;
  /** Optional difficulty ceiling. */
  difficulty?: "facil" | "media" | "avanzada";
}

const DIFFICULTY_RANK: Record<Dish["difficulty"], number> = {
  facil: 1,
  media: 2,
  avanzada: 3,
};

const FISH_MARKERS = ["salmon", "atun", "camaron", "gamba", "calamar", "bacalao"];

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function isFishDish(dish: Dish): boolean {
  return dish.ingredients.some((item) => {
    const label = normalize(item.label);
    return FISH_MARKERS.some((marker) => label.includes(marker));
  });
}

/**
 * The reason a dish cannot be served, or `null` when it is safe to show.
 *
 * Everything here is decided with catalogue data, never with a model answer.
 * The model is allowed to explain why a recipe fits, but it is never allowed
 * to decide whether a recipe is safe for somebody with an allergy.
 */
export function rejectReason(dish: Dish, constraints: RecipeConstraints): string | null {
  const { diet, allergies, excludedIngredients, maxPrepMinutes, difficulty } = constraints;

  if (diet === "vegetarian" && !dish.isVegetarian) {
    return "No es vegetariano";
  }
  if (diet === "vegan" && !dish.isVegan) {
    return "No es vegano";
  }
  if (diet === "pescatarian" && !dish.isVegetarian && !isFishDish(dish)) {
    return "No es pescetariano";
  }

  const conflicts = allergenConflicts(dish, allergies);
  if (conflicts.length > 0) {
    return `Tiene ${conflicts.join(", ")} y lo tienes entre tus alergias`;
  }

  const labels = dish.ingredients.map((item) => normalize(item.label));
  const excluded = excludedIngredients.map(normalize).filter(Boolean);
  if (excluded.length > 0) {
    const hit = excluded.find((item) => labels.some((label) => label.includes(item)));
    if (hit) return `Lleva ${hit}, y pediste que no te lo mostrara`;
  }

  if (maxPrepMinutes !== null && dish.prepMinutes > maxPrepMinutes) {
    return `Tarda ${dish.prepMinutes} minutos y te dijiste que tenías ${maxPrepMinutes}`;
  }

  if (difficulty && DIFFICULTY_RANK[dish.difficulty] > DIFFICULTY_RANK[difficulty]) {
    return "Es más difícil de lo que pediste";
  }

  return null;
}

/** Keeps only the dishes that pass every hard constraint. */
export function applyGuardrails(dish: Dish[], constraints: RecipeConstraints): Dish[] {
  return dish.filter((item) => rejectReason(item, constraints) === null);
}

/**
 * The AI is only allowed to talk about recipes that exist. Anything else in
 * the model answer is dropped, so a generated recipe can never be presented
 * as if it were already part of the catalogue.
 */
export interface ValidatedAiRecipe {
  recipeId: number;
  reason: string;
  timeMatch: boolean;
  preferencesSatisfied: string[];
  warnings: string[];
}

export function validateAiRecipes(
  payload: unknown,
  catalogue: Map<number, Dish>,
  constraints: RecipeConstraints,
): { accepted: ValidatedAiRecipe[]; rejected: { recipeId: number; reason: string }[] } {
  const accepted: ValidatedAiRecipe[] = [];
  const rejected: { recipeId: number; reason: string }[] = [];

  if (!Array.isArray(payload)) return { accepted, rejected };

  for (const entry of payload) {
    if (typeof entry !== "object" || entry === null) continue;
    const record = entry as Record<string, unknown>;
    const recipeId = Number(record.recipeId);
    if (!Number.isInteger(recipeId)) continue;

    const dish = catalogue.get(recipeId);
    if (!dish) {
      rejected.push({ recipeId, reason: "Esa receta no existe en el recetario" });
      continue;
    }

    const blocked = rejectReason(dish, constraints);
    if (blocked) {
      rejected.push({ recipeId, reason: blocked });
      continue;
    }

    accepted.push({
      recipeId,
      reason: typeof record.reason === "string" ? record.reason : "",
      timeMatch: record.timeMatch === true,
      preferencesSatisfied: Array.isArray(record.preferencesSatisfied)
        ? record.preferencesSatisfied.filter((item): item is string => typeof item === "string")
        : [],
      warnings: Array.isArray(record.warnings)
        ? record.warnings.filter((item): item is string => typeof item === "string")
        : [],
    });
  }

  return { accepted, rejected };
}
