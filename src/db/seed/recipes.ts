import { RECIPES_A } from "./recipes.a.ts";
import { RECIPES_B } from "./recipes.b.ts";
import { RECIPES_C } from "./recipes.c.ts";
import type { RecipeMap } from "./recipes.types.ts";

export type { RecipeDetail, RecipeMap } from "./recipes.types.ts";

export const RECIPES: RecipeMap = {
  ...RECIPES_A,
  ...RECIPES_B,
  ...RECIPES_C,
};
