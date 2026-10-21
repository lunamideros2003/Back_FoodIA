import type { Dish } from "./types.ts";

/**
 * Everything the user chooses to keep between sessions. Nothing here is
 * written automatically: the app only stores it when the person agrees.
 */
export type RecipeEntryStatus = "viewed" | "prepared";

export interface RecipeEntry {
  id: number;
  userId: number;
  dishId: number;
  status: RecipeEntryStatus;
  /** Optional personal rating, 1..5. */
  rating: number | null;
  /** Optional personal note about the recipe. */
  note: string | null;
  /** Optional, voluntary note about how the person felt afterwards. */
  feelingNote: string | null;
  createdAt: string;
  updatedAt: string;
}

/** A history line with the recipe already joined, ready for the UI. */
export interface RecipeEntryWithDish extends RecipeEntry {
  dish: Dish;
}

export interface Favorite {
  userId: number;
  dishId: number;
  createdAt: string;
}

export interface FavoriteWithDish extends Favorite {
  dish: Dish;
}

/**
 * A preference the user explicitly agreed to keep. `value` is always a string
 * so the table stays simple and the frontend can render whatever it needs.
 */
export interface SavedPreference {
  userId: number;
  key: string;
  value: string;
  createdAt: string;
}

/** The catalogue of preference keys the app knows how to save and explain. */
export const SAVED_PREFERENCE_KEYS = [
  "maxPrepMinutes",
  "favouriteCategory",
  "favouriteIngredient",
  "simpleInstructions",
  "vegetarian",
  "sweetToothed",
] as const;

export type SavedPreferenceKey = (typeof SAVED_PREFERENCE_KEYS)[number];

export const SAVED_PREFERENCE_LABELS_ES: Record<SavedPreferenceKey, string> = {
  maxPrepMinutes: "Prefiere recetas de menos de 30 minutos",
  favouriteCategory: "Le gustan las preparaciones con pasta",
  favouriteIngredient: "Le gusta cocinar con setas",
  simpleInstructions: "Prefiere instrucciones sencillas",
  vegetarian: "Suele elegir recetas vegetarianas",
  sweetToothed: "Suele pedir algo dulce",
};

export function isSavedPreferenceKey(value: string): value is SavedPreferenceKey {
  return (SAVED_PREFERENCE_KEYS as readonly string[]).includes(value);
}
