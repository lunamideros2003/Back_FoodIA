import type { Dish } from "./types.ts";

/**
 * Optional helper for planning a few days of meals. It never prescribes a diet
 * or a calorie target: it only suggests combinations of dishes that already
 * exist in the catalogue and that the person can edit before using.
 */
export type MealSlot = "desayuno" | "almuerzo" | "cena" | "merienda";

export const MEAL_SLOTS: MealSlot[] = ["desayuno", "almuerzo", "cena", "merienda"];

export const MEAL_SLOT_LABELS_ES: Record<MealSlot, string> = {
  desayuno: "Desayuno",
  almuerzo: "Almuerzo",
  cena: "Cena",
  merienda: "Merienda",
};

/** Categories in the catalogue that fit each slot. */
export const SLOT_CATEGORIES: Record<MealSlot, string[]> = {
  desayuno: ["Desayuno", "Bebidas"],
  almuerzo: ["Almuerzo", "Snack"],
  cena: ["Cena", "Almuerzo"],
  merienda: ["Snack", "Postre", "Bebidas"],
};

export interface PlannedMeal {
  slot: MealSlot;
  dish: Dish;
  /** Why this dish was picked, based on the real recipe data. */
  reason: string;
}

export interface PlannedDay {
  /** ISO date, `YYYY-MM-DD`. */
  date: string;
  meals: PlannedMeal[];
}

export interface ShoppingItem {
  /** The ingredient label, ready to show in the list. */
  name: string;
  /** Sum of the quantities of the selected recipes. */
  quantity: string;
  /** How many recipes contributed this ingredient. */
  fromRecipes: number;
  /** The recipes the ingredient comes from. */
  dishes: string[];
}

export interface MealPlanRequest {
  userId?: number;
  /** How many days to plan, 1..7. */
  days: number;
  moodKey?: string;
  craving?: string;
  /** Ingredients the person wants to use up. */
  availableIngredients?: string[];
}

export interface MealPlanResponse {
  days: PlannedDay[];
  shoppingList: ShoppingItem[];
  /** A short, honest note about what this plan is and is not. */
  note: string;
}
