import type { Dish, DishAxes } from "./types.ts";

/** What the person can ask the generator for. */
export interface GeneratedRecipeInput {
  /** A free-text idea: "algo con calabaza", "cena rápida sin gluten". */
  idea?: string;
  diet?: "omnivore" | "vegetarian" | "vegan" | "pescatarian";
  servings?: number;
  /** Declared allergies, so the generator never proposes them. */
  allergies?: string[];
}

export interface GeneratedIngredient {
  name: string;
  label: string;
  category: string;
  quantity: string;
  optional?: boolean;
}

/**
 * The shape the model must return before anything touches the database.
 * Nutrition values are per serving, like the rest of the catalogue.
 */
export interface GeneratedRecipeDraft {
  nameEs: string;
  category: string;
  description: string;
  prepMinutes: number;
  difficulty: "facil" | "media" | "avanzada";
  servings: number;
  calories: number;
  proteinGrams: number;
  carbsGrams: number;
  fatGrams: number;
  sugarGrams: number;
  fiberGrams: number;
  sodiumMg: number;
  priceLevel: 1 | 2 | 3;
  tags: string[];
  ingredients: GeneratedIngredient[];
  steps: string[];
  chefTip: string;
  isVegetarian: boolean;
  isVegan: boolean;
  containsGluten: boolean;
  axes: DishAxes;
}

export interface GeneratedRecipeResponse {
  dish: Dish;
  generated: true;
  total: number;
}
