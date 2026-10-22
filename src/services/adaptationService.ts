import type { Dish, DishIngredient } from "../domain/types.ts";
import { findSubstitutionsFor } from "../db/seed/dietary.ts";
import type { VerifiedSubstitution } from "../domain/assistant.ts";

/**
 * Adapting a recipe to a different number of portions, a different diet or a
 * different set of ingredients.
 *
 * The original recipe is always the source of truth: quantities are scaled
 * from it, and when something cannot be scaled honestly the answer says so
 * instead of guessing.
 */

export interface ScaledIngredient extends DishIngredient {
  /** The original amount, kept so the UI can show both. */
  originalQuantity: string;
  /** True when the amount could not be scaled with confidence. */
  approximate: boolean;
}

/** Quantities that are amounts "to taste" and cannot be scaled. */
const UNSCALABLE = [
  "al gusto",
  "unas hojas",
  "un puñado",
  "una pizca",
  "un poco",
  "a ras",
  "un chorrito",
  "unas ramas",
];

/**
 * Parses a quantity written in the catalogue format ("200 g", "1/2 unidad",
 * "2 cdas") and returns the number, or `null` when it is not a number.
 */
export function parseQuantity(quantity: string): { value: number; rest: string } | null {
  const clean = quantity.trim();
  if (!clean) return null;

  // "1/2 unidad" is a real quantity in the catalogue, not the number one.
  const fraction = clean.match(/^(\d+)\s*\/\s*(\d+)\s*(.*)$/);
  if (fraction) {
    const numerator = Number.parseInt(fraction[1], 10);
    const denominator = Number.parseInt(fraction[2], 10);
    if (denominator === 0) return null;
    return { value: numerator / denominator, rest: fraction[3].trim() };
  }

  const match = clean.match(/^(\d+(?:[.,]\d+)?)\s*(.*)$/);
  if (!match) return null;

  const raw = match[1].replace(",", ".");
  const value = Number.parseFloat(raw);
  if (!Number.isFinite(value)) return null;

  return { value, rest: match[2].trim() };
}

/** Common fractions a cook reads more easily than a decimal. */
const FRACTIONS: { value: number; label: string }[] = [
  { value: 0.25, label: "1/4" },
  { value: 1 / 3, label: "1/3" },
  { value: 0.5, label: "1/2" },
  { value: 2 / 3, label: "2/3" },
  { value: 0.75, label: "3/4" },
];

/** Rounds a scaled quantity the way a cook would write it. */
export function formatQuantity(value: number, unit: string): string {
  const rounded = Math.round(value * 100) / 100;
  const fraction = FRACTIONS.find((item) => Math.abs(rounded - item.value) < 0.02);
  const nice = fraction
    ? fraction.label
    : Number.isInteger(rounded)
      ? String(rounded)
      : String(Math.round(rounded * 10) / 10);
  return unit ? `${nice} ${unit}` : nice;
}

/**
 * Scales one quantity. Quantities that cannot be scaled honestly are kept
 * as they are and marked as approximate.
 */
export function scaleQuantity(
  quantity: string,
  factor: number,
): { quantity: string; approximate: boolean } {
  const clean = quantity.trim();
  if (!clean) return { quantity: clean, approximate: false };

  const lowered = clean.toLowerCase();
  if (UNSCALABLE.some((marker) => lowered.includes(marker))) {
    return { quantity: clean, approximate: true };
  }

  const parsed = parseQuantity(clean);
  if (!parsed) return { quantity: clean, approximate: true };

  const scaled = parsed.value * factor;
  if (scaled <= 0) return { quantity: "un poco", approximate: true };

  return { quantity: formatQuantity(scaled, parsed.rest), approximate: false };
}

/**
 * The ingredients of a recipe scaled for a different number of portions.
 */
export function scaleIngredients(
  ingredients: DishIngredient[],
  fromServings: number,
  toServings: number,
): ScaledIngredient[] {
  const factor = toServings / Math.max(1, fromServings);

  return ingredients.map((item) => {
    const scaled = scaleQuantity(item.quantity, factor);
    return {
      ...item,
      originalQuantity: item.quantity,
      quantity: scaled.quantity,
      approximate: scaled.approximate,
    };
  });
}

export interface AdaptationResult {
  dish: Dish;
  /** The scaled ingredient list. */
  ingredients: ScaledIngredient[];
  /** The steps, unchanged unless a substitution changes them. */
  steps: string[];
  /** The substitutions that apply, when the user asked to change something. */
  substitutions: VerifiedSubstitution[];
  /** Honest notes about what the adaptation changes. */
  notes: string[];
  /** Anything that could affect safety. */
  warnings: string[];
}

/**
 * Adapts a recipe to a new number of portions and, optionally, to a new
 * diet or a different set of ingredients.
 */
export function adaptRecipe(
  dish: Dish,
  options: {
    servings?: number;
    diet?: "omnivore" | "vegetarian" | "vegan" | "pescatarian";
    excludeIngredients?: string[];
  } = {},
): AdaptationResult {
  const notes: string[] = [];
  const warnings: string[] = [];
  const substitutions: VerifiedSubstitution[] = [];

  const targetServings = options.servings ?? dish.servings;
  const scaled = scaleIngredients(dish.ingredients, dish.servings, targetServings);

  if (targetServings !== dish.servings) {
    notes.push(
      `Cantidades ajustadas de ${dish.servings} a ${targetServings} porciones. El tiempo de cocción se mantiene casi igual.`,
    );
  }

  const approximate = scaled.filter((item) => item.approximate && item.quantity.trim());
  if (approximate.length > 0) {
    notes.push(
      `Estos ingredientes se miden "al gusto" y no se multiplican: ${approximate
        .map((item) => item.label)
        .join(", ")}.`,
    );
  }

  if (options.excludeIngredients && options.excludeIngredients.length > 0) {
    for (const excluded of options.excludeIngredients) {
      const hit = dish.ingredients.find(
        (item) => item.label.toLowerCase().includes(excluded.toLowerCase()),
      );
      if (!hit) continue;

      const options_ = findSubstitutionsFor(hit.label);
      if (options_.length > 0) {
        const best = options_[0];
        substitutions.push({
          original: best.original,
          replacement: best.replacement,
          quantity: best.quantity,
          note: best.note,
        });
        notes.push(`${hit.label} → ${best.replacement}. ${best.note}`);
      } else {
        warnings.push(
          `No hay una sustitución verificada para ${hit.label}. Quítalo o consulta la receta original.`,
        );
      }
    }
  }

  if (options.diet && options.diet !== "omnivore") {
    if (options.diet === "vegan" && !dish.isVegan) {
      warnings.push(
        "Esta receta no es vegana: revisa los ingredientes de proteína y lácteos uno por uno.",
      );
    } else if (options.diet === "vegetarian" && !dish.isVegetarian) {
      warnings.push("Esta receta lleva carne o pescado: revisa los ingredientes antes de servirla.");
    }
  }

  if (substitutions.length > 0) {
    warnings.push("Revisa que ninguna sustitución añada un alérgeno que tengas declarado.");
  }

  return {
    dish,
    ingredients: scaled,
    steps: [...dish.steps],
    substitutions,
    notes,
    warnings,
  };
}
