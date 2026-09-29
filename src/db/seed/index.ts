import { MOODS } from "./moods.ts";
import { BREAKFAST_DISHES } from "./dishes.breakfast.ts";
import { LUNCH_DISHES } from "./dishes.lunch.ts";
import { DINNER_DISHES } from "./dishes.dinner.ts";
import { SNACK_DISHES } from "./dishes.snack.ts";
import { DESSERT_DISHES } from "./dishes.dessert.ts";
import { DRINK_DISHES } from "./dishes.drinks.ts";
import type { DishSeed } from "./types.ts";

export { MOODS, type MoodSeed } from "./moods.ts";
export type { DishSeed } from "./types.ts";

export const ALL_DISHES: DishSeed[] = [
  ...BREAKFAST_DISHES,
  ...LUNCH_DISHES,
  ...DINNER_DISHES,
  ...SNACK_DISHES,
  ...DESSERT_DISHES,
  ...DRINK_DISHES,
];

export const DISH_COUNT = ALL_DISHES.length;
