import { ALLERGEN_MARKERS } from "../db/seed/dietary.ts";
import type { Dish } from "../domain/types.ts";

/** Lowercase and strip accents so "Camarón" and "camaron" match the same rule. */
export function normalizeLabel(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

const MARKERS = ALLERGEN_MARKERS.map((marker) => ({
  allergen: marker.allergen,
  labels: marker.labels.map(normalizeLabel),
}));

/**
 * The allergens really present in the dish, taken from the ingredient list.
 *
 * The result is a hard fact coming from the catalogue, not from a model, so it
 * can be trusted to block a recipe.
 */
export function allergensOf(dish: Dish): string[] {
  const labels = dish.ingredients.map((item) => normalizeLabel(item.label));
  const found: string[] = [];

  for (const marker of MARKERS) {
    const hit = marker.labels.some(
      (candidate) =>
        labels.some(
          (label) => label === candidate || label.includes(candidate),
        ),
    );
    if (hit) found.push(marker.allergen);
  }

  // Gluten is already tracked as a dedicated flag on the dish.
  if (dish.containsGluten && !found.includes("Gluten")) found.push("Gluten");

  return found;
}

/**
 * The allergens of a dish that would also be present in a dish the user
 * declared an allergy for. Returns the conflicting allergen names.
 */
export function allergenConflicts(dish: Dish, declaredAllergies: string[]): string[] {
  if (declaredAllergies.length === 0) return [];
  const present = allergensOf(dish);
  const declared = declaredAllergies.map(normalizeLabel);

  return present.filter((allergen) => {
    const needle = normalizeLabel(allergen);
    return declared.some((item) => needle.includes(item) || item.includes(needle));
  });
}

/** Human readable label for the allergen list shown on the recipe page. */
export const ALLERGEN_LABELS_ES: Record<string, string> = {
  Gluten: "Gluten",
  Leche: "Leche",
  Huevo: "Huevo",
  "Frutos secos": "Frutos secos",
  Sésamo: "Sésamo",
  Soya: "Soya",
  Mariscos: "Mariscos",
  Pescado: "Pescado",
  Apio: "Apio",
};
